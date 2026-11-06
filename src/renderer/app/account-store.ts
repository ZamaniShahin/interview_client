// The account as main reports it: from the REST API after sign-in (1.10); from the development preview until then.
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AccountView } from '../../shared/account';
import type { CommandResult } from '../../shared/ipc';

export const useAccountStore = defineStore('account', () => {
  const account = ref<AccountView | null>(null);
  const loaded = ref(false);

  async function load(): Promise<void> {
    account.value = await window.appApi.getAccount();
    loaded.value = true;
  }

  /** The consent box is part of the request, every time (F4): main refuses a start without it. */
  function startSession(consent: boolean): Promise<CommandResult> {
    if (!consent) {
      return Promise.resolve({ ok: false, code: 'invalid_input', message: 'Tick the consent box to start.' });
    }
    return window.appApi.startSession({ consent: true });
  }

  return { account, loaded, load, startSession };
});
