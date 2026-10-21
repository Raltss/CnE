// Fictional demo data, generated relative to "now" so deadlines and attendance
// always look current. History is replayed through the real workflow commands.
import { DAY_MS, HOUR_MS, manilaDateKey } from '../lib/time'
import { defaultResponsibleManagerId } from './selectors'
import type { DemoState, Person, StaffAccount, StaffActivity } from './types'
import {
  approvePackage,
  createPackage,
  newId,
  requestFeedback,
  startWork,
  submitForReview,
} from './workflow'

export const DEMO_STATE_VERSION = 4

const people: Person[] = [
  { id: 'adm_lea', name: 'Lea Navarro', role: 'admin', title: 'Operations Admin', isActive: true },
  { id: 'mgr_andrea', name: 'Andrea Santos', role: 'manager', title: 'Operations Manager', isActive: true },
  { id: 'mgr_paolo', name: 'Paolo Reyes', role: 'manager', title: 'Creative Manager', isActive: true },
  { id: 'ed_mika', name: 'Mika Dela Cruz', role: 'editor', title: 'Senior Editor', isActive: true },
  { id: 'ed_jun', name: 'Jun Villanueva', role: 'editor', title: 'Video Editor', isActive: true },
  { id: 'ed_bea', name: 'Bea Lim', role: 'editor', title: 'Motion Editor', isActive: true },
  { id: 'ed_carlo', name: 'Carlo Mendoza', role: 'editor', title: 'Video Editor', isActive: true },
  { id: 'ed_rina', name: 'Rina Bautista', role: 'editor', title: 'Junior Editor', isActive: true },
  { id: 'ed_ivan', name: 'Ivan Torres', role: 'editor', title: 'Editor / Colorist', isActive: true },
]

/** Signed up but not approved yet, so the admin demo has someone to approve. */
const pendingAccount = { id: 'new_nico', name: 'Nico Ramos', title: '' }

/** Accounts, and their history: created and approved in a trusted setup step 30 days ago. */
function seedAccounts(now: Date): { accounts: StaffAccount[]; staffActivity: StaffActivity[] } {
  const daysAgo = (d: number) => new Date(now.getTime() - d * DAY_MS).toISOString()
  const accounts: StaffAccount[] = [
    ...people.map((p) => ({
      id: p.id,
      name: p.name,
      email: `${p.id}@demo.cne`,
      title: p.title,
      role: p.role,
      isActive: true,
      createdAt: daysAgo(30),
      mustChangePassword: false,
    })),
    { ...pendingAccount, email: 'nico@demo.cne', role: null, isActive: false, createdAt: daysAgo(0.1), mustChangePassword: false },
  ]
  const staffActivity: StaffActivity[] = accounts.flatMap((a) => {
    const created: StaffActivity = {
      id: `stf_created_${a.id}`,
      profileId: a.id,
      actorId: null,
      type: 'account_created',
      oldRole: null,
      newRole: null,
      oldIsActive: null,
      newIsActive: false,
      message: 'Account created, waiting for approval',
      at: a.createdAt,
    }
    if (!a.role) return [created]
    const label = a.role[0].toUpperCase() + a.role.slice(1)
    return [
      created,
      {
        ...created,
        id: `stf_approved_${a.id}`,
        type: 'approved',
        newRole: a.role,
        oldIsActive: false,
        newIsActive: true,
        message: `Approved as ${label}`,
        at: daysAgo(29.9),
      },
    ]
  })
  return { accounts, staffActivity }
}

type Step =
  | { do: 'start'; h: number }
  | { do: 'submit'; h: number; review?: string; delivery?: string }
  | { do: 'feedback'; h: number; by: string; note?: string }
  | { do: 'approve'; h: number; by: string }

interface SeedPackage {
  title: string
  productId: string
  editorId: string
  createdBy: string
  createdH: number
  deadlineH: number
  description: string
  deliverables: string
  refs: number
  steps: Step[]
}

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
const frameio = (title: string, round: number) => `https://f.io/cne-demo/${slug(title)}-r${round}`
const drive = (title: string) => `https://drive.google.com/drive/folders/cne-demo-${slug(title)}`

