// The hub connection lives in main only: tokens never reach a renderer, and an overlay reload doesn't drop the session.
// One connection carries one access token, fixed when it opens: the device proofs of StartSession and ResumeSession
// are bound to it (`ath`). The session driver (session/hub-driver.ts) opens a new one to resume.
import { HttpTransportType, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack';
import {
  Protocol,
  registerLiveClient,
  type HubConnectionLike,
  type LiveClient,
} from '../../shared/contracts/sotto-contracts';

/** What the session driver needs of a connection; a fake stands in for it in tests. */
export interface LiveTransport {
  readonly connection: HubConnectionLike;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Called when the connection closes by itself (a drop) or is stopped. */
  onClose(listener: (error?: Error) => void): void;
}

export interface LiveTransportOptions {
  apiBaseUrl: string;
  /** This build's version, checked by the server against the minimum it accepts. */
  clientVersion: string;
  accessToken: string;
  /** This computer's proof for the handshake, bound to `accessToken`: the server opens no connection without one. */
  deviceProof: string;
  /**
   * The DPoP proof for the handshake (GET on the hub's URL), from the key `accessToken` is bound to (Q44): the
   * server takes the token only with it.
   */
  dpopProof: string;
  events: LiveClient;
}

export function createLiveTransport(options: LiveTransportOptions): LiveTransport {
  const url = new URL(Protocol.HubPath, options.apiBaseUrl);
  url.searchParams.set('pv', String(Protocol.Version));

  const connection = new HubConnectionBuilder()
    .withUrl(url.href, {
      // The server maps the hub on WebSockets only (backend decisions, 1.2–1.4). Under Node, SignalR sends these headers
      // on the handshake (it uses its own `ws` dependency, which can set headers). The token goes in them under the
      // DPoP scheme: SignalR's own accessTokenFactory would send it as a Bearer token, which the server refuses for a
      // token bound to a key.
      transport: HttpTransportType.WebSockets,
      skipNegotiation: true,
      headers: {
        Authorization: `${Protocol.DpopScheme} ${options.accessToken}`,
        [Protocol.DpopHeader]: options.dpopProof,
        [Protocol.ClientVersionHeader]: options.clientVersion,
        [Protocol.DeviceProofHeader]: options.deviceProof,
      },
    })
    // Contractless MessagePack, keys spelled as the C# names: the contract's types already spell them so.
    .withHubProtocol(new MessagePackHubProtocol())
    // No automatic reconnect: after a drop the session must be resumed (ResumeSession with LastSeq), which the
    // built-in retry knows nothing about. The driver reconnects and resumes itself.
    .configureLogging(LogLevel.Warning)
    .build();

  registerLiveClient(connection, options.events);
  return {
    connection,
    start: () => connection.start(),
    stop: () => connection.stop(),
    onClose: (listener) => connection.onclose(listener),
  };
}
