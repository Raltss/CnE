/** Position of an instant on [start, end] as a percentage, clamped to the track (the playhead device). */
export function trackPercent(at: number, start: number, end: number) {
  return Math.min(100, Math.max(0, ((at - start) / (end - start)) * 100))
}
