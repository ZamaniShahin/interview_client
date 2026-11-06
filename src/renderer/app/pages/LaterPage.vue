<script setup lang="ts">
// A page whose feature comes later: it says what it will hold, and nothing pretends to work.
// (`heading`, not `title`: the lint rule forbids `title` on any element, components included.)
defineProps<{ heading: string; text: string }>();
</script>

<template>
  <section class="page">
    <h1 class="title">{{ heading }}</h1>
    <p class="lede">{{ text }}</p>
  </section>
</template>

<style scoped>
.title {
  margin-bottom: 4px;
  color: var(--text-0);
  font: 600 24px/32px var(--font-sans);
}
.lede {
  max-width: 560px;
  color: var(--text-2);
}
</style>
