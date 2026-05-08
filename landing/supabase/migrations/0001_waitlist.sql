-- Mr Milk landing waitlist.
-- Apply via: supabase db push, or paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  source      text not null default 'landing',
  user_agent  text,
  created_at  timestamptz not null default now()
);

create unique index if not exists waitlist_email_lower_idx
  on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

-- Allow anonymous inserts only. No select / update / delete from anon.
drop policy if exists waitlist_anon_insert on public.waitlist;
create policy waitlist_anon_insert
  on public.waitlist
  for insert
  to anon
  with check (
    email is not null
    and char_length(email) between 5 and 254
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  );
