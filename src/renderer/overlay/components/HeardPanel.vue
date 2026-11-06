<script setup lang="ts">
// The interviewer's words towards the next question. Finished words are brighter; the phrase still being spoken is
// dimmer and ends at the caret. In MANUAL the words pile up until Answer; the oldest fade at the top.
defineProps<{ finished: string; live: string; pile: boolean; placeholder: string; canClear: boolean }>();
const emit = defineEmits<{ clear: [] }>();
</script>

<template>
  <section class="heard" :class="{ pile }" aria-label="Heard">
    <div class="head">
      <h2 class="eyebrow">Heard</h2>
      <button type="button" class="link" :disabled="!canClear" @click="emit('clear')">Clear</button>
    </div>
    <p v-if="!finished && !live" class="text empty">{{ placeholder }}</p>
    <p v-else class="text" aria-live="off">
      <span>{{ finished }}</span>
      <template v-if="live">
        {{ ' ' }}<span class="live">{{ live }}</span><span class="caret" aria-hidden="true" />
      </template>
    </p>
  </section>
</template>

<style scoped>
.heard {
  flex: none;
  padding: 8px 12px 10px;
  border-bottom: 1px solid var(--line);
}
.head {
  display: flex;
  align-items: center;
  height: 22px;
  margin-bottom: 2px;
}
.link {
  margin-left: auto;
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-2);
  font: 600 12px/16px var(--font-sans);
}
.link:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text-0);
}
.link:disabled {
  color: var(--text-off);
}
.text {
  color: var(--text-1);
  font: 400 14px/20px var(--font-sans);
}
.text.empty,
.live {
  color: var(--text-3);
}
.pile .text {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  max-height: 140px;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, transparent 0, #000 28px);
}
.caret {
  display: inline-block;
  width: 2px;
  height: 16px;
  margin-left: 2px;
  vertical-align: -3px;
  background: var(--text-2);
}
</style>
