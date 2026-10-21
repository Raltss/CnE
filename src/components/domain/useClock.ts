import { useState } from 'react'
import { api } from '../../data/api'
import { usePersonAttendance } from '../../data/queries'
import { useSession } from '../../session/context'
import { formatTime } from '../../lib/time'
import { useToast } from '../ui/toast-context'

/** Clock-in/out for the signed-in person, shared by the pill, the card, and the Time Clock panel. */
export function useClock() {
  const { me } = useSession()
  const toast = useToast()
  const [confirmingOut, setConfirmingOut] = useState(false)
  const [busy, setBusy] = useState(false)
  // The same cached query as Time Clock and My Work (last 31 days), so it isn't fetched twice.
  const sessions = usePersonAttendance(me.id)
  const session = sessions.data?.find((s) => s.clockOut === null) ?? null

  const clockIn = async () => {
    if (busy) return
    setBusy(true)
    const result = await api.clockIn()
    setBusy(false)
    if (result.ok) toast.show(`Clocked in at ${formatTime(new Date().toISOString())} PHT`)
    else toast.show(result.error, 'error')
  }

  const clockOut = async () => {
    setConfirmingOut(false)
    setBusy(true)
    const result = await api.clockOut()
    setBusy(false)
    if (result.ok) toast.show(`Clocked out at ${formatTime(new Date().toISOString())} PHT`)
    else toast.show(result.error, 'error')
  }

  return {
    session,
    loading: sessions.isPending,
    busy,
    clockIn,
    clockOut,
    confirmingOut,
    askClockOut: () => setConfirmingOut(true),
    cancelClockOut: () => setConfirmingOut(false),
  }
}
