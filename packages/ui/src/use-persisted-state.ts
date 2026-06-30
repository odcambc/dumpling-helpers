import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * A drop-in replacement for `useState` that mirrors its value into
 * `localStorage` under `key` and rehydrates from there on first mount.
 *
 * Reads are guarded: a missing key, unavailable storage, or corrupt JSON all
 * fall back to `initial` rather than throwing. Writes are best-effort and
 * swallow quota/availability errors. Namespace + version your keys (e.g.
 * `souschef:dumpling:rows:v1`) so a future shape change can be invalidated by
 * bumping the version rather than crashing on stale data.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // Storage unavailable or over quota — persistence is best-effort.
    }
  }, [key, state])

  return [state, setState]
}
