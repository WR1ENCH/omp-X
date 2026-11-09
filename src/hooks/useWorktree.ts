import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { WorktreeState, WorktreeInfo } from '@/types/dock'
import { isTauri } from '@/lib/tauri'

/**
 * `worktree_list` returns JSON. The Rust `WorktreeInfo` models `branch`/`commit`
 * as `Option<String>`; the frontend type uses plain strings, so empty means
 * "not reported" (a bare or detached worktree has no branch).
 */
interface RustWorktreeInfo {
  path: string
  branch?: string | null
  commit?: string | null
  bare?: boolean
  detached?: boolean
  locked?: boolean
  prunable?: boolean
}

function normalizeWorktree(info: RustWorktreeInfo): WorktreeInfo {
  return {
    path: info.path,
    branch: info.branch ?? '',
    commit: info.commit ?? '',
    bare: info.bare ?? false,
    detached: info.detached ?? false,
    locked: info.locked ?? false,
    prunable: info.prunable ?? false,
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return 'Unknown error'
  }
}

export function useWorktree(repoPath?: string) {
  const { t } = useTranslation()
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  const [state, setState] = useState<WorktreeState>({
    worktrees: [],
    loading: false,
    error: null,
    creating: false,
  })

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      setState({
        worktrees: [],
        loading: false,
        error: tRef.current('dock.worktree_group.tauriOnly'),
        creating: false,
      })
      return
    }

    if (!repoPath) {
      setState({
        worktrees: [],
        loading: false,
        error: tRef.current('dock.worktree_group.noRepo'),
        creating: false,
      })
      return
    }

    setState((s) => ({ ...s, loading: true, error: null }))

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const list = await invoke<RustWorktreeInfo[]>('worktree_list', { repoPath })
      setState((s) => ({
        ...s,
        worktrees: (list ?? []).map(normalizeWorktree),
        loading: false,
      }))
    } catch (err) {
      console.error('[worktree] list failed', err)
      setState((s) => ({ ...s, loading: false, error: errorMessage(err) }))
    }
  }, [repoPath])

  const create = useCallback(
    async (path: string, branch: string, baseBranch?: string): Promise<boolean> => {
      if (!isTauri() || !repoPath) {
        await refresh()
        return false
      }

      setState((s) => ({ ...s, creating: true, error: null }))

      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke<RustWorktreeInfo>('worktree_create', {
          repoPath,
          path,
          branch,
          baseBranch: baseBranch ?? null,
        })
        await refresh()
        setState((s) => ({ ...s, creating: false }))
        return true
      } catch (err) {
        console.error('[worktree] create failed', err)
        setState((s) => ({ ...s, creating: false, error: errorMessage(err) }))
        return false
      }
    },
    [repoPath, refresh]
  )

  const remove = useCallback(
    async (path: string, force = false) => {
      if (!isTauri() || !repoPath) {
        await refresh()
        return
      }

      setState((s) => ({ ...s, error: null }))

      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('worktree_remove', { repoPath, path, force })
        await refresh()
      } catch (err) {
        console.error('[worktree] remove failed', err)
        setState((s) => ({ ...s, error: errorMessage(err) }))
      }
    },
    [repoPath, refresh]
  )

  const prune = useCallback(async () => {
    if (!isTauri() || !repoPath) {
      await refresh()
      return
    }

    setState((s) => ({ ...s, error: null }))

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('worktree_prune', { repoPath })
      await refresh()
    } catch (err) {
      console.error('[worktree] prune failed', err)
      setState((s) => ({ ...s, error: errorMessage(err) }))
    }
  }, [repoPath, refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    ...state,
    refresh,
    create,
    remove,
    prune,
  }
}

export type { WorktreeInfo }

export type UseWorktreeReturn = ReturnType<typeof useWorktree>
