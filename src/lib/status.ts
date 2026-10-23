import {
  Archive,
  Briefcase,
  Check,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleOff,
  Film,
  Hourglass,
  MessageSquareReply,
  Pause,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { Access } from '../data/selectors'
import type { PackageStatus, Role, SubmissionOutcome } from '../data/types'

export interface StatusMeta {
  label: string
  icon: LucideIcon
  className: string
}

// Full class strings so Tailwind can see them.
export const STATUS_META: Record<PackageStatus, StatusMeta> = {
  assigned: { label: 'Assigned', icon: Circle, className: 'bg-st-assigned-bg text-st-assigned' },
  in_progress: { label: 'In Progress', icon: Play, className: 'bg-st-progress-bg text-st-progress' },
  submitted: { label: 'Submitted', icon: Upload, className: 'bg-st-submitted-bg text-st-submitted' },
  client_review: { label: 'With Client', icon: Send, className: 'bg-st-client-bg text-st-client' },
  apply_feedback: { label: 'Apply Feedback', icon: RotateCcw, className: 'bg-st-feedback-bg text-st-feedback' },
  completed: { label: 'Completed', icon: Check, className: 'bg-st-completed-bg text-st-completed' },
  on_hold: { label: 'On Hold', icon: Pause, className: 'bg-st-hold-bg text-st-hold' },
  cancelled: { label: 'Cancelled', icon: X, className: 'bg-st-closed-bg text-st-closed' },
  archived: { label: 'Archived', icon: Archive, className: 'bg-st-closed-bg text-st-closed' },
}

/** Every status, in workflow order (used by filters). */
export const WORKFLOW_STATUSES: PackageStatus[] = [
  'assigned',
  'in_progress',
  'submitted',
  'client_review',
  'apply_feedback',
  'on_hold',
  'completed',
  'cancelled',
  'archived',
]

/** Outcome of one submission round. */
export const OUTCOME_META: Record<SubmissionOutcome, StatusMeta> = {
  pending: { label: 'Awaiting review', icon: Hourglass, className: 'bg-st-submitted-bg text-st-submitted' },
  feedback: { label: 'Apply Feedback', icon: RotateCcw, className: 'bg-st-feedback-bg text-st-feedback' },
  with_client: { label: 'With client', icon: Send, className: 'bg-st-client-bg text-st-client' },
  client_feedback: { label: 'Client asked for changes', icon: MessageSquareReply, className: 'bg-st-feedback-bg text-st-feedback' },
  approved: { label: 'Approved', icon: CircleCheck, className: 'bg-st-completed-bg text-st-completed' },
}

/** Whether an account can use the app. */
export const ACCESS_META: Record<Access, StatusMeta> = {
  active: { label: 'Active', icon: CircleCheck, className: 'bg-success-bg text-success' },
  pending: { label: 'Waiting for approval', icon: CircleDashed, className: 'bg-warning-bg text-warning' },
  deactivated: { label: 'Deactivated', icon: CircleOff, className: 'bg-st-closed-bg text-st-closed' },
}

export const ROLE_META: Record<Role, { label: string; icon: LucideIcon }> = {
  admin: { label: 'Admin', icon: ShieldCheck },
  manager: { label: 'Manager', icon: Briefcase },
  editor: { label: 'Editor', icon: Film },
}
