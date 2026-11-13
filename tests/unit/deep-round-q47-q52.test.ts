// The deep round over the server's Q52 and Q47 as the overlay shows them (2026-11-13): long random streams of events,
// seeded, through the overlay's state, checked after every event against a small model of the rules: the gap filler's
// life (up, claimed, taken down) and the interview's type (the server's word, odd spellings ignored). Then every outcome
// of each is shown to occur.
import { createHash, createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DpopKeys, signDpopProof } from '../../src/main/auth/dpop';
import { MemorySecretStore } from '../../src/main/auth/secret-store';
import {
  AnswerKind,
  ErrorCodes,
  SessionEndReasons,
  SessionPhase,
  type SessionSnapshot,
} from '../../src/shared/contracts/sotto-contracts';
import { reduceLive, type LiveAction, type LiveEvent } from '../../src/shared/live/reducer';
import { initialLiveState, type LiveViewState } from '../../src/shared/live/view-state';

/** A seeded generator (mulberry32): the same stream on every run. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lines = ['Hmm.... let me think....', 'Okay.... one comes to mind....', 'Right.... let me break it down....'];
const types = ['technical', 'intro', 'Intro', '', 'casual'];

interface Model {
  filler: { text: string; answerId: string | null } | null;
  type: 'technical' | 'intro';
  ended: boolean;
}

function snapshot(InterviewType: string, LastSeq: number): SessionSnapshot {
  return {
    SessionId: 's',
    Phase: SessionPhase.Live,
    Auto: true,
    Paused: false,
    ContextReady: true,
    Heard: '',
    LastSeq,
    Attachments: [],
    MaxAttachments: 5,
    PrepDoc: null,
    CustomInstructionsChars: 0,
    PreparedInPrompt: [],
    Practice: null,
    InterviewType,
  };
}

/** One random step: the action, and what the model says follows. */
function step(random: () => number, seq: number, model: Model, answers: string[]): LiveAction {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]!;
  const stamp = { Seq: seq, AtMs: seq };
  const known = (t: string) => (t === 'technical' || t === 'intro' ? t : null);
  const ev = (event: LiveEvent): LiveAction => ({ type: 'event', event });
  const ends = (id: string) => {
    if (model.filler?.answerId === id) model.filler = null;
  };
  switch (Math.floor(random() * 11)) {
    case 0: {
      const text = random() < 0.25 ? pick(['', '  ']) : pick(lines);
      model.filler = text.trim() ? { text, answerId: null } : null;
      return ev({ name: 'gapFiller', e: { ...stamp, Text: text } });
    }
    case 1: {
      const id = `a${seq}`;
      answers.push(id);
      if (model.filler && model.filler.answerId === null) model.filler = { ...model.filler, answerId: id };
      return ev({
        name: 'answerStart',
        e: { ...stamp, AnswerId: id, Question: 'Q?', Kind: AnswerKind.Spoken, Instruction: null, ScreenshotIds: [] },
      });
    }
    case 2:
    case 3: {
      const id = answers.length ? pick(answers) : 'none';
      ends(id);
      return ev({ name: 'answerDelta', e: { ...stamp, AnswerId: id, Text: 'text ' } });
    }
    case 4: {
      const id = answers.length ? pick(answers) : 'none';
      ends(id);
      return ev({ name: 'answerDone', e: { ...stamp, AnswerId: id } });
    }
    case 5: {
      const id = answers.length ? pick(answers) : 'none';
      ends(id);
      return pick([
        ev({ name: 'answerCancelled', e: { ...stamp, AnswerId: id } }),
        ev({
          name: 'answerFailed',
          e: { ...stamp, AnswerId: id, Code: ErrorCodes.Ai.ProviderUnavailable, Message: 'No.' },
        }),
      ]);
    }
    case 6: {
      const t = pick(types);
      model.type = known(t) ?? model.type;
      return ev({ name: 'status', e: { ...stamp, Auto: true, Paused: false, Stt: 'ok', InterviewType: t } });
    }
    case 7:
      model.filler = null;
      return ev({ name: 'cleared', e: stamp });
    case 8: {
      const t = pick(types);
      model.type = known(t) ?? model.type;
      model.filler = null;
      return { type: 'snapshot', snapshot: snapshot(t, seq) };
    }
    case 9:
      // Nothing to do with either: a partial, a notice.
      return random() < 0.5
        ? ev({ name: 'transcriptPartial', e: { ...stamp, Text: 'And' } })
        : ev({ name: 'notice', e: { ...stamp, Code: 'x', Text: 'Note.' } });
    default:
      if (random() < 0.1) {
        model.filler = null;
        model.ended = true;
        return ev({ name: 'sessionEnded', e: { ...stamp, Reason: SessionEndReasons.User } });
      }
      return ev({ name: 'speechStarted', e: stamp });
  }
}

