<script setup lang="ts">
// The first run's steps (F1). Done: a tick. Current: filled, bold, aria-current. Later steps can't be skipped to.
import SIcon from './SIcon.vue';

defineProps<{ steps: string[]; current: number }>();
</script>

<template>
  <ol class="stepper" aria-label="Setup steps">
    <template v-for="(step, i) in steps" :key="step">
      <li v-if="i > 0" class="line" aria-hidden="true" />
      <li class="step" :class="{ done: i < current, current: i === current }" :aria-current="i === current ? 'step' : undefined">
        <span class="n">
          <SIcon v-if="i < current" name="check" :size="12" />
          <template v-else>{{ i + 1 }}</template>
        </span>
        {{ step }}
      </li>
    </template>
  </ol>
</template>

<style scoped>
.stepper {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.step {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-3);
  font: 500 12px/16px var(--font-sans);
  white-space: nowrap;
}
.n {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--edge);
  border-radius: 50%;
  color: var(--text-2);
  font: 600 11px/1 var(--font-sans);
}
.done {
  color: var(--text-2);
}
.done .n {
  border-color: var(--surface-3);
  background: var(--surface-3);
  color: var(--text-0);
}
.current {
  color: var(--text-0);
  font-weight: 600;
}
.current .n {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--on-primary);
}
.line {
  width: 20px;
  height: 1px;
  background: var(--line-2);
}
</style>
