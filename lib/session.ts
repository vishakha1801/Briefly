export function newSessionId(): string {
  return `call_${Math.random().toString(36).slice(2, 10)}`;
}
