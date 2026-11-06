-- =========================================================
-- TP Wish Tree 2026 - Supabase database setup
-- Supabase > SQL Editor > New query > paste all of this > Run.
-- Safe to run again: it updates what already exists.
-- =========================================================


-- 1. Settings (one row) ------------------------------------
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  submissions_open boolean not null default true,
  allowed_domains text[] not null default array['tp.com'],
  max_wishes_per_person int not null default 3 check (max_wishes_per_person between 1 and 50)
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;


-- 2. Who may post leaders' messages, and who moderates ------
-- Manage these two lists in Table Editor. Emails in lower case.
create table if not exists public.leaders (
  email text primary key check (email = lower(btrim(email))),
  default_name text,
  default_title text,
  added_at timestamptz not null default now()
);

create table if not exists public.moderators (
  email text primary key check (email = lower(btrim(email))),
  added_at timestamptz not null default now()
);


-- 3. Helper functions --------------------------------------
create or replace function public.current_email() returns text
language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.email_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_settings s
    where split_part(public.current_email(), '@', 2) = any (s.allowed_domains)
  )
$$;

create or replace function public.is_leader() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.email_allowed()
     and exists (select 1 from public.leaders l where l.email = public.current_email())
$$;

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.email_allowed()
     and exists (select 1 from public.moderators m where m.email = public.current_email())
$$;


-- 4. Employee wishes ----------------------------------------
-- If you add a site in config.js, add its id to the site check below too.
create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text not null default public.current_email(),
  message text not null check (char_length(btrim(message)) between 1 and 200),
  display_mode text not null check (display_mode in ('name', 'anon')),
  first_name text check (first_name is null or char_length(first_name) <= 40),
  site text not null,
  lang text not null default 'en' check (lang in ('en', 'ms', 'th')),
  tag_color text not null default 'cream' check (tag_color in ('cream', 'red', 'gold')),
  charm text not null default 'snow' check (charm in ('snow', 'star', 'tree', 'gift')),
  consent boolean not null default false check (consent),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  flags text[] not null default '{}',
  reviewed_at timestamptz,
  reviewed_by text,
  approved_at timestamptz
);

alter table public.wishes drop constraint if exists wishes_site_check;
alter table public.wishes add constraint wishes_site_check
  check (site in ('gtower', 'kcp', 'gbs', 'op', 'lv', 'jb', 'singha', 'wfh'));

create index if not exists wishes_status_idx on public.wishes (status, approved_at desc);
create index if not exists wishes_user_idx on public.wishes (user_id);

-- New wishes: always pending, tied to the signed-in person, limited per person, auto-flagged
create or replace function public.wishes_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.app_settings%rowtype;
  n int;
  digits text;
begin
  select * into s from public.app_settings where id = 1;
  if not found or not s.submissions_open then
    raise exception 'wishes_closed';
  end if;

  new.user_id     := auth.uid();
  new.email       := public.current_email();
  new.status      := 'pending';
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.approved_at := null;
  new.message     := btrim(new.message);
  new.first_name  := nullif(btrim(coalesce(new.first_name, '')), '');

  if new.display_mode = 'anon' then
    new.first_name := null;
  elsif new.first_name is null then
    raise exception 'name_required';
  end if;

  select count(*) into n from public.wishes w
  where w.user_id = new.user_id and w.status <> 'rejected';
  if n >= s.max_wishes_per_person then
    raise exception 'wish_limit';
  end if;

  new.flags := '{}';
  if new.message ~* '[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}' then
    new.flags := array_append(new.flags, 'Email address');
  end if;
  digits := regexp_replace(coalesce(substring(new.message from '\+?[0-9][0-9 ().-]{6,}[0-9]'), ''), '[^0-9]', '', 'g');
  if char_length(digits) >= 9 then
    new.flags := array_append(new.flags, 'Phone number');
  end if;

  return new;
end
$$;

-- Moderation: record who reviewed and when it went live
create or replace function public.wishes_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id         := old.id;
  new.created_at := old.created_at;
  new.user_id    := old.user_id;
  new.email      := old.email;
  if new.status is distinct from old.status then
    new.reviewed_at := now();
    new.reviewed_by := nullif(public.current_email(), '');
    new.approved_at := case when new.status = 'approved' then now() else null end;
  end if;
  return new;
end
$$;

drop trigger if exists wishes_before_insert on public.wishes;
create trigger wishes_before_insert before insert on public.wishes
  for each row execute function public.wishes_before_insert();

drop trigger if exists wishes_before_update on public.wishes;
create trigger wishes_before_update before update on public.wishes
  for each row execute function public.wishes_before_update();


