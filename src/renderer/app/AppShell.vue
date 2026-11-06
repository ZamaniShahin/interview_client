<script setup lang="ts">
// The window outside sessions: its own chrome, the sidebar, and the page. During a session it steps aside and the
// overlay takes over; it comes back when the session is closed.
import { computed, onMounted, ref } from 'vue';
import { useSettings } from '../shared/use-settings';
import { useAccountStore } from './account-store';
import SideNav from './components/SideNav.vue';
import WindowChrome from './components/WindowChrome.vue';
import AccountPage from './pages/AccountPage.vue';
import HomePage from './pages/HomePage.vue';
import LaterPage from './pages/LaterPage.vue';
import PreparePage from './pages/PreparePage.vue';
import SettingsPage from './pages/SettingsPage.vue';

type PageId = 'home' | 'prepare' | 'practice' | 'history' | 'account' | 'settings' | 'help';

const pages: { id: PageId; label: string; icon: 'home' | 'prepare' | 'practice' | 'history' | 'account' | 'settings' | 'help' }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'prepare', label: 'Prepare', icon: 'prepare' },
  { id: 'practice', label: 'Practice', icon: 'practice' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'account', label: 'Account', icon: 'account' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'help', label: 'Help', icon: 'help' },
];

const current = ref<PageId>('home');
const store = useAccountStore();
useSettings(window.appApi);
onMounted(() => void store.load());

const minutes = computed(() => store.account?.minutes ?? null);
const windowAction = (action: 'minimize' | 'maximize' | 'close') => window.appApi.window(action);
</script>

<template>
  <div class="shell">
    <WindowChrome @minimize="windowAction('minimize')" @maximize="windowAction('maximize')" @close="windowAction('close')" />
    <div class="body">
      <SideNav :items="pages" :current="current" @select="(id) => (current = id)">
        <template #footer>
          <p class="eyebrow">Minutes</p>
          <template v-if="minutes">
            <p class="big num">{{ minutes.usable }} min left</p>
            <p class="small">{{ store.account?.plan.name }} plan · renews {{ store.account?.plan.renewsOn }}</p>
          </template>
          <p v-else class="small">Not signed in</p>
        </template>
      </SideNav>
      <main class="main">
        <HomePage v-if="current === 'home'" />
        <PreparePage v-else-if="current === 'prepare'" />
        <AccountPage v-else-if="current === 'account'" />
        <SettingsPage v-else-if="current === 'settings'" />
        <LaterPage
          v-else-if="current === 'practice'"
          heading="Practice"
          text="Mock interviews: the server asks, you answer aloud or by typing, then a score and feedback. Drawn in Claude Design's export; built in the later phase (3.3)."
        />
        <LaterPage
          v-else-if="current === 'history'"
          heading="History"
          text="Your interviews, their questions and answers, and debriefs, kept on this computer, encrypted. Built in the later phase (3.9)."
        />
        <LaterPage
          v-else
          heading="Help"
          text="Run the setup again, and test that Sotto is hidden from screen shares. The setup wizard arrives with the first run (1.14)."
        />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 28px 32px;
}
.big {
  color: var(--text-0);
  font: 600 15px/20px var(--font-sans);
}
</style>
