export function freezeTime(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

export function unfreezeTime() {
  vi.useRealTimers();
}