const packages: SeedPackage[] = [
  {
    title: 'Holiday Blend 30s Hero Spot',
    productId: 'prd_kb_seasonal',
    editorId: 'ed_mika',
    createdBy: 'mgr_andrea',
    createdH: -120,
    deadlineH: 20,
    description: 'Hero spot for the holiday blend launch. Warm, cozy tone; product shots from the Oct 3 shoot.',
    deliverables: '16:9 master (30s), 9:16 cutdown (15s), burned-in captions (EN)',
    refs: 2,
    steps: [
      { do: 'start', h: -100 },
      { do: 'submit', h: -30, review: 'r1' },
      { do: 'feedback', h: -26, by: 'mgr_andrea', note: 'Tighten the first 3 seconds; see Frame.io comments at 0:04 and 0:18.' },
      { do: 'submit', h: -3, review: 'r2', delivery: 'drive' },
    ],
  },
  {
    title: 'Barista Tips Reel #4',
    productId: 'prd_kb_social',
    editorId: 'ed_jun',
    createdBy: 'mgr_andrea',
    createdH: -72,
    deadlineH: 60,
    description: 'Latte art tips with Chef Lia. Keep it under 45 seconds.',
    deliverables: '9:16 reel (≤45s), cover frame',
    refs: 1,
    steps: [
      { do: 'start', h: -60 },
      { do: 'submit', h: -5, review: 'r1', delivery: 'drive' },
    ],
  },
  {
    title: 'Spin Class Launch Teaser',
    productId: 'prd_lf_promos',
    editorId: 'ed_bea',
    createdBy: 'mgr_paolo',
    createdH: -96,
    deadlineH: 8,
    description: 'High-energy teaser for the new 6 AM spin class. Use the studio’s licensed track list.',
    deliverables: '9:16 teaser (15s), 1:1 feed version',
    refs: 2,
    steps: [
      { do: 'start', h: -90 },
      { do: 'submit', h: -20, review: 'r1' },
    ],
  },
  {
    title: 'Coach Ella Spotlight',
    productId: 'prd_lf_coach',
    editorId: 'ed_carlo',
    createdBy: 'mgr_paolo',
    createdH: -80,
    deadlineH: 30,
    description: 'Interview-led spotlight on Coach Ella. Two-camera interview plus B-roll.',
    deliverables: '16:9 (90s), 9:16 cutdown (30s), SRT captions',
    refs: 1,
    steps: [
      { do: 'start', h: -70 },
      { do: 'submit', h: -50, review: 'r1', delivery: 'drive' },
      { do: 'feedback', h: -45, by: 'mgr_andrea', note: 'Swap the music bed. The client flagged a licensing issue.' },
    ],
  },
  {
    title: 'Lakeview Model Unit Walkthrough',
    productId: 'prd_bh_walk',
    editorId: 'ed_rina',
    createdBy: 'mgr_andrea',
    createdH: -60,
    deadlineH: -6,
    description: 'Gimbal walkthrough of the 2BR model unit. Add room labels as lower thirds.',
    deliverables: '16:9 walkthrough (2 min), 9:16 highlight (30s)',
    refs: 1,
    steps: [
      { do: 'start', h: -50 },
      { do: 'submit', h: -30, review: 'r1' },
      { do: 'feedback', h: -28, by: 'mgr_paolo' },
    ],
  },
  {
    title: 'Developer Brand Film — Cut A',
    productId: 'prd_bh_brand',
    editorId: 'ed_ivan',
    createdBy: 'mgr_paolo',
    createdH: -150,
    deadlineH: 120,
    description: 'First assembly of the brand film. Color pass to follow after picture lock.',
    deliverables: '16:9 master (3 min), color-graded, stereo mix',
    refs: 3,
    steps: [{ do: 'start', h: -140 }],
  },
  {
    title: 'Sisig Burger Menu Launch',
    productId: 'prd_ke_menu',
    editorId: 'ed_mika',
    createdBy: 'mgr_paolo',
    createdH: -50,
    deadlineH: -2,
    description: 'Launch video for the sisig burger. Close-up food shots, sizzle sound design.',
    deliverables: '9:16 (20s), 16:9 (20s) for in-store screens',
    refs: 1,
    steps: [{ do: 'start', h: -40 }],
  },
  {
    title: 'Street Food Friday Ep. 7',
    productId: 'prd_ke_tiktok',
    editorId: 'ed_jun',
    createdBy: 'mgr_paolo',
    createdH: -30,
    deadlineH: 40,
    description: 'Weekly street food series. Episode 7: Binondo food crawl.',
    deliverables: '9:16 episode (60s), captions (EN/Tagalog)',
    refs: 1,
    steps: [{ do: 'start', h: -10 }],
  },
  {
    title: 'Summer Promo Cutdowns 9:16',
    productId: 'prd_kb_seasonal',
    editorId: 'ed_bea',
    createdBy: 'mgr_andrea',
    createdH: -6,
    deadlineH: 100,
    description: 'Three vertical cutdowns from the summer campaign master.',
    deliverables: '3 × 9:16 cutdowns (6s, 10s, 15s)',
    refs: 1,
    steps: [],
  },
  {
    title: 'Yoga Flow Class Promo',
    productId: 'prd_lf_promos',
    editorId: 'ed_rina',
    createdBy: 'mgr_paolo',
    createdH: -20,
    deadlineH: 36,
    description: 'Calm, slow-paced promo for the Sunday yoga flow class.',
    deliverables: '9:16 (20s), 1:1 (20s)',
    refs: 2,
    steps: [],
  },
  {
    title: 'Ridgecrest Amenities Tour',
    productId: 'prd_bh_walk',
    editorId: 'ed_carlo',
    createdBy: 'mgr_andrea',
    createdH: -2,
    deadlineH: 170,
    description: 'Pool, gym, and co-working spaces. Drone opener from the September shoot.',
    deliverables: '16:9 tour (90s), 9:16 highlight (20s)',
    refs: 1,
    steps: [],
  },
  {
    title: 'Barista Tips Reel #3',
    productId: 'prd_kb_social',
    editorId: 'ed_jun',
    createdBy: 'mgr_andrea',
    createdH: -300,
    deadlineH: -200,
    description: 'Cold brew at home, step by step.',
    deliverables: '9:16 reel (≤45s), cover frame',
    refs: 1,
    steps: [
      { do: 'start', h: -290 },
      { do: 'submit', h: -250, review: 'r1', delivery: 'drive' },
      { do: 'approve', h: -240, by: 'mgr_andrea' },
    ],
  },
  {
    title: 'New Year Menu Teaser',
    productId: 'prd_ke_menu',
    editorId: 'ed_mika',
    createdBy: 'mgr_paolo',
    createdH: -400,
    deadlineH: -330,
    description: 'Teaser for the New Year menu drop.',
    deliverables: '9:16 (15s), 16:9 (15s)',
    refs: 1,
    steps: [
      { do: 'start', h: -390 },
      { do: 'submit', h: -360, review: 'r1' },
      { do: 'feedback', h: -355, by: 'mgr_paolo', note: 'Use the logo end card from the brand kit.' },
      { do: 'submit', h: -340, review: 'r2', delivery: 'drive' },
      { do: 'approve', h: -335, by: 'mgr_paolo' },
    ],
  },
  {
    title: 'Coach Marco Spotlight',
    productId: 'prd_lf_coach',
    editorId: 'ed_carlo',
    createdBy: 'mgr_andrea',
    createdH: -250,
    deadlineH: -150,
    description: 'Spotlight on Coach Marco’s strength program.',
    deliverables: '16:9 (90s), 9:16 cutdown (30s)',
    refs: 1,
    steps: [
      { do: 'start', h: -240 },
      { do: 'submit', h: -170, review: 'r1', delivery: 'drive' },
      { do: 'approve', h: -160, by: 'mgr_andrea' },
    ],
  },
  {
    title: 'Lakeview Exterior Drone Edit',
    productId: 'prd_bh_walk',
    editorId: 'ed_rina',
    createdBy: 'mgr_andrea',
    createdH: -500,
    deadlineH: -420,
    description: 'Exterior drone footage of the Lakeview tower at golden hour.',
    deliverables: '16:9 (45s), 4K export',
    refs: 1,
    steps: [
      { do: 'start', h: -480 },
      { do: 'submit', h: -440, review: 'r1', delivery: 'drive' },
      { do: 'feedback', h: -436, by: 'mgr_andrea', note: 'Please re-export at 4K. The links can stay the same.' },
      // Same links reused on purpose: still recorded as a separate round.
      { do: 'submit', h: -430, review: 'r1', delivery: 'drive' },
      { do: 'approve', h: -425, by: 'mgr_andrea' },
    ],
  },
  {
    title: 'Brand Film Teaser 15s',
    productId: 'prd_bh_brand',
    editorId: 'ed_ivan',
    createdBy: 'mgr_paolo',
    createdH: -350,
    deadlineH: -260,
    description: 'Short teaser ahead of the full brand film.',
    deliverables: '16:9 (15s), 9:16 (15s)',
    refs: 1,
    steps: [
      { do: 'start', h: -340 },
      { do: 'submit', h: -280, review: 'r1', delivery: 'drive' },
      { do: 'approve', h: -270, by: 'mgr_paolo' },
    ],
  },
]