-- 5. Leaders' messages (one per leader) ---------------------
create table if not exists public.leader_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  email text not null default public.current_email(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  title text check (title is null or char_length(title) <= 80),
  message text not null check (char_length(btrim(message)) between 1 and 400),
  lang text not null default 'en' check (lang in ('en', 'ms', 'th')),
  sort_order int not null default 100,   -- lower = higher on the tree; set by moderators
  hidden boolean not null default false  -- moderators can hide a message
);

create or replace function public.leader_messages_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.user_id    := auth.uid();
      new.email      := public.current_email();
      new.hidden     := false;
      new.sort_order := 100;
    end if;
    new.created_at := now();
  else
    new.id         := old.id;
    new.user_id    := old.user_id;
    new.email      := old.email;
    new.created_at := old.created_at;
    if auth.uid() is not null and not public.is_moderator() then
      new.hidden     := old.hidden;
      new.sort_order := old.sort_order;
    end if;
  end if;
  new.display_name := btrim(new.display_name);
  new.title        := nullif(btrim(coalesce(new.title, '')), '');
  new.message      := btrim(new.message);
  new.updated_at   := now();
  return new;
end
$$;

drop trigger if exists leader_messages_before_write on public.leader_messages;
create trigger leader_messages_before_write before insert or update on public.leader_messages
  for each row execute function public.leader_messages_before_write();


-- 6. Row level security --------------------------------------
alter table public.app_settings enable row level security;
alter table public.leaders enable row level security;
alter table public.moderators enable row level security;
alter table public.wishes enable row level security;
alter table public.leader_messages enable row level security;
-- app_settings, leaders and moderators have no policies on purpose:
-- nobody can read or change them through the website, only you in Supabase.

drop policy if exists "staff add wishes" on public.wishes;
create policy "staff add wishes" on public.wishes
  for insert to authenticated
  with check (public.email_allowed() and user_id = auth.uid());

drop policy if exists "own wishes or moderators read" on public.wishes;
create policy "own wishes or moderators read" on public.wishes
  for select to authenticated
  using (user_id = auth.uid() or public.is_moderator());

drop policy if exists "moderators update wishes" on public.wishes;
create policy "moderators update wishes" on public.wishes
  for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

drop policy if exists "moderators delete wishes" on public.wishes;
create policy "moderators delete wishes" on public.wishes
  for delete to authenticated
  using (public.is_moderator());

drop policy if exists "only leaders add a message" on public.leader_messages;
create policy "only leaders add a message" on public.leader_messages
  for insert to authenticated
  with check (public.is_leader() and user_id = auth.uid());

drop policy if exists "own message or moderators read" on public.leader_messages;
create policy "own message or moderators read" on public.leader_messages
  for select to authenticated
  using (user_id = auth.uid() or public.is_moderator());

drop policy if exists "leaders edit own message" on public.leader_messages;
create policy "leaders edit own message" on public.leader_messages
  for update to authenticated
  using ((user_id = auth.uid() and public.is_leader()) or public.is_moderator())
  with check ((user_id = auth.uid() and public.is_leader()) or public.is_moderator());

drop policy if exists "leaders remove own message" on public.leader_messages;
create policy "leaders remove own message" on public.leader_messages
  for delete to authenticated
  using (user_id = auth.uid() or public.is_moderator());


-- 7. What the public tree can read --------------------------
-- Only approved wishes, and only the fields shown on the tree (no emails).
create or replace function public.get_approved_wishes()
returns table (id uuid, message text, display_name text, site text, lang text, tag_color text, charm text, approved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.id, w.message,
         case when w.display_mode = 'name' then w.first_name end,
         w.site, w.lang, w.tag_color, w.charm, w.approved_at
  from public.wishes w
  where w.status = 'approved'
  order by w.approved_at desc nulls last
  limit 5000
$$;

create or replace function public.get_leader_messages()
returns table (id uuid, display_name text, title text, message text, lang text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.display_name, m.title, m.message, m.lang, m.updated_at
  from public.leader_messages m
  where not m.hidden
  order by m.sort_order, m.created_at
$$;

-- Used by the leaders page to check access
create or replace function public.leader_profile()
returns table (is_leader boolean, default_name text, default_title text)
language sql stable security definer set search_path = '' as $$
  select public.is_leader(), l.default_name, l.default_title
  from (select 1) as x
  left join public.leaders l on l.email = public.current_email()
$$;

grant execute on function public.get_approved_wishes() to anon, authenticated;
grant execute on function public.get_leader_messages() to anon, authenticated;
grant execute on function public.leader_profile() to authenticated;


-- 8. Add your leaders and moderators -------------------------
-- Replace the examples, remove the leading "--", and run just these lines.
-- (Or add rows in Table Editor > leaders / moderators.)
--
-- insert into public.leaders (email, default_name, default_title) values
--   ('firstname.lastname@tp.com', 'Full Name', 'Title, TP Malaysia');
--
-- insert into public.moderators (email) values
--   ('firstname.lastname@tp.com');
