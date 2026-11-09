<script setup lang="ts">
// A computer of the account. Removing one asks first, in place: it is signed out and can never be added back, and
// the account may remove 3 in 30 days (the server enforces both).
import { ref } from 'vue';
import type { DeviceView } from '../../../shared/account';
import SButton from '../../shared/components/SButton.vue';
import SConfirm from '../../shared/components/SConfirm.vue';
import SIcon from '../../shared/components/SIcon.vue';

const props = defineProps<{ device: DeviceView; canRemove: boolean }>();
const emit = defineEmits<{ remove: [id: string] }>();
const confirming = ref(false);

function remove(): void {
  confirming.value = false;
  emit('remove', props.device.id);
}
</script>

<template>
  <div class="device">
    <div class="row">
      <SIcon name="computer" :size="20" />
      <div class="main">
        <p class="title">{{ device.name }}<span v-if="device.isThisComputer" class="tag">This computer</span></p>
        <p class="small">
          {{ device.platform }} · {{ device.appVersion }} · first seen {{ device.firstSeen }} · last seen
          {{ device.lastSeen }}
        </p>
      </div>
      <SButton
        v-if="!device.isThisComputer"
        variant="danger"
        size="sm"
        :disabled="!canRemove"
        @click="confirming = true"
        >Remove</SButton
      >
    </div>
    <SConfirm
      v-if="confirming"
      :question="`Remove ${device.name}?`"
      detail="It is signed out and can't be added back."
      :confirm-label="`Remove ${device.name}`"
      destructive
      @confirm="remove"
      @cancel="confirming = false"
    />
  </div>
</template>

<style scoped>
.device {
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 36px;
}
.main {
  flex: 1;
  min-width: 0;
}
.title {
  color: var(--text-0);
  font: 600 14px/20px var(--font-sans);
}
.tag {
  margin-left: 6px;
  padding: 1px 6px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  color: var(--text-1);
  font: 500 11px/16px var(--font-sans);
}
.device :deep(.confirm) {
  margin-top: 8px;
}
</style>
