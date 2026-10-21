// All display formatting is pinned to Asia/Manila (UTC+8, no DST).
export const MANILA_TZ = 'Asia/Manila'
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

const dateTimeFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: MANILA_TZ,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const dateFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: MANILA_TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const shortDateFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: MANILA_TZ,
  month: 'short',
  day: 'numeric',
})
const timeFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: MANILA_TZ,
  hour: 'numeric',
  minute: '2-digit',
})
const clockFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: MANILA_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const dateKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANILA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const formatDateTime = (iso: string) => `${dateTimeFmt.format(new Date(iso))} PHT`
export const formatDate = (iso: string) => dateFmt.format(new Date(iso))
export const formatShortDate = (iso: string) => shortDateFmt.format(new Date(iso))
export const formatTime = (iso: string) => timeFmt.format(new Date(iso))
/** 24h "HH:MM" Manila time, for the clock pill. */
export const formatClock = (date: Date) => clockFmt.format(date)

/** Manila calendar date as YYYY-MM-DD. */
export const manilaDateKey = (iso: string) => dateKeyFmt.format(new Date(iso))

/** ISO instant → value for <input type="datetime-local"> interpreted as Manila time. */
export function toManilaInputValue(iso: string): string {
  return new Date(new Date(iso).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 16)
}

/** <input type="datetime-local"> value entered in Manila time → ISO instant, or null if invalid. */
export function fromManilaInputValue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00+08:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

/** Compact distance such as "3d 4h", "5h 12m", or "18m". */
export function formatDistance(ms: number): string {
  const totalMinutes = Math.floor(Math.abs(ms) / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS
