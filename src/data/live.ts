// Live updates from Supabase Realtime, refreshing only what another person changed.
//
//  activity            every package change writes one (create, edit, start, submit,
//                      feedback, approve), so it alone tells us which package moved.
//                      Changes made in this tab are skipped: api.ts already refreshed
//                      them. The same person's changes in another tab still refresh.
//  attendance_sessions someone clocked in or out, or a session was auto-closed.
//  notifications       only ours (filtered), e.g. a new assignment or submission. A new
//                      one also refreshes current work: an editor whose package was
//                      reassigned can no longer read its activity, only this notice.
//
// Events arriving together (one change writes several rows) are merged into one
// refresh per list, and only lists on screen refetch. Realtime applies RLS, so
// nobody is told about rows they can't read.
import { useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { keys } from './queries'
import type { AppNotification, Page } from './types'

/** A change made in this tab comes back as an event too; api.ts already refreshed for it. */
let ownChangeUntil = 0
export function markOwnChange() {
  ownChangeUntil = Date.now() + 3000
}

const MERGE_MS = 200

export function useLiveUpdates(personId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!supabase) return
    const db = supabase
    const pending = new Map<string, QueryKey>()
    let timer: number | undefined
    const refresh = (...queryKeys: QueryKey[]) => {
      for (const key of queryKeys) pending.set(JSON.stringify(key), key)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        for (const queryKey of pending.values()) void queryClient.invalidateQueries({ queryKey })
        pending.clear()
      }, MERGE_MS)
    }

    /** True when a cached notification list already shows this row as it is now. */
    const notificationUpToDate = (row: { id?: string; read_at?: string | null }) =>
      queryClient
        .getQueriesData<InfiniteData<Page<AppNotification>>>({ queryKey: ['notifications', 'list', personId] })
        .some(([, data]) => data?.pages.some((page) => page.rows.some((n) => n.id === row.id && Boolean(n.readAt) === Boolean(row.read_at))))

    const fromThisTab = (who: string | undefined) => who === personId && Date.now() < ownChangeUntil

    const channel = db
      .channel(`cne-live-${personId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, ({ new: row }) => {
        if (fromThisTab(row.actor_id)) return
        refresh(keys.activeWork, keys.package(row.package_id), ['finished'], ['rounds'], ['recent'])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions' }, (change) => {
        const row = (change.eventType === 'DELETE' ? change.old : change.new) as { person_id?: string }
        if (fromThisTab(row.person_id)) return
        refresh(['attendance'])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${personId}` }, (change) => {
        if (change.eventType === 'UPDATE' && notificationUpToDate(change.new)) return
        refresh(['notifications', 'list', personId], keys.unreadCount(personId))
        if (change.eventType === 'INSERT') refresh(keys.activeWork, keys.package(change.new.package_id))
      })
      .subscribe()

    return () => {
      window.clearTimeout(timer)
      void db.removeChannel(channel)
    }
  }, [personId, queryClient])
}
