import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { subscribe } from './invalidation'

type QueryState<T> = {
  data: T | undefined
  isLoading: boolean
  error: Error | undefined
}

// Version counter per key set — bumped on invalidation
const versionStore = new Map<string, { version: number; listeners: Set<() => void> }>()

const getStore = (key: string) => {
  if (!versionStore.has(key)) {
    versionStore.set(key, { version: 0, listeners: new Set() })
  }
  return versionStore.get(key)!
}

export const useApiQuery = <T>(
  queryFn: () => Promise<T>,
  keys: string[],
  defaultValue?: T,
): T | undefined => {
  const sortedKey = [...keys].sort().join(',')
  const [state, setState] = useState<QueryState<T>>({
    data: defaultValue,
    isLoading: true,
    error: undefined,
  })

  // Track the version to trigger re-fetches
  const subscribeToVersion = useCallback(
    (onStoreChange: () => void) => {
      const store = getStore(sortedKey)
      store.listeners.add(onStoreChange)
      return () => {
        store.listeners.delete(onStoreChange)
      }
    },
    [sortedKey],
  )

  const getVersion = useCallback(() => getStore(sortedKey).version, [sortedKey])

  const version = useSyncExternalStore(subscribeToVersion, getVersion)

  // Subscribe to invalidation bus — bump the version on invalidation
  useEffect(() => {
    return subscribe(keys, () => {
      const store = getStore(sortedKey)
      store.version++
      for (const listener of store.listeners) {
        listener()
      }
    })
  }, [sortedKey, keys])

  // Fetch data when version changes
  const queryFnRef = useRef(queryFn)
  queryFnRef.current = queryFn

  useEffect(() => {
    let cancelled = false

    setState((prev) => ({ ...prev, isLoading: true, error: undefined }))

    queryFnRef.current()
      .then((data) => {
        if (!cancelled) setState({ data, isLoading: false, error: undefined })
      })
      .catch((error: Error) => {
        if (!cancelled) setState((prev) => ({ ...prev, isLoading: false, error }))
      })

    return () => {
      cancelled = true
    }
  }, [version, sortedKey])

  return state.data
}
