// Shared by the package page's review actions and the dashboard's quick review.

/** How a manager approves a submitted round: send it to the client, or complete it now. */
export type ApproveMode = 'client' | 'complete'

/** Labels for the confirm button and the toast, per choice. */
export const APPROVE_COPY: Record<ApproveMode, { confirm: string; busy: string; done: (editor: string) => string }> = {
  client: { confirm: 'Send to client', busy: 'Sending…', done: (editor) => `Sent to the client. ${editor} has been notified.` },
  complete: { confirm: 'Approve and complete', busy: 'Approving…', done: (editor) => `Approved and completed. ${editor} has been notified.` },
}
