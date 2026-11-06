import { onBeforeUnmount, ref } from 'vue';

/** The time, ticking every `everyMs`: enough for "2 min ago" without redrawing every second. */
export function useNow(everyMs = 30_000) {
  const now = ref(Date.now());
  const timer = setInterval(() => (now.value = Date.now()), everyMs);
  onBeforeUnmount(() => clearInterval(timer));
  return now;
}

/** "now", "1 min ago", "12 min ago", "1 h ago". */
export function ago(atMs: number, nowMs: number): string {
  const minutes = Math.floor((nowMs - atMs) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}
