type Listener = () => void

const listeners = new Map<string, Set<Listener>>()

export const subscribe = (keys: string[], listener: Listener): (() => void) => {
  for (const key of keys) {
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key)!.add(listener)
  }
  return () => {
    for (const key of keys) {
      listeners.get(key)?.delete(listener)
    }
  }
}

export const invalidate = (...keys: string[]) => {
  const notified = new Set<Listener>()
  for (const key of keys) {
    const set = listeners.get(key)
    if (!set) continue
    for (const listener of set) {
      if (!notified.has(listener)) {
        notified.add(listener)
        listener()
      }
    }
  }
}
