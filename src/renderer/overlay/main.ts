import { createPinia } from 'pinia';
import { createApp } from 'vue';
import '../shared/styles/tokens.css';
import '../shared/styles/base.css';
import '../shared/styles/answer.css';
import { removeTitles } from '../shared/no-titles';
import OverlayApp from './OverlayApp.vue';

removeTitles(document.body);
createApp(OverlayApp).use(createPinia()).mount('#app');
