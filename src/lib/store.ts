import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauri'

/**
 * tauri-plugin-store 2.5 bridge.
 *
 * The plugin is invoked through its namespaced commands:
 *   plugin:store|load  { path }                    -> rid
 *   plugin:store|get   { rid, key }                -> [value, exists]
 *   plugin:store|set   { rid, key, value }         -> ()
 *   plugin:store|save  { rid }                     -> ()
 *
 * The previous implementation called get/set without a rid and treated the
 * result as the value itself, so persistence never worked.
 */

const ridCache = new Map<string, number>()
const LS_PREFIX = 'omp-x:store:'

async function resolveRid(path: string): Promise<number | null> {
  const cached = ridCache.get(path)
  if (cached !== undefined) return cached
  if (!isTauri()) return null
  try {
    const rid = await invoke<number>('plugin:store|load', { path })
    ridCache.set(path, rid)
    return rid
  } catch (err) {
    console.error(`[store] load "${path}" failed`, err)
    return null
  }
}

/** Load (or create) a store file. Safe to call repeatedly. */
export async function storeLoad(path: string): Promise<void> {
  await resolveRid(path)
}

export async function storeGet<T>(path: string, key: string): Promise<T | null> {
  if (!isTauri()) {
    try {
      const raw = localStorage.getItem(`${LS_PREFIX}${path}:${key}`)
      // `raw == null` covers both null (real browsers) and undefined (test mocks
      // / non-conforming storage implementations).
      return raw == null ? null : (JSON.parse(raw) as T)
    } catch (err) {
      console.error(`[store] browser get "${path}:${key}" failed`, err)
      return null
    }
  }
  const rid = await resolveRid(path)
  if (rid === null) return null
  try {
    const result = await invoke<[T | null, boolean]>('plugin:store|get', { rid, key })
    const [value, exists] = result ?? [null, false]
    return exists ? value : null
  } catch (err) {
    console.error(`[store] get "${path}:${key}" failed`, err)
    return null
  }
}

export async function storeSet<T>(path: string, key: string, value: T): Promise<void> {
  if (!isTauri()) {
    try {
      localStorage.setItem(`${LS_PREFIX}${path}:${key}`, JSON.stringify(value))
    } catch (err) {
      console.error(`[store] browser set "${path}:${key}" failed`, err)
    }
    return
  }
  const rid = await resolveRid(path)
  if (rid === null) return
  try {
    await invoke('plugin:store|set', { rid, key, value })
  } catch (err) {
    console.error(`[store] set "${path}:${key}" failed`, err)
  }
}

export async function storeSave(path: string): Promise<void> {
  if (!isTauri()) return
  const rid = await resolveRid(path)
  if (rid === null) return
  try {
    await invoke('plugin:store|save', { rid })
  } catch (err) {
    console.error(`[store] save "${path}" failed`, err)
  }
}

/** Test hook: drop cached rids so the next call reloads from disk. */
export function _clearRidCache(): void {
  ridCache.clear()
}
