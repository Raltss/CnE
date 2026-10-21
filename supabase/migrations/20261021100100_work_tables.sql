-- Clients, products, packages, submission rounds, activity history, attendance,
-- and in-app notifications.
--
-- Row Level Security decides what each person can READ. Nobody writes these
-- tables directly: every change goes through the workflow functions in the
-- next migration, which check the caller's role and the package's status.

create type public.package_status as enum (
  'assigned', 'in_progress', 'submitted', 'apply_feedback', 'completed', 'on_hold', 'cancelled', 'archived'
);
create type public.submission_outcome as enum ('pending', 'feedback', 'approved');
create type public.activity_type as enum (
  'created', 'reassigned', 'started', 'submitted', 'feedback', 'approved', 'deadline_changed', 'manager_changed', 'edited'
);
create type public.notification_type as enum (
  'assigned', 'reassigned_away', 'submitted', 'feedback', 'approved', 'deadline_changed', 'manager_changed'
);

-- ── Clients and products ────────────────────────────────────────────────────

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  manager_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  -- Null means the product falls back to the client's manager.
  manager_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (id, client_id)
);

-- ── Packages ────────────────────────────────────────────────────────────────

create sequence public.package_code_seq start 1001;

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('PKG-' || nextval('public.package_code_seq')),
  title text not null check (char_length(title) between 1 and 120),
  client_id uuid not null references public.clients (id),
  product_id uuid not null,
  description text not null default '',
  brief_link text not null default '',
  reference_links text[] not null default '{}',
  deliverables text not null default '',
  editor_id uuid not null references public.profiles (id),
  responsible_manager_id uuid not null references public.profiles (id),
  -- Entered and shown in Asia/Manila; stored as an instant.
  deadline timestamptz not null,
  status public.package_status not null default 'assigned',
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  -- The product must belong to the package's client.
  foreign key (product_id, client_id) references public.products (id, client_id)
);

create index packages_editor_id_idx on public.packages (editor_id);
create index packages_responsible_manager_id_idx on public.packages (responsible_manager_id);
create index packages_status_idx on public.packages (status);

-- One row per submission round. Rounds are never overwritten, even when links repeat.
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  round integer not null check (round > 0),
  review_link text,
  delivery_link text,
  submitted_at timestamptz not null default now(),
  submitted_by uuid not null references public.profiles (id),
  outcome public.submission_outcome not null default 'pending',
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  -- Optional short note with Apply Feedback; detailed comments stay in Frame.io.
  feedback_note text check (char_length(feedback_note) <= 500),
  unique (package_id, round),
  check (review_link is not null or delivery_link is not null)
);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  type public.activity_type not null,
  actor_id uuid not null references public.profiles (id),
  at timestamptz not null default now(),
  message text not null
);

create index activity_package_id_idx on public.activity (package_id, at desc);

-- ── Attendance ──────────────────────────────────────────────────────────────

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.profiles (id),
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  -- Closed automatically 16 hours after clock-in; the person may need a correction.
  auto_closed boolean not null default false,
  check (clock_out is null or clock_out >= clock_in)
);

-- At most one open session per person, enforced by the database.
create unique index attendance_one_open_session on public.attendance_sessions (person_id) where clock_out is null;
create index attendance_person_clock_in_idx on public.attendance_sessions (person_id, clock_in desc);

-- ── Notifications ───────────────────────────────────────────────────────────

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id),
  type public.notification_type not null,
  package_id uuid not null references public.packages (id) on delete cascade,
  actor_id uuid not null references public.profiles (id),
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- ── Row Level Security (reads) ──────────────────────────────────────────────

alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.packages enable row level security;
alter table public.submissions enable row level security;
alter table public.activity enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.notifications enable row level security;

create policy "Managers and editors read clients"
  on public.clients for select to authenticated
  using ((select private.is_work_staff()));

create policy "Managers and editors read products"
  on public.products for select to authenticated
  using ((select private.is_work_staff()));

-- Managers see every package; editors only the ones currently assigned to them.
create policy "Managers read all packages, editors their own"
  on public.packages for select to authenticated
  using (
    (select private.has_role('manager'))
    or ((select private.has_role('editor')) and editor_id = (select auth.uid()))
  );

-- Rounds and history follow package visibility (the subquery applies the packages policy).
create policy "Read submissions of visible packages"
  on public.submissions for select to authenticated
  using (package_id in (select id from public.packages));

create policy "Read activity of visible packages"
  on public.activity for select to authenticated
  using (package_id in (select id from public.packages));

create policy "Managers read all attendance, staff their own"
  on public.attendance_sessions for select to authenticated
  using (
    (select private.has_role('manager'))
    or ((select private.is_work_staff()) and person_id = (select auth.uid()))
  );

create policy "Staff read their own notifications"
  on public.notifications for select to authenticated
  using ((select private.is_active_staff()) and recipient_id = (select auth.uid()));

-- Read-only through the API. Writes happen only inside the workflow functions.
revoke all on public.clients, public.products, public.packages, public.submissions, public.activity,
  public.attendance_sessions, public.notifications from anon;
revoke insert, update, delete, truncate, references, trigger on public.clients, public.products, public.packages,
  public.submissions, public.activity, public.attendance_sessions, public.notifications from authenticated;
grant select on public.clients, public.products, public.packages, public.submissions, public.activity,
  public.attendance_sessions, public.notifications to authenticated;
revoke all on sequence public.package_code_seq from anon, authenticated;
