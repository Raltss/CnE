-- Package lifecycle, part 1 (2026-10-23): the new activity and notification kinds.
--
-- On their own because Postgres can't use an enum value in the same transaction
-- that adds it; the functions that use them are in the next migration.

alter type public.activity_type add value if not exists 'held';
alter type public.activity_type add value if not exists 'resumed';
alter type public.activity_type add value if not exists 'cancelled';
alter type public.activity_type add value if not exists 'archived';
alter type public.activity_type add value if not exists 'unarchived';
alter type public.activity_type add value if not exists 'reopened';

alter type public.notification_type add value if not exists 'on_hold';
alter type public.notification_type add value if not exists 'resumed';
alter type public.notification_type add value if not exists 'cancelled';
alter type public.notification_type add value if not exists 'reopened';
alter type public.notification_type add value if not exists 'deleted';