const REFERENCE_POOL = [
  'https://www.youtube.com/watch?v=cne-demo-ref-a',
  'https://vimeo.com/cne-demo/moodboard',
  'https://www.pinterest.com/cne-demo/board',
]

/** Small deterministic PRNG so the demo looks the same after every reset. */
function rng(seed: number) {
  let t = seed
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function must<T>(result: { ok: true; value: T } | { ok: false; error: string }, context: string): T {
  if (!result.ok) throw new Error(`Seed failed (${context}): ${result.error}`)
  return result.value
}

export function createSeedState(now = new Date()): DemoState {
  const at = (h: number) => new Date(now.getTime() + h * HOUR_MS).toISOString()
  const s: DemoState = {
    version: DEMO_STATE_VERSION,
    seededAt: now.toISOString(),
    nextPackageNumber: 1001,
    people: people.map((p) => ({ ...p })),
    ...seedAccounts(now),
    clients: [
      { id: 'cl_kapeng', name: 'Kapeng Barako Co.', managerId: 'mgr_andrea' },
      { id: 'cl_luzfit', name: 'Luzon Fit Studio', managerId: 'mgr_paolo' },
      { id: 'cl_bayside', name: 'Bayside Homes', managerId: 'mgr_andrea' },
      { id: 'cl_kalye', name: 'Kalye Eats', managerId: 'mgr_paolo' },
    ],
    products: [
      { id: 'prd_kb_seasonal', clientId: 'cl_kapeng', name: 'Seasonal Campaigns', managerId: 'mgr_andrea' },
      { id: 'prd_kb_social', clientId: 'cl_kapeng', name: 'Social Shorts', managerId: null },
      { id: 'prd_lf_promos', clientId: 'cl_luzfit', name: 'Class Promos', managerId: 'mgr_paolo' },
      { id: 'prd_lf_coach', clientId: 'cl_luzfit', name: 'Coach Spotlights', managerId: 'mgr_andrea' },
      { id: 'prd_bh_walk', clientId: 'cl_bayside', name: 'Property Walkthroughs', managerId: null },
      { id: 'prd_bh_brand', clientId: 'cl_bayside', name: 'Developer Brand Film', managerId: 'mgr_paolo' },
      { id: 'prd_ke_menu', clientId: 'cl_kalye', name: 'Menu Launches', managerId: null },
      { id: 'prd_ke_tiktok', clientId: 'cl_kalye', name: 'TikTok Series', managerId: null },
    ],
    packages: [],
    submissions: [],
    activity: [],
    attendance: [],
    notifications: [],
  }

  // Oldest first so package codes follow creation order.
  const ordered = [...packages].sort((a, b) => a.createdH - b.createdH)
  for (const spec of ordered) {
    const product = s.products.find((p) => p.id === spec.productId)!
    const pkg = must(
      createPackage(
        s,
        spec.createdBy,
        {
          title: spec.title,
          clientId: product.clientId,
          productId: product.id,
          description: spec.description,
          briefLink: `https://docs.google.com/document/d/cne-demo-brief-${slug(spec.title)}`,
          referenceLinks: REFERENCE_POOL.slice(0, spec.refs),
          deliverables: spec.deliverables,
          editorId: spec.editorId,
          responsibleManagerId: defaultResponsibleManagerId(s, product.id) ?? spec.createdBy,
          deadline: at(spec.deadlineH),
        },
        at(spec.createdH),
      ),
      spec.title,
    )
    let round = 0
    for (const step of spec.steps) {
      if (step.do === 'start') must(startWork(s, spec.editorId, pkg.id, at(step.h)), `${spec.title} start`)
      if (step.do === 'submit') {
        round += 1
        const review = step.review ? frameio(spec.title, Number(step.review.slice(1))) : ''
        must(
          submitForReview(s, spec.editorId, pkg.id, { reviewLink: review, deliveryLink: step.delivery ? drive(spec.title) : '' }, at(step.h)),
          `${spec.title} submit ${round}`,
        )
      }
      if (step.do === 'feedback') must(requestFeedback(s, step.by, pkg.id, step.note ?? '', at(step.h)), `${spec.title} feedback`)
      if (step.do === 'approve') must(approvePackage(s, step.by, pkg.id, at(step.h)), `${spec.title} approve`)
    }
  }

  // Notifications older than a day start out read.
  for (const n of s.notifications) {
    if (now.getTime() - new Date(n.createdAt).getTime() > DAY_MS) n.readAt = n.createdAt
  }

  seedAttendance(s, now)
  return s
}

function seedAttendance(s: DemoState, now: Date) {
  const random = rng(20261021)
  const todayMidnight = new Date(`${manilaDateKey(now.toISOString())}T00:00:00+08:00`).getTime()
  const add = (personId: string, clockIn: number, clockOut: number | null, autoClosed = false) => {
    if (clockIn > now.getTime() || (clockOut !== null && clockOut > now.getTime())) return
    s.attendance.push({
      id: newId('att'),
      personId,
      clockIn: new Date(clockIn).toISOString(),
      clockOut: clockOut === null ? null : new Date(clockOut).toISOString(),
      autoClosed,
    })
  }
  const minutes = (m: number) => m * 60 * 1000
  const isSunday = (daysAgo: number) => new Date(todayMidnight - daysAgo * DAY_MS + 8 * HOUR_MS).getUTCDay() === 0
  // The day Rina forgot to clock out: 3 days ago, or 4 if that was a Sunday.
  const rinaForgotDay = isSunday(3) ? 4 : 3

  for (const person of s.people) {
    if (person.role === 'admin') continue // Admins don't clock in
    for (let daysAgo = 7; daysAgo >= 1; daysAgo -= 1) {
      const day = todayMidnight - daysAgo * DAY_MS
      if (isSunday(daysAgo)) continue // Sundays off
      if (person.id === 'ed_ivan') {
        // Night shift: 9 PM to about 6 AM the next day (crosses midnight).
        const start = day + 21 * HOUR_MS + minutes(Math.round(random() * 20))
        add(person.id, start, start + 9 * HOUR_MS + minutes(Math.round(random() * 30)))
        continue
      }
      if (person.id === 'ed_rina' && daysAgo === rinaForgotDay) {
        // Forgot to clock out: auto-closed at clock-in + 16h.
        const start = day + 9 * HOUR_MS + minutes(5)
        add(person.id, start, start + 16 * HOUR_MS, true)
        continue
      }
      const start = day + 8 * HOUR_MS + minutes(30 + Math.round(random() * 60))
      add(person.id, start, start + 8 * HOUR_MS + minutes(30 + Math.round(random() * 90)))
    }
  }

  // A few people are clocked in right now (only if their usual start time has passed).
  const openToday: Array<[string, number]> = [
    ['mgr_andrea', 8 * 60 + 40],
    ['ed_mika', 8 * 60 + 55],
    ['ed_jun', 9 * 60 + 10],
    ['ed_bea', 9 * 60 + 25],
  ]
  for (const [personId, startMinutes] of openToday) {
    const start = todayMidnight + minutes(startMinutes)
    if (now.getTime() - start < 15 * HOUR_MS) add(personId, start, null)
  }
}
