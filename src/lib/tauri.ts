import { invoke as tauriInvoke } from '@tauri-apps/api/core'

/**
 * Runtime detection.
 *
 * Tauri 2 always injects `window.__TAURI_INTERNALS__` into the webview;
 * `window.__TAURI__` only exists when `app.withGlobalTauri` is enabled.
 * Checking only `__TAURI__` (as the previous code did) always returned false.
 */
export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

/**
 * Invoke a command, returning `null` when unavailable or failed.
 * Failures are logged, never silently swallowed.
 */
export async function invokeSafe<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  if (!isTauri()) return null
  try {
    return (await tauriInvoke<T>(cmd, args)) ?? null
  } catch (err) {
    console.error(`[ipc] ${cmd} failed`, err)
    return null
  }
}

/**
 * Invoke a command that must succeed; throws when not running under Tauri
 * or when the command rejects.
 */
export async function invokeRequired<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) {
    throw new Error(`Command "${cmd}" requires the Tauri runtime`)
  }
  return tauriInvoke<T>(cmd, args)
}
