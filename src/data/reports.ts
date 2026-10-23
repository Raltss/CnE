// What the Reports page shows, computed from delivered packages (usePackageReport).
// Pure functions, so every number can be checked against the rows it came from.
//
//  delivered     first sent to the client, or approved without client review, in the period
//  on time       first delivery at or before the final deadline
//  first pass    Round 1 was approved (sent to the client or completed) without internal changes
//  revisions     internal = rounds a manager sent back; client = rounds the client sent back
//  extra         client revisions beyond the product's included revisions
//  turnaround    created → first delivery (median, so one stuck package doesn't skew it)
import type { ReportPackage } from './types'

export interface ReportSummary {
  delivered: number
  onTime: number
  firstPass: number
  rounds: number
  internalRevisions: number
  clientRevisions: number
  /** Client revisions beyond the product's allowance, summed over packages. */
  extraRevisions: number
  /** Packages with at least one extra revision. */
  overAllowance: number
  /** Median created → first delivery, in ms (null when nothing was delivered). */
  turnaroundMs: number | null
  /** Median sent to the client → the client's decision, in ms (null when no client decided). */
  clientResponseMs: number | null
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const ms = (iso: string) => new Date(iso).getTime()

/** Client revisions this package used, and how many went over its product's allowance. */
export function packageRevisions(pkg: ReportPackage, included: number | null) {
  const client = pkg.rounds.filter((r) => r.outcome === 'client_feedback').length
  const internal = pkg.rounds.filter((r) => r.outcome === 'feedback').length
  return { client, internal, extra: included === null ? 0 : Math.max(0, client - included) }
}

export function summarize(rows: ReportPackage[], includedFor: (productId: string) => number | null): ReportSummary {
  const summary: ReportSummary = {
    delivered: rows.length,
    onTime: 0,
    firstPass: 0,
    rounds: 0,
    internalRevisions: 0,
    clientRevisions: 0,
    extraRevisions: 0,
    overAllowance: 0,
    turnaroundMs: null,
    clientResponseMs: null,
  }
  const turnaround: number[] = []
  const response: number[] = []
  for (const pkg of rows) {
    const revisions = packageRevisions(pkg, includedFor(pkg.productId))
    if (ms(pkg.firstDeliveredAt) <= ms(pkg.deadline)) summary.onTime += 1
    if (pkg.rounds[0] && pkg.rounds[0].outcome !== 'feedback') summary.firstPass += 1
    summary.rounds += pkg.rounds.length
    summary.internalRevisions += revisions.internal
    summary.clientRevisions += revisions.client
    summary.extraRevisions += revisions.extra
    if (revisions.extra > 0) summary.overAllowance += 1
    turnaround.push(ms(pkg.firstDeliveredAt) - ms(pkg.createdAt))
    for (const r of pkg.rounds) if (r.sentToClientAt && r.clientDecidedAt) response.push(ms(r.clientDecidedAt) - ms(r.sentToClientAt))
  }
  summary.turnaroundMs = median(turnaround)
  summary.clientResponseMs = median(response)
  return summary
}

/** Rows grouped by a key, e.g. editor or product. */
export function groupBy(rows: ReportPackage[], key: (pkg: ReportPackage) => string) {
  const groups = new Map<string, ReportPackage[]>()
  for (const pkg of rows) groups.set(key(pkg), [...(groups.get(key(pkg)) ?? []), pkg])
  return groups
}

/** "83%", or "—" when there's nothing to divide by. */
export const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—')

/** Average with one decimal, e.g. "1.4"; "—" for none. */
export const average = (total: number, count: number) => (count ? (total / count).toFixed(1) : '—')