describe('the deep round over Q47 and Q52 in the overlay', () => {
  it.each(Array.from({ length: 80 }, (_, i) => i + 1))('random stream %i keeps every rule', (seed) => {
    const random = generator(seed);
    const model: Model = { filler: null, type: 'technical', ended: false };
    const answers: string[] = [];
    let state: LiveViewState = initialLiveState;
    for (let seq = 1; seq <= 120 && !model.ended; seq++) {
      state = reduceLive(state, step(random, seq, model, answers));
      expect(state.gapFiller).toEqual(model.filler);
      expect(state.interviewType).toBe(model.type);
      expect(['technical', 'intro']).toContain(state.interviewType);
    }
  });

  it('every outcome of the line and the type occurs over the streams', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const random = generator(seed);
      const model: Model = { filler: null, type: 'technical', ended: false };
      const answers: string[] = [];
      let state: LiveViewState = initialLiveState;
      for (let seq = 1; seq <= 120 && !model.ended; seq++) {
        const before = state;
        const action = step(random, seq, model, answers);
        state = reduceLive(state, action);
        const name = action.type === 'event' ? action.event.name : action.type;
        if (!before.gapFiller && state.gapFiller) outcomes.add('line up');
        if (before.gapFiller && state.gapFiller && before.gapFiller.text !== state.gapFiller.text)
          outcomes.add('line replaced');
        if (before.gapFiller?.answerId === null && state.gapFiller?.answerId) outcomes.add('line claimed');
        if (before.gapFiller && !state.gapFiller) outcomes.add(`line down by ${name}`);
        if (
          before.gapFiller?.answerId &&
          state.gapFiller?.answerId === before.gapFiller.answerId &&
          name.startsWith('answer')
        )
          outcomes.add('line kept through an older answer');
        if (before.interviewType !== state.interviewType) outcomes.add(`type to ${state.interviewType} by ${name}`);
        if (name === 'status' && before.interviewType === state.interviewType) outcomes.add('type kept by status');
      }
    }

    expect([...outcomes].sort()).toEqual(
      [
        'line up',
        'line replaced',
        'line claimed',
        'line kept through an older answer',
        'line down by gapFiller',
        'line down by answerDelta',
        'line down by answerDone',
        'line down by answerCancelled',
        'line down by answerFailed',
        'line down by cleared',
        'line down by snapshot',
        'line down by sessionEnded',
        'type to intro by status',
        'type to technical by status',
        'type to intro by snapshot',
        'type to technical by snapshot',
        'type kept by status',
      ].sort(),
    );
  });
});

// ---- DPoP (backend Q44), built the same day: random requests, each proof right ------------------------------------

describe('the deep round over DPoP proofs', () => {
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  const bases = ['https://api.sotto.test', 'http://localhost:5180', 'https://api.example.com:8443'];
  const paths = ['/api/v1/me', '/hubs/live', '/api/v1/jobs/0193', '/api/v1/devices/a%20b', '/'];
  const suffixes = ['', '?x=1', '#frag', '?a=1&b=2#c'];

  it.each(Array.from({ length: 40 }, (_, i) => i + 1))(
    'random request %i gets a proof the server can check',
    async (seed) => {
      const random = generator(seed);
      const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]!;
      const key = await new DpopKeys(new MemorySecretStore()).current();
      const method = pick(methods);
      const base = pick(bases);
      const path = pick(paths);
      const token = random() < 0.2 ? undefined : `token-${Math.floor(random() * 1e9)}`;
      const nowMs = Math.floor(random() * 4e12);

      const proof = signDpopProof({
        key,
        htm: method,
        htu: `${base}${path}${pick(suffixes)}`,
        accessToken: token,
        nowMs,
      });

      const [h, p, s] = proof.split('.');
      const header = JSON.parse(Buffer.from(h!, 'base64url').toString()) as Record<string, unknown>;
      const payload = JSON.parse(Buffer.from(p!, 'base64url').toString()) as Record<string, unknown>;
      expect(header).toEqual({ alg: 'ES256', typ: 'dpop+jwt', jwk: key.publicJwk });
      expect(header['jwk']).not.toHaveProperty('d');
      expect(payload['htm']).toBe(method);
      expect(payload['htu']).toBe(new URL(`${base}${path}`).href);
      expect(payload['iat']).toBe(Math.floor(nowMs / 1000));
      expect(String(payload['jti'])).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(payload['ath']).toBe(token ? createHash('sha256').update(token).digest('base64url') : undefined);
      const publicKey = createPublicKey({ key: { ...key.publicJwk } as JsonWebKey, format: 'jwk' });
      expect(
        verify(
          'sha256',
          Buffer.from(`${h}.${p}`),
          { key: publicKey, dsaEncoding: 'ieee-p1363' },
          Buffer.from(s!, 'base64url'),
        ),
      ).toBe(true);
    },
  );
});
