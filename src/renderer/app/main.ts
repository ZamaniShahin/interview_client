import { createPinia } from 'pinia';
import { createApp } from 'vue';
import '../shared/styles/tokens.css';
import '../shared/styles/base.css';
import { removeTitles } from '../shared/no-titles';
import AppShell from './AppShell.vue';

removeTitles(document.body);
createApp(AppShell).use(createPinia()).mount('#app');
