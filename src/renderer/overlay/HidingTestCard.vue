<script setup lang="ts">
// Test hiding's card (F1 · 5b): the overlay window, with all its protections, showing only this. The user looks at what
// their share sends: the card should not be in it. It calls nothing in main (the setup window does the asking), so it
// keeps the dark theme whatever the settings say.
import SIcon from '../shared/components/SIcon.vue';
</script>

<template>
  <main class="test" aria-labelledby="test-title">
    <div class="card">
      <SIcon name="shield" :size="24" class="shield" />
      <h1 id="test-title" class="title">Testing hiding</h1>
      <p class="body">This is Sotto's overlay, as it shows during a session.</p>
      <p class="body">
        If your share or recording shows this card, go back to the setup window and choose "I can see it in the share".
      </p>
    </div>
  </main>
</template>

<style scoped>
.test {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  background: var(--surface-0);
}
.card {
  max-width: 320px;
  padding: 20px;
  border: 1px solid var(--line-2);
  border-radius: 12px;
  background: var(--surface-1);
}
.shield {
  color: var(--text-0);
}
.title {
  margin: 10px 0 8px;
  color: var(--text-0);
  font: 600 18px/24px var(--font-sans);
}
.body {
  margin-bottom: 8px;
  color: var(--text-1);
  font: 400 14px/20px var(--font-sans);
}
</style>
