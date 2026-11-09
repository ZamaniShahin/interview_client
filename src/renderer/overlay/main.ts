import { createPinia } from 'pinia';
import { createApp } from 'vue';
import '../shared/styles/tokens.css';
import '../shared/styles/base.css';
import '../shared/styles/answer.css';
import { removeTitles } from '../shared/no-titles';
import HidingTestCard from './HidingTestCard.vue';
import OverlayApp from './OverlayApp.vue';

removeTitles(document.body);
// The same window shows only Test hiding's card when the setup asks for it (F1 · 5b).
const root = location.hash === '#hiding-test' ? HidingTestCard : OverlayApp;
createApp(root).use(createPinia()).mount('#app');
