<script setup lang="ts">
// The one calm line under the strip (src/shared/live/copy.ts decides which). Bold lead, plain rest, an action slot.
import { computed } from 'vue';
import type { OverlayBanner } from '../../../shared/live/copy';
import type { IconName } from '../../shared/icons';
import SIcon from '../../shared/components/SIcon.vue';

const props = defineProps<{ banner: OverlayBanner }>();

const iconOf: Record<OverlayBanner['icon'], IconName> = {
  attention: 'attention',
  info: 'info',
  pause: 'pause',
  reconnect: 'reconnect',
  clock: 'clock',
  bolt: 'bolt',
};
const icon = computed(() => iconOf[props.banner.icon]);
</script>

<template>
  <div class="banner" role="status">
    <SIcon :name="icon" />
    <span class="text"><b>{{ banner.lead }}</b> {{ banner.rest }}</span>
    <span v-if="$slots.default" class="action"><slot /></span>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 10px 0;
  padding: 8px 10px;
  flex: none;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-1);
  font: 400 13px/18px var(--font-sans);
}
.banner > :first-child {
  color: var(--text-0);
}
.text {
  flex: 1;
}
b {
  color: var(--text-0);
  font-weight: 600;
}
.action {
  flex: none;
}
</style>
