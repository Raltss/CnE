-- Client review, part 1 (2026-10-23): the new status, round outcomes, activity and
-- notification kinds. On their own because Postgres can't use an enum value in the
-- same transaction that adds it; the functions that use them are in the next migration.

alter type public.package_status add value if not exists 'client_review' after 'submitted';

-- A round approved internally is sent to the client ('with_client'), who approves it
-- ('approved') or asks for changes ('client_feedback').
alter type public.submission_outcome add value if not exists 'with_client';
alter type public.submission_outcome add value if not exists 'client_feedback';

alter type public.activity_type add value if not exists 'sent_to_client';
alter type public.activity_type add value if not exists 'client_approved';
alter type public.activity_type add value if not exists 'client_feedback';
alter type public.activity_type add value if not exists 'delivery_added';

alter type public.notification_type add value if not exists 'sent_to_client';
alter type public.notification_type add value if not exists 'client_approved';
alter type public.notification_type add value if not exists 'client_feedback';
alter type public.notification_type add value if not exists 'delivery_added';
