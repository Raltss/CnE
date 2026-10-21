import { useState } from 'react'
import { useAppState } from '../../data/hooks'
import { api } from '../../data/store'
import { openSession } from '../../data/workflow'
import { useSession } from '../../session/context'
import { formatTime } from '../../lib/time'
import { useToast } from '../ui/toast-context'

/** Clock-in/out for the current demo account, shared by the pill and the attendance card. */
export function useClock() {
  const state = useAppState()
  const { me } = useSession()
  const toast = useToast()
  const [confirmingOut, setConfirmingOut] = useState(false)
  const [busy, setBusy] = useState(false)
  const session = openSession(state, me.id)

  const clockIn = async () => {
    if (busy) return
    setBusy(true)
    const result = await api.clockIn(me.id)
    setBusy(false)
    if (result.ok) toast.show(`Clocked in at ${formatTime(new Date().toISOString())} PHT`)
    else toast.show(result.error, 'error')
  }

  const clockOut = async () => {
    setConfirmingOut(false)
    setBusy(true)
    const result = await api.clockOut(me.id)
    setBusy(false)
    if (result.ok) toast.show(`Clocked out at ${formatTime(new Date().toISOString())} PHT`)
    else toast.show(result.error, 'error')
  }

  return {
    session,
    busy,
    clockIn,
    clockOut,
    confirmingOut,
    askClockOut: () => setConfirmingOut(true),
    cancelClockOut: () => setConfirmingOut(false),
  }
}
