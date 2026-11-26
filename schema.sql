-- =========================================================
-- TP Wish Tree 2026 - Supabase database setup
-- Supabase > SQL Editor > New query > paste all of this > Run.
-- Safe to run again: it updates what already exists. Then set the two passwords (section 10).
--
-- What is stored, and nothing more:
--   Employees: first name (or nickname), BMS, the wish (words, site, language, tag colour and charm),
--              the consent tick, the approval status and a random code for the device that sent it.
--              No emails, no phone numbers, no IP addresses.
--   Likes:     the BMS of the person who liked and a random code for their device.
--   Leaders:   the name and title they give, their message and an optional small photo.
--   Connection codes: wishes, likes and leader messages keep a scrambled code made from the visitor's
--              connection. It can't be turned back into an IP address. It's used for rate limits and to
--              spot many likes from one connection. Rate-limit records are deleted after a day.
--
-- Who gets in:
--   The tree, the TV pages and the wish page are open to everyone.
--   The leaders' page and the Approvals page each need a password, checked here in the database
--   (never in the website code). Nobody signs in with an email.
--   Every wish and every leader message, new or edited, waits for approval.
--
-- Employees: one wish per BMS. It can be edited only from the browser that sent it (a secret edit key kept
-- on that device). Likes count once per BMS and once per device. Likes that don't count (a BMS that isn't
-- 4-7 digits, a made-up BMS like 55555 or 1234567, your own wish, a second like from the same device, after
-- the deadline) are quietly dropped: the person sees their like until they reload the page.
-- =========================================================


-- 0. Tools ---------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;


-- 1. Settings (one row) ------------------------------------
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  submissions_open boolean not null default true
);
-- Likes stop counting after this moment (end of 18 December, Malaysia time). Change it in Table Editor > app_settings.
alter table public.app_settings add column if not exists likes_close_at timestamptz default '2026-12-18 23:59:59+08';
-- Earlier versions had sign-in settings
alter table public.app_settings drop column if exists allowed_domains;
alter table public.app_settings drop column if exists max_wishes_per_person;
alter table public.app_settings drop column if exists leaders_need_approval;
insert into public.app_settings (id) values (1) on conflict (id) do nothing;


-- 2. Connection codes and rate limits ------------------------
-- A secret made once, here in the database, so connection codes can't be worked back to an address
create table if not exists public.private_salt (
  id int primary key default 1 check (id = 1),
  salt text not null default encode(extensions.gen_random_bytes(24), 'hex')
);
insert into public.private_salt (id) values (1) on conflict (id) do nothing;

-- The visitor's connection as a scrambled code (never the IP address itself)
drop function if exists public.request_ip();
create or replace function public.conn_code() returns text
language sql stable security definer set search_path = '' as $$
  select left(encode(sha256(convert_to(
           (select s.salt from public.private_salt s where s.id = 1) || '|' ||
           coalesce(nullif(btrim(h ->> 'cf-connecting-ip'), ''),
                    nullif(btrim(h ->> 'x-real-ip'), ''),
                    nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''),
                    'unknown'),
           'UTF8')), 'hex'), 20)
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) x
$$;

-- Rate limits: counts recent actions per key (a connection code, a device code or a BMS)
create table if not exists public.rate_events (
  action text not null,
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_events_idx on public.rate_events (action, key, at desc);
delete from public.rate_events;   -- earlier versions kept IP addresses here

create or replace function public.rate_hit(p_action text, p_key text, p_max int, p_window interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if random() < 0.02 then
    delete from public.rate_events where at < now() - interval '1 day';
  end if;
  select count(*) into n from public.rate_events e
  where e.action = p_action and e.key = coalesce(p_key, '') and e.at > now() - p_window;
  if n >= p_max then
    return false;
  end if;
  insert into public.rate_events (action, key) values (p_action, coalesce(p_key, ''));
  return true;
end
$$;


-- 3. BMS checks and the prize ------------------------------
-- A BMS that looks real: 4 to 7 digits, not one digit repeated (5555, 55555), not a straight run (1234, 1234567, 7654321)
create or replace function public.bms_looks_real(p_bms text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_bms, '') ~ '^[0-9]{4,7}$'
     and p_bms !~ '^(.)\1*$'
     and position(p_bms in '0123456789') = 0
     and position(p_bms in '9876543210') = 0
$$;

-- A BMS whose likes count and whose wish can win
create or replace function public.bms_ok(p_bms text) returns boolean
language sql immutable set search_path = '' as $$
  select public.bms_looks_real(p_bms)
$$;

-- BMS numbers that can't win a prize (Amr, Maszy, the Wish Tree team).
-- Add them in Table Editor > prize_excluded. Leaders' messages never count anyway.
create table if not exists public.prize_excluded (
  bms text primary key check (bms ~ '^[0-9]{4,7}$'),
  note text
);

-- Automatic flags shown to approvers (phone numbers, emails in the wish text)
create or replace function public.wish_flags(p_message text) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  f text[] := '{}';
  digits text;
begin
  if p_message ~* '[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}' then
    f := array_append(f, 'Email address');
  end if;
  digits := regexp_replace(coalesce(substring(p_message from '\+?[0-9][0-9 ().-]{6,}[0-9]'), ''), '[^0-9]', '', 'g');
  if char_length(digits) >= 9 then
    f := array_append(f, 'Phone number');
  end if;
  return f;
end
$$;


-- 4. Passwords for the leaders' page and the Approvals page ----
-- Set them with section 10. Only a scrambled (bcrypt) version of each password is kept.
create table if not exists public.access_passwords (
  role text primary key check (role in ('leader', 'admin')),
  pass_hash text not null,
  updated_at timestamptz not null default now()
);

-- Who is in: a random token per browser, kept here only as a scrambled version, with an end time
create table if not exists public.access_sessions (
  token_hash text primary key,
  role text not null check (role in ('leader', 'admin')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists access_sessions_exp_idx on public.access_sessions (expires_at);
-- The name an admin types on the Approvals page (everyone shares one password), shown as "Approved by ..."
alter table public.access_sessions add column if not exists who text;

-- Run from the SQL Editor only (section 10). A new password signs out everyone who used the old one.
create or replace function public.set_access_password(p_role text, p_password text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if p_role not in ('leader', 'admin') then
    raise exception 'The first value must be leader or admin';
  end if;
  if char_length(coalesce(p_password, '')) < 10 then
    raise exception 'Use a password of at least 10 characters';
  end if;
  insert into public.access_passwords (role, pass_hash, updated_at)
  values (p_role, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now())
  on conflict (role) do update set pass_hash = excluded.pass_hash, updated_at = now();
  delete from public.access_sessions s where s.role = p_role;
  return 'Password set for the ' || case when p_role = 'admin' then 'Approvals page' else 'leaders'' page' end
         || '. Anyone who used the old password has to enter the new one.';
end
$$;

-- The role a token belongs to ('leader' or 'admin'), or null when it's wrong or has ended
create or replace function public.session_role(p_token text) returns text
language sql stable security definer set search_path = '' as $$
  select s.role from public.access_sessions s
  where coalesce(p_token, '') ~ '^[0-9a-f]{64}$'
    and s.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and s.expires_at > now()
$$;

-- Enter a password. Answers result 'ok' (with a token and its end time), 'wrong', 'slow_down' or 'not_set'.
-- 5 wrong tries for the Approvals page (10 for the leaders' page) from one connection lock it for 15 minutes,
-- and 100 wrong tries an hour from anywhere lock it for everyone.
drop function if exists public.access_login(text, text);
create function public.access_login(p_role text, p_password text)
returns table (result text, session_token text, session_ends timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_conn text := public.conn_code();
  v_hash text;
  v_token text;
  v_ends timestamptz;
  n int;
begin
  if p_role not in ('leader', 'admin') then raise exception 'bad_role'; end if;
  if random() < 0.05 then
    delete from public.access_sessions s where s.expires_at < now();
    delete from public.rate_events e where e.at < now() - interval '1 day';
  end if;

  select count(*) into n from public.rate_events e
  where e.action = 'login_fail_' || p_role and e.key = v_conn and e.at > now() - interval '15 minutes';
  if n >= (case when p_role = 'admin' then 5 else 10 end) then
    return query select 'slow_down'::text, null::text, null::timestamptz; return;
  end if;
  select count(*) into n from public.rate_events e
  where e.action = 'login_fail_' || p_role and e.at > now() - interval '1 hour';
  if n >= 100 then
    return query select 'slow_down'::text, null::text, null::timestamptz; return;
  end if;

  select p.pass_hash into v_hash from public.access_passwords p where p.role = p_role;
  if v_hash is null then
    return query select 'not_set'::text, null::text, null::timestamptz; return;
  end if;
  if extensions.crypt(coalesce(p_password, ''), v_hash) <> v_hash then
    insert into public.rate_events (action, key) values ('login_fail_' || p_role, v_conn);
    return query select 'wrong'::text, null::text, null::timestamptz; return;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_ends := now() + case when p_role = 'admin' then interval '12 hours' else interval '30 days' end;
  insert into public.access_sessions (token_hash, role, expires_at)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_role, v_ends);
  return query select 'ok'::text, v_token, v_ends;
end
$$;

-- The name given on the Approvals page for this token (or null)
create or replace function public.session_who(p_token text) returns text
language sql stable security definer set search_path = '' as $$
  select s.who from public.access_sessions s
  where coalesce(p_token, '') ~ '^[0-9a-f]{64}$'
    and s.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and s.expires_at > now()
$$;

-- Approvals page: who is approving on this browser. Answers the name as saved.
create or replace function public.admin_set_name(p_token text, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if char_length(v_name) not between 1 and 40 or v_name ~ '[<>]' then raise exception 'name_required'; end if;
  update public.access_sessions s set who = v_name
  where s.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  return v_name;
end
$$;

-- Is this browser still in? Answers 'leader', 'admin' or null
create or replace function public.access_check(p_token text) returns text
language sql stable security definer set search_path = '' as $$
  select public.session_role(p_token)
$$;

-- Leave on this browser
create or replace function public.access_logout(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.access_sessions s
  where s.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;


-- 5. Employee wishes ---------------------------------------
-- If you add a site in config.js, add its id to wishes_site_check below too.
create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  bms text not null,
  first_name text not null,
  message text not null,
  site text not null,
  lang text not null default 'en',
  tag_color text not null default 'cream',
  charm text not null default 'snow',
  consent boolean not null default false,
  status text not null default 'pending',
  flags text[] not null default '{}',
  reviewed_at timestamptz,
  approved_at timestamptz,
  edit_key_hash text,
  conn_code text,
  edit_count int not null default 0
);
-- Earlier versions: sign-in columns, phone numbers and IP addresses are removed
drop policy if exists "staff add wishes" on public.wishes;
drop policy if exists "own wishes or moderators read" on public.wishes;
drop policy if exists "moderators read wishes" on public.wishes;
drop policy if exists "moderators update wishes" on public.wishes;
drop policy if exists "moderators delete wishes" on public.wishes;
drop trigger if exists wishes_before_insert on public.wishes;
drop trigger if exists wishes_before_update on public.wishes;
drop function if exists public.wishes_before_insert();
drop function if exists public.wishes_before_update();
drop index if exists public.wishes_user_idx;
alter table public.wishes drop column if exists user_id;
alter table public.wishes drop column if exists email;
alter table public.wishes drop column if exists display_mode;
alter table public.wishes drop column if exists reviewed_by;
alter table public.wishes drop column if exists phone;
alter table public.wishes drop column if exists ip;
alter table public.wishes add column if not exists updated_at timestamptz;
alter table public.wishes add column if not exists bms text;
alter table public.wishes add column if not exists edit_key_hash text;
alter table public.wishes add column if not exists conn_code text;
alter table public.wishes add column if not exists edit_count int not null default 0;
-- Who approved or set it aside (the name typed on the Approvals page)
alter table public.wishes add column if not exists reviewer text;
-- A random code for the browser that sent it (the same code = the same phone or laptop). The Approvals page
-- flags wishes that came from the same device, so the team can spot one person using several BMS numbers.
alter table public.wishes add column if not exists device_id text;
create index if not exists wishes_device_idx on public.wishes (device_id) where device_id is not null;

alter table public.wishes drop constraint if exists wishes_bms_check;
alter table public.wishes add constraint wishes_bms_check check (char_length(bms) between 1 and 20) not valid;
alter table public.wishes drop constraint if exists wishes_first_name_check;
alter table public.wishes add constraint wishes_first_name_check check (char_length(btrim(first_name)) between 1 and 30) not valid;
-- Message length: 150 characters (keep MAX_LENGTH in config.js the same)
alter table public.wishes drop constraint if exists wishes_message_check;
alter table public.wishes add constraint wishes_message_check check (char_length(btrim(message)) between 1 and 150) not valid;
alter table public.wishes drop constraint if exists wishes_lang_check;
alter table public.wishes add constraint wishes_lang_check check (lang ~ '^[a-z]{2,3}$');
alter table public.wishes drop constraint if exists wishes_site_check;
alter table public.wishes add constraint wishes_site_check
  check (site in ('gtower', 'kcp', 'gbs', 'op', 'lv', 'jb', 'singha', 'wfh'));
alter table public.wishes drop constraint if exists wishes_tag_color_check;
alter table public.wishes add constraint wishes_tag_color_check check (tag_color in ('cream', 'red', 'gold'));
alter table public.wishes drop constraint if exists wishes_charm_check;
alter table public.wishes add constraint wishes_charm_check check (charm in ('snow', 'star', 'tree', 'gift'));
alter table public.wishes drop constraint if exists wishes_consent_check;
alter table public.wishes add constraint wishes_consent_check check (consent);
alter table public.wishes drop constraint if exists wishes_status_check;
alter table public.wishes add constraint wishes_status_check check (status in ('pending', 'approved', 'rejected'));
create index if not exists wishes_status_idx on public.wishes (status, approved_at desc);
create unique index if not exists wishes_bms_key on public.wishes (bms);

-- Winners. One prize per BMS: a person who has won can't win again (wisher or liker). A winning wish leaves the
-- like race: it comes off the tree and the lists, shows on the Winners tab, and its likes stop counting.
-- status: 'picked' (drawn, not checked yet), 'approved' (public), 'sent' (voucher sent), 'redrawn' (replaced).
create table if not exists public.prize_winners (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('wish', 'liker')),
  wish_id uuid references public.wishes(id) on delete cascade,
  bms text not null,
  prize text,
  reason text,
  status text not null default 'approved' check (status in ('picked', 'approved', 'sent', 'redrawn')),
  created_at timestamptz not null default now(),
  created_by text,
  sent_at timestamptz,
  sent_by text,
  check (kind <> 'wish' or wish_id is not null)
);
create unique index if not exists prize_winners_bms_key on public.prize_winners (bms) where status <> 'redrawn';
create unique index if not exists prize_winners_wish_key on public.prize_winners (wish_id) where wish_id is not null and status <> 'redrawn';


-- 6. Leaders' messages (one per name, approved before they show) --
create table if not exists public.leader_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_name text not null,
  title text,
  message text not null,
  lang text not null default 'en',
  photo text,
  photo_version int not null default 0,
  status text not null default 'pending',
  reviewed_at timestamptz,
  hidden boolean not null default false,
  sort_order int not null default 100,
  edit_key_hash text,
  conn_code text
);
-- Earlier versions: sign-in columns and photo links to Storage are removed
drop policy if exists "only leaders add a message" on public.leader_messages;
drop policy if exists "own message or moderators read" on public.leader_messages;
drop policy if exists "leaders edit own message" on public.leader_messages;
drop policy if exists "leaders remove own message" on public.leader_messages;
drop trigger if exists leader_messages_before_write on public.leader_messages;
drop function if exists public.leader_messages_before_write();
alter table public.leader_messages drop column if exists user_id;
alter table public.leader_messages drop column if exists email;
alter table public.leader_messages drop column if exists reviewed_by;
alter table public.leader_messages drop column if exists photo_url;
alter table public.leader_messages add column if not exists photo text;
alter table public.leader_messages add column if not exists photo_version int not null default 0;
alter table public.leader_messages add column if not exists status text not null default 'pending';
alter table public.leader_messages add column if not exists reviewed_at timestamptz;
alter table public.leader_messages add column if not exists edit_key_hash text;
alter table public.leader_messages add column if not exists conn_code text;
alter table public.leader_messages add column if not exists reviewer text;

alter table public.leader_messages drop constraint if exists leader_messages_display_name_check;
alter table public.leader_messages add constraint leader_messages_display_name_check
  check (char_length(btrim(display_name)) between 1 and 60);
alter table public.leader_messages drop constraint if exists leader_messages_title_check;
alter table public.leader_messages add constraint leader_messages_title_check
  check (title is null or char_length(title) <= 80);
-- Message length: 300 characters (keep LEADER_MAX_LENGTH in config.js the same)
alter table public.leader_messages drop constraint if exists leader_messages_message_check;
alter table public.leader_messages add constraint leader_messages_message_check
  check (char_length(btrim(message)) between 1 and 300) not valid;
alter table public.leader_messages drop constraint if exists leader_messages_lang_check;
alter table public.leader_messages add constraint leader_messages_lang_check check (lang ~ '^[a-z]{2,3}$');
alter table public.leader_messages drop constraint if exists leader_messages_status_check;
alter table public.leader_messages add constraint leader_messages_status_check
  check (status in ('pending', 'approved', 'rejected'));
-- Photo: a small JPEG kept with the message (the page shrinks it to 160 x 160 before sending)
alter table public.leader_messages drop constraint if exists leader_messages_photo_check;
alter table public.leader_messages add constraint leader_messages_photo_check
  check (photo is null or (char_length(photo) <= 60000 and photo ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$'));
create unique index if not exists leader_messages_name_key on public.leader_messages (lower(display_name));


-- 7. Likes -------------------------------------------------
create table if not exists public.likes (
  kind text not null check (kind in ('wish', 'leader')),
  target_id uuid not null,
  bms text,
  device_id text,
  conn_code text,
  created_at timestamptz not null default now()
);
-- Earlier versions: IP addresses are removed; likes count once per BMS
alter table public.likes drop column if exists ip;
alter table public.likes add column if not exists bms text;
alter table public.likes add column if not exists conn_code text;
alter table public.likes alter column device_id drop not null;
delete from public.likes where bms is null;
alter table public.likes drop constraint if exists likes_pkey;
alter table public.likes add constraint likes_pkey primary key (kind, target_id, bms);
alter table public.likes drop constraint if exists likes_bms_check;
alter table public.likes add constraint likes_bms_check check (bms ~ '^[0-9]{4,7}$');
create index if not exists likes_target_idx on public.likes (kind, target_id);
create index if not exists likes_bms_idx on public.likes (bms);
create index if not exists likes_device_idx on public.likes (device_id, kind, target_id);


-- 7b. What each admin did on the Approvals page (for the team's numbers) --
-- One row per decision: approved, set aside (rejected), back to waiting (pending) or deleted, by the name typed
-- on the Approvals page. wait_secs: how long the wish or message had been waiting when it was decided.
create table if not exists public.admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  who text,
  action text not null check (action in ('approved', 'rejected', 'pending', 'deleted')),
  kind text not null check (kind in ('wish', 'leader')),
  target_id uuid not null,
  edited boolean not null default false,
  wait_secs int
);
create index if not exists admin_log_who_idx on public.admin_log (who, kind);
-- The first time: what was already decided before this log existed
insert into public.admin_log (at, who, action, kind, target_id)
select coalesce(w.reviewed_at, now()), w.reviewer, w.status, 'wish', w.id
from public.wishes w where w.status <> 'pending' and not exists (select 1 from public.admin_log)
union all
select coalesce(m.reviewed_at, now()), m.reviewer, m.status, 'leader', m.id
from public.leader_messages m where m.status <> 'pending' and not exists (select 1 from public.admin_log);


-- 8. Locked down: the website never reads or writes a table directly ----
-- Earlier versions: email lists, sign-in rules and photo uploads are removed
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "leaders upload own photo" on storage.objects;
    drop policy if exists "leaders see own photos" on storage.objects;
    drop policy if exists "leaders replace own photo" on storage.objects;
    drop policy if exists "leaders delete own photo" on storage.objects;
  end if;
end
$$;
drop function if exists public.leader_profile();
drop function if exists public.am_i_moderator();
drop function if exists public.is_leader();
drop function if exists public.is_moderator();
drop function if exists public.email_allowed();
drop function if exists public.current_email();
drop table if exists public.leaders;
drop table if exists public.moderators;
drop table if exists public.bms_allowlist;

alter table public.app_settings enable row level security;
alter table public.private_salt enable row level security;
alter table public.rate_events enable row level security;
alter table public.prize_excluded enable row level security;
alter table public.prize_winners enable row level security;
alter table public.access_passwords enable row level security;
alter table public.access_sessions enable row level security;
alter table public.wishes enable row level security;
alter table public.leader_messages enable row level security;
alter table public.likes enable row level security;
alter table public.admin_log enable row level security;
-- No policies on purpose: the pages only reach the data through the functions below.
revoke all on public.prize_winners from anon, authenticated;
revoke all on public.app_settings, public.private_salt, public.rate_events, public.prize_excluded,
              public.access_passwords, public.access_sessions, public.wishes, public.leader_messages, public.likes,
              public.admin_log
  from anon, authenticated;


-- 9. What the pages can do -------------------------------------

-- Tree and TV pages: get_approved_wishes is in section 9b (it leaves out winners not announced yet)

-- Tree and TV pages: approved leaders' messages. Photos come separately (get_leader_photos) and only when
-- photo_version changes, so the pages don't download them every minute.
drop function if exists public.get_leader_messages();
create function public.get_leader_messages()
returns table (id uuid, display_name text, title text, message text, lang text, photo_version int,
               updated_at timestamptz, like_count int, spot text, sort_order int)
language sql stable security definer set search_path = '' as $$
  select m.id, m.display_name, m.title, m.message, m.lang,
         case when m.photo is null then 0 else m.photo_version end,
         m.updated_at,
         (select count(*) from public.likes l where l.kind = 'leader' and l.target_id = m.id)::int,
         'crown'::text, m.sort_order
  from public.leader_messages m
  where m.status = 'approved' and not m.hidden
  order by m.sort_order, m.created_at
$$;

drop function if exists public.get_leader_photos(uuid[]);
create function public.get_leader_photos(p_ids uuid[])
returns table (id uuid, photo text, photo_version int)
language sql stable security definer set search_path = '' as $$
  select m.id, m.photo, m.photo_version
  from public.leader_messages m
  where m.id = any (coalesce(p_ids, '{}'::uuid[])) and m.status = 'approved' and not m.hidden and m.photo is not null
  limit 60
$$;

-- Wish page: is it open?
drop function if exists public.get_settings();
create function public.get_settings()
returns table (submissions_open boolean, likes_close_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.submissions_open, s.likes_close_at from public.app_settings s where s.id = 1
$$;

-- Wish page: hang or edit a wish. One wish per BMS: sending again from the same browser (its edit key) or the
-- same device (its device code, e.g. after "Forget me") edits it and it goes back for approval; from any other
-- device the BMS is refused. One device, one BMS: a wish from a device that already sent a wish for a different
-- BMS is accepted quietly but set aside straight away (status 'rejected', reviewer AUTO_REVIEWER below), so the
-- team only approves it if the device is really shared. Wishes sent before device codes existed don't count.
-- Answers result 'ok', 'bms_taken' or 'slow_down' (answers, not errors, so the rate limits still count the attempt).
drop function if exists public.submit_wish(text, text, text, text, text, text, text, text, boolean, text);
drop function if exists public.submit_wish(text, text, text, text, text, text, text, boolean, text);
drop function if exists public.submit_wish(text, text, text, text, text, text, text, boolean, text, text);
create function public.submit_wish(
  p_bms text, p_name text, p_message text, p_site text, p_lang text,
  p_tag_color text, p_charm text, p_consent boolean, p_edit_key text default null, p_device text default null)
returns table (result text, wish_id uuid, edit_key text, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare
  st public.app_settings%rowtype;
  v_bms text := regexp_replace(coalesce(p_bms, ''), '[[:space:]]+', '', 'g');
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
  v_msg text := btrim(coalesce(p_message, ''));
  v_dev text := case when btrim(coalesce(p_device, '')) ~ '^[A-Za-z0-9-]{16,64}$' then btrim(p_device) end;
  v_conn text := public.conn_code();
  v_auto constant text := 'Automatic check';   -- AUTO_REVIEWER: shown as "Set aside by Automatic check"
  v_id uuid;
  v_hash text;
  v_wdev text;
  v_created timestamptz;
  v_key text;
  v_by_key boolean;
  v_shared boolean;
begin
  select * into st from public.app_settings where id = 1;
  if not found or not st.submissions_open then raise exception 'wishes_closed'; end if;
  if not coalesce(p_consent, false) then raise exception 'consent_required'; end if;
  if char_length(v_bms) not between 1 and 20 or v_bms ~ '[<>]' then raise exception 'bad_bms'; end if;
  if char_length(v_name) not between 1 and 30 or v_name ~ '[<>]' then raise exception 'name_required'; end if;
  if char_length(v_msg) not between 1 and 150 then raise exception 'bad_message'; end if;

  -- Generous for shared office connections, tight enough to stop a script
  if not public.rate_hit('submit', v_conn, 60, interval '10 minutes') then
    return query select 'slow_down'::text, null::uuid, null::text, false; return;
  end if;

  select w.id, w.edit_key_hash, w.device_id, w.created_at into v_id, v_hash, v_wdev, v_created
    from public.wishes w where w.bms = v_bms for update;
  if found then
    -- an edit needs this browser's edit key, or the device that sent the wish
    v_by_key := p_edit_key is not null and v_hash is not null and v_hash = encode(sha256(convert_to(p_edit_key, 'UTF8')), 'hex');
    if not (v_by_key or (v_dev is not null and v_wdev is not null and v_wdev = v_dev)) then
      return query select 'bms_taken'::text, null::uuid, null::text, false; return;
    end if;
    if not public.rate_hit('edit_bms', v_bms, 20, interval '1 hour') then
      return query select 'slow_down'::text, null::uuid, null::text, false; return;
    end if;
    -- the same device without the key (after "Forget me"): a fresh key for this browser
    v_key := case when v_by_key then p_edit_key else encode(extensions.gen_random_bytes(24), 'hex') end;
    -- set aside again if this device sent a wish for a different BMS before this one
    v_shared := coalesce(v_wdev, v_dev) is not null and exists (
      select 1 from public.wishes o
       where o.device_id = coalesce(v_wdev, v_dev) and o.bms <> v_bms and o.created_at < v_created);
    begin
      update public.wishes w
         set message = v_msg, first_name = v_name, site = p_site, lang = p_lang,
             tag_color = p_tag_color, charm = p_charm, consent = true,
             status = case when v_shared then 'rejected' else 'pending' end,
             reviewed_at = case when v_shared then now() end,
             reviewer = case when v_shared then v_auto else w.reviewer end,
             approved_at = null,
             flags = public.wish_flags(v_msg), updated_at = now(), edit_count = w.edit_count + 1, conn_code = v_conn,
             edit_key_hash = encode(sha256(convert_to(v_key, 'UTF8')), 'hex'),
             device_id = coalesce(w.device_id, v_dev)   -- a wish keeps the device that first sent it
       where w.id = v_id;
    exception when check_violation or not_null_violation then
      raise exception 'bad_input';   -- a plain message, so no row details go back to the browser
    end;
    return query select 'ok'::text, v_id, v_key, false;
    return;
  end if;

  -- a new BMS from a device that already sent a wish for another BMS: accepted, but set aside
  v_shared := v_dev is not null and exists (select 1 from public.wishes o where o.device_id = v_dev and o.bms <> v_bms);
  v_key := encode(extensions.gen_random_bytes(24), 'hex');
  begin
    insert into public.wishes (bms, first_name, message, site, lang, tag_color, charm, consent, flags, edit_key_hash, conn_code, device_id,
                               status, reviewer, reviewed_at)
    values (v_bms, v_name, v_msg, p_site, p_lang, p_tag_color, p_charm, true, public.wish_flags(v_msg),
            encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), v_conn, v_dev,
            case when v_shared then 'rejected' else 'pending' end,
            case when v_shared then v_auto end,
            case when v_shared then now() end)
    returning id into v_id;
  exception
    when unique_violation then
      return query select 'bms_taken'::text, null::uuid, null::text, false; return;
    when check_violation or not_null_violation then
      raise exception 'bad_input';
  end;
  return query select 'ok'::text, v_id, v_key, true;
end
$$;

-- Wish page: the wish sent from this browser (needs its edit key), so it can be edited
drop function if exists public.get_my_wish(text, text);
create function public.get_my_wish(p_bms text, p_edit_key text)
returns table (id uuid, first_name text, message text, site text, lang text, tag_color text, charm text,
               status text, like_count int, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.id, w.first_name, w.message, w.site, w.lang, w.tag_color, w.charm, w.status,
         (select count(*) from public.likes l where l.kind = 'wish' and l.target_id = w.id)::int,
         coalesce(w.updated_at, w.created_at)
  from public.wishes w
  where w.bms = btrim(coalesce(p_bms, ''))
    and p_edit_key is not null
    and w.edit_key_hash = encode(sha256(convert_to(p_edit_key, 'UTF8')), 'hex')
$$;

-- Tree page: like or unlike. Always answers 'ok' (or 'slow_down' under heavy load), so nobody can tell which
-- likes count. A like only counts with a device code, a real-looking BMS, not on your own wish, once per BMS,
-- once per device, and before app_settings.likes_close_at. Anything else is quietly dropped.
drop function if exists public.set_like(text, uuid, text, boolean);
drop function if exists public.set_like(text, uuid, text, boolean, text);
create function public.set_like(p_kind text, p_id uuid, p_bms text, p_on boolean, p_device text default null)
returns table (result text)
language plpgsql security definer set search_path = '' as $$
declare
  v_bms text := regexp_replace(coalesce(p_bms, ''), '[[:space:]]+', '', 'g');
  v_dev text := btrim(coalesce(p_device, ''));
  v_conn text := public.conn_code();
  v_close timestamptz;
begin
  if p_kind not in ('wish', 'leader') then
    raise exception 'bad_like';
  end if;
  if p_kind = 'wish' and not exists (select 1 from public.wishes w where w.id = p_id and w.status = 'approved') then
    raise exception 'not_found';
  end if;
  if p_kind = 'leader' and not exists (select 1 from public.leader_messages m where m.id = p_id and m.status = 'approved' and not m.hidden) then
    raise exception 'not_found';
  end if;
  if not public.rate_hit('like', v_conn, 400, interval '10 minutes')
     or not public.rate_hit('like_dev', v_dev, 120, interval '10 minutes') then
    return query select 'slow_down'::text; return;
  end if;

  if not coalesce(p_on, false) then
    -- unlike: removes the like this device made
    if v_dev <> '' then
      delete from public.likes l where l.kind = p_kind and l.target_id = p_id and l.device_id = v_dev;
    end if;
    return query select 'ok'::text; return;
  end if;

  select s.likes_close_at into v_close from public.app_settings s where s.id = 1;
  if (v_close is not null and now() > v_close)                                  -- after the deadline
     or v_dev !~ '^[A-Za-z0-9-]{16,64}$'                                          -- no device code
     or not public.bms_ok(v_bms)                                                  -- short, long or made-up BMS
     or (p_kind = 'wish' and exists (select 1 from public.wishes w where w.id = p_id and w.bms = v_bms))   -- own wish
     or (p_kind = 'wish' and exists (select 1 from public.prize_winners p where p.wish_id = p_id and p.status <> 'redrawn'))   -- already won
     or exists (select 1 from public.likes l where l.kind = p_kind and l.target_id = p_id and l.device_id = v_dev)  -- this device already liked it
  then
    return query select 'ok'::text; return;
  end if;

  insert into public.likes (kind, target_id, bms, device_id, conn_code)
  values (p_kind, p_id, v_bms, v_dev, v_conn)
  on conflict do nothing;                                                         -- this BMS already liked it elsewhere
  return query select 'ok'::text;
end
$$;

-- Tree page: the likes this device made that counted (so a reload shows the truth)
drop function if exists public.get_device_likes(text);
create function public.get_device_likes(p_device text)
returns table (kind text, target_id uuid)
language sql stable security definer set search_path = '' as $$
  select l.kind, l.target_id from public.likes l
  where coalesce(p_device, '') ~ '^[A-Za-z0-9-]{16,64}$' and l.device_id = p_device
$$;

-- Leaders' page (needs a leaders' password token): send or edit a message. One message per name.
-- Sending again from the same browser edits it (its edit key); the name stays as it was first sent.
-- Every change waits for approval. Answers result 'ok', 'name_taken', 'signed_out' or 'slow_down'.
drop function if exists public.leader_save(text, text, text, text, text, boolean, text);
create function public.leader_save(p_token text, p_name text, p_title text, p_message text,
                                   p_photo text, p_photo_change boolean, p_edit_key text default null)
returns table (result text, message_id uuid, edit_key text, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
  v_title text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g')), '');
  v_msg text := btrim(coalesce(p_message, ''));
  v_photo text := nullif(btrim(coalesce(p_photo, '')), '');
  v_conn text := public.conn_code();
  v_id uuid;
  v_key text;
begin
  if public.session_role(p_token) is distinct from 'leader' then
    return query select 'signed_out'::text, null::uuid, null::text, false; return;
  end if;
  if not public.rate_hit('leader_save', v_conn, 30, interval '1 hour') then
    return query select 'slow_down'::text, null::uuid, null::text, false; return;
  end if;
  if char_length(v_name) not between 1 and 60 or v_name ~ '[<>]' then raise exception 'name_required'; end if;
  if v_title is not null and (char_length(v_title) > 80 or v_title ~ '[<>]') then raise exception 'bad_title'; end if;
  if char_length(v_msg) not between 1 and 300 then raise exception 'bad_message'; end if;
  -- Leaders' messages are in English only: no Thai, Chinese, Japanese, Korean, Tamil, Arabic and other non-Latin scripts
  if (v_msg || ' ' || coalesce(v_title, '') || ' ' || v_name)
     ~ '[\u0590-\u08FF\u0900-\u0DFF\u0E00-\u0EFF\u1000-\u109F\u1100-\u11FF\u3040-\u30FF\u3100-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]' then
    raise exception 'english_only';
  end if;
  if v_photo is not null and (char_length(v_photo) > 60000 or v_photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$') then
    raise exception 'bad_photo';
  end if;

  if p_edit_key is not null then
    select m.id into v_id from public.leader_messages m
    where m.edit_key_hash = encode(sha256(convert_to(p_edit_key, 'UTF8')), 'hex')
    for update;
  end if;
  if v_id is not null then
    update public.leader_messages m
       set title = v_title, message = v_msg, lang = 'en',
           photo = case when coalesce(p_photo_change, false) then v_photo else m.photo end,
           photo_version = case when coalesce(p_photo_change, false) then m.photo_version + 1 else m.photo_version end,
           status = 'pending', reviewed_at = null, updated_at = now(), conn_code = v_conn
     where m.id = v_id;
    return query select 'ok'::text, v_id, p_edit_key, false;
    return;
  end if;

  v_key := encode(extensions.gen_random_bytes(24), 'hex');
  begin
    insert into public.leader_messages (display_name, title, message, lang, photo, photo_version, status, edit_key_hash, conn_code)
    values (v_name, v_title, v_msg, 'en', v_photo, case when v_photo is null then 0 else 1 end, 'pending',
            encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), v_conn)
    returning id into v_id;
  exception
    when unique_violation then
      return query select 'name_taken'::text, null::uuid, null::text, false; return;
    when check_violation or not_null_violation then
      raise exception 'bad_input';
  end;
  return query select 'ok'::text, v_id, v_key, true;
end
$$;

-- Leaders' page: the message sent from this browser
drop function if exists public.leader_get_mine(text, text);
create function public.leader_get_mine(p_token text, p_edit_key text)
returns table (id uuid, display_name text, title text, message text, photo text, status text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.display_name, m.title, m.message, m.photo, m.status, m.updated_at
  from public.leader_messages m
  where public.session_role(p_token) = 'leader'
    and p_edit_key is not null
    and m.edit_key_hash = encode(sha256(convert_to(p_edit_key, 'UTF8')), 'hex')
$$;

-- Leaders' page: remove the message sent from this browser
drop function if exists public.leader_delete_mine(text, text);
create function public.leader_delete_mine(p_token text, p_edit_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if public.session_role(p_token) is distinct from 'leader' or p_edit_key is null then return false; end if;
  delete from public.leader_messages m
  where m.edit_key_hash = encode(sha256(convert_to(p_edit_key, 'UTF8')), 'hex')
  returning m.id into v_id;
  if v_id is null then return false; end if;
  delete from public.likes l where l.kind = 'leader' and l.target_id = v_id;
  return true;
end
$$;

-- Approvals page (needs the Approvals password token) ---------
drop function if exists public.admin_queue(text);
create function public.admin_queue(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  return json_build_object(
    'wishes', coalesce((select json_agg(x) from (
      select w.id, w.created_at, w.updated_at, w.message, w.first_name, w.bms, w.site, w.lang, w.tag_color, w.charm,
             w.status, w.flags, w.reviewed_at, w.approved_at, w.edit_count, w.reviewer,
             (select count(*) from public.likes l where l.kind = 'wish' and l.target_id = w.id)::int as like_count,
             -- other wishes sent from the same device (BMS only, no names), e.g. 'BMS 12345, BMS 67890'
             (select string_agg('BMS ' || o.bms, ', ' order by o.created_at)
                from public.wishes o
               where w.device_id is not null and o.device_id = w.device_id and o.id <> w.id) as same_device,
             (select coalesce(p.prize, 'Prize to be decided') from public.prize_winners p
               where p.wish_id = w.id and p.status <> 'redrawn' limit 1) as winner
      from public.wishes w order by w.created_at desc limit 5000) x), '[]'::json),
    'winners', coalesce((select json_agg(x order by x.created_at desc) from (
      select p.id, p.kind, p.wish_id, p.bms, p.prize, p.reason, p.status, p.created_at, p.created_by, p.sent_at, p.sent_by,
             w.first_name, w.site
      from public.prize_winners p left join public.wishes w on w.id = p.wish_id
      where p.status <> 'redrawn') x), '[]'::json),
    -- photos of approved messages come from get_leader_photos; the others come here, to be checked
    'leaders', coalesce((select json_agg(x) from (
      select m.id, m.created_at, m.updated_at, m.display_name, m.title, m.message, m.lang,
             case when m.status = 'approved' then null else m.photo end as photo,
             case when m.photo is null then 0 else m.photo_version end as photo_version,
             m.status, m.hidden, m.reviewed_at, m.sort_order, m.reviewer,
             (select count(*) from public.likes l where l.kind = 'leader' and l.target_id = m.id)::int as like_count
      from public.leader_messages m order by m.updated_at desc) x), '[]'::json),
    'settings', (select json_build_object('submissions_open', s.submissions_open, 'likes_close_at', s.likes_close_at)
                 from public.app_settings s where s.id = 1),
    'me', public.session_who(p_token)
  );
end
$$;

-- Approve, set aside or move back to waiting (one or many). Each change is logged for the team's numbers.
drop function if exists public.admin_set_status(text, text, uuid[], text);
create function public.admin_set_status(p_token text, p_kind text, p_ids uuid[], p_status text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
  v_who text := public.session_who(p_token);
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'bad_status'; end if;
  if p_kind = 'wish' then
    with u as (
      update public.wishes w
         set status = p_status,
             reviewed_at = case when p_status = 'pending' then null else now() end,
             reviewer = case when p_status = 'pending' then null else v_who end,
             approved_at = case when p_status <> 'approved' then null
                                when w.status = 'approved' then w.approved_at else now() end
       where w.id = any (coalesce(p_ids, '{}'::uuid[]))
      returning w.id, coalesce(w.updated_at, w.created_at) as since
    )
    insert into public.admin_log (who, action, kind, target_id, wait_secs)
    select v_who, p_status, 'wish', u.id, greatest(0, extract(epoch from now() - u.since))::int from u;
  elsif p_kind = 'leader' then
    with u as (
      update public.leader_messages m
         set status = p_status,
             reviewed_at = case when p_status = 'pending' then null else now() end,
             reviewer = case when p_status = 'pending' then null else v_who end
       where m.id = any (coalesce(p_ids, '{}'::uuid[]))
      returning m.id, m.updated_at as since
    )
    insert into public.admin_log (who, action, kind, target_id, wait_secs)
    select v_who, p_status, 'leader', u.id, greatest(0, extract(epoch from now() - u.since))::int from u;
  else
    raise exception 'bad_kind';
  end if;
  get diagnostics n = row_count;
  return n;
end
$$;

-- Fix a small thing in the words and approve in one step
drop function if exists public.admin_edit_message(text, text, uuid, text);
create function public.admin_edit_message(p_token text, p_kind text, p_id uuid, p_message text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_msg text := btrim(coalesce(p_message, ''));
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if p_kind = 'wish' then
    if char_length(v_msg) not between 1 and 150 then raise exception 'bad_message'; end if;
    update public.wishes w
       set message = v_msg, flags = public.wish_flags(v_msg), status = 'approved', reviewed_at = now(),
           reviewer = public.session_who(p_token),
           approved_at = case when w.status = 'approved' then w.approved_at else now() end
     where w.id = p_id;
  elsif p_kind = 'leader' then
    if char_length(v_msg) not between 1 and 300 then raise exception 'bad_message'; end if;
    update public.leader_messages m set message = v_msg, status = 'approved', reviewed_at = now(),
           reviewer = public.session_who(p_token) where m.id = p_id;
  else
    raise exception 'bad_kind';
  end if;
  if not found then return false; end if;
  insert into public.admin_log (who, action, kind, target_id, edited)
  values (public.session_who(p_token), 'approved', p_kind, p_id, true);
  return true;
end
$$;

-- Change any part of a wish (name, words, site, language, tag colour, charm). Saving also approves it.
-- Answers 'ok' or 'not_found'.
drop function if exists public.admin_edit_wish(text, uuid, text, text, text, text, text, text);
create function public.admin_edit_wish(p_token text, p_id uuid, p_name text, p_message text, p_site text,
                                       p_lang text, p_tag_color text, p_charm text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
  v_msg text := btrim(coalesce(p_message, ''));
  v_since timestamptz;
  n int;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if char_length(v_name) not between 1 and 30 or v_name ~ '[<>]' then raise exception 'name_required'; end if;
  if char_length(v_msg) not between 1 and 150 then raise exception 'bad_message'; end if;
  begin
    update public.wishes w
       set first_name = v_name, message = v_msg, site = p_site, lang = p_lang,
           tag_color = p_tag_color, charm = p_charm, flags = public.wish_flags(v_msg),
           status = 'approved', reviewed_at = now(), reviewer = public.session_who(p_token),
           approved_at = case when w.status = 'approved' then w.approved_at else now() end
     where w.id = p_id
    returning coalesce(w.updated_at, w.created_at) into v_since;
    get diagnostics n = row_count;
  exception when check_violation or not_null_violation then
    raise exception 'bad_input';
  end;
  if n = 0 then return 'not_found'; end if;
  insert into public.admin_log (who, action, kind, target_id, edited, wait_secs)
  values (public.session_who(p_token), 'approved', 'wish', p_id, true, greatest(0, extract(epoch from now() - v_since))::int);
  return 'ok';
end
$$;

-- Change any part of a leader message (name, title, words, photo, place in the list). Saving also approves it.
-- p_position 1-99 puts it at that place in the list; null keeps the order of LEADERS in config.js.
-- Answers 'ok', 'name_taken' or 'not_found'.
drop function if exists public.admin_edit_leader(text, uuid, text, text, text, text, boolean, int);
create function public.admin_edit_leader(p_token text, p_id uuid, p_name text, p_title text, p_message text,
                                         p_photo text, p_photo_change boolean, p_position int)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
  v_title text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g')), '');
  v_msg text := btrim(coalesce(p_message, ''));
  v_photo text := nullif(btrim(coalesce(p_photo, '')), '');
  v_since timestamptz;
  n int;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if char_length(v_name) not between 1 and 60 or v_name ~ '[<>]' then raise exception 'name_required'; end if;
  if v_title is not null and (char_length(v_title) > 80 or v_title ~ '[<>]') then raise exception 'bad_title'; end if;
  if char_length(v_msg) not between 1 and 300 then raise exception 'bad_message'; end if;
  if (v_msg || ' ' || coalesce(v_title, '') || ' ' || v_name)
     ~ '[\u0590-\u08FF\u0900-\u0DFF\u0E00-\u0EFF\u1000-\u109F\u1100-\u11FF\u3040-\u30FF\u3100-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]' then
    raise exception 'english_only';
  end if;
  if coalesce(p_photo_change, false) and v_photo is not null
     and (char_length(v_photo) > 60000 or v_photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$') then
    raise exception 'bad_photo';
  end if;
  if p_position is not null and p_position not between 1 and 99 then raise exception 'bad_position'; end if;
  begin
    update public.leader_messages m
       set display_name = v_name, title = v_title, message = v_msg, lang = 'en',
           photo = case when coalesce(p_photo_change, false) then v_photo else m.photo end,
           photo_version = case when coalesce(p_photo_change, false) then m.photo_version + 1 else m.photo_version end,
           sort_order = coalesce(p_position, 100),
           status = 'approved', reviewed_at = now(), reviewer = public.session_who(p_token)
     where m.id = p_id
    returning m.updated_at into v_since;
    get diagnostics n = row_count;
  exception
    when unique_violation then
      return 'name_taken';
    when check_violation or not_null_violation then
      raise exception 'bad_input';
  end;
  if n = 0 then return 'not_found'; end if;
  insert into public.admin_log (who, action, kind, target_id, edited, wait_secs)
  values (public.session_who(p_token), 'approved', 'leader', p_id, true, greatest(0, extract(epoch from now() - v_since))::int);
  return 'ok';
end
$$;

-- The team's numbers: per admin name and per kind, how many wishes or messages they reviewed (approved, set aside
-- or deleted), accepted, set aside, edited and deleted, how long things waited on average before they decided,
-- and when they last did something
drop function if exists public.admin_kpi(text);
create function public.admin_kpi(p_token text)
returns table (who text, kind text, reviewed int, accepted int, set_aside int, edited int, deleted int,
               avg_wait_mins int, last_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  return query
  select coalesce(nullif(btrim(l.who), ''), 'Name not given') as who, l.kind,
         (count(distinct l.target_id) filter (where l.action in ('approved', 'rejected', 'deleted')))::int,
         (count(distinct l.target_id) filter (where l.action = 'approved'))::int,
         (count(distinct l.target_id) filter (where l.action = 'rejected'))::int,
         (count(distinct l.target_id) filter (where l.edited))::int,
         (count(distinct l.target_id) filter (where l.action = 'deleted'))::int,
         round(avg(l.wait_secs) filter (where l.action in ('approved', 'rejected', 'deleted')) / 60.0)::int,
         max(l.at)
  from public.admin_log l
  group by 1, 2
  order by 3 desc, 1;
end
$$;

-- The prize standings with BMS, and signs of like-farming (many likes from one connection)
drop function if exists public.get_prize_check(int);
drop function if exists public.get_prize_check(text, int);
create function public.get_prize_check(p_token text, p_limit int default 10)
returns table (id uuid, first_name text, bms text, site text, message text, like_count int,
               connections int, most_from_one_connection int, last_like_at timestamptz, excluded boolean, bms_ok boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  return query
  select w.id, w.first_name, w.bms, w.site, w.message, count(l.bms)::int,
         count(distinct l.conn_code)::int,
         coalesce((select max(c) from (select count(*)::int as c from public.likes l2
                   where l2.kind = 'wish' and l2.target_id = w.id group by l2.conn_code) q), 0),
         max(l.created_at),
         exists (select 1 from public.prize_excluded e where e.bms = w.bms),
         public.bms_ok(w.bms)
  from public.wishes w
  join public.likes l on l.kind = 'wish' and l.target_id = w.id
  where w.status = 'approved'
    and not exists (select 1 from public.prize_winners p where p.status <> 'redrawn' and (p.wish_id = w.id or p.bms = w.bms))
  group by w.id
  order by count(l.bms) desc, max(l.created_at) asc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
end
$$;

-- Who liked one wish (BMS, connection code, time)
drop function if exists public.get_wish_likes(uuid);
drop function if exists public.get_wish_likes(text, uuid);
create function public.get_wish_likes(p_token text, p_id uuid)
returns table (bms text, connection text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  return query select l.bms, l.conn_code, l.created_at from public.likes l
  where l.kind = 'wish' and l.target_id = p_id order by l.created_at;
end
$$;

-- Remove every like made with one BMS (for likes that look faked)
drop function if exists public.remove_likes_by_bms(text);
drop function if exists public.remove_likes_by_bms(text, text);
create function public.remove_likes_by_bms(p_token text, p_bms text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  delete from public.likes l where l.bms = btrim(coalesce(p_bms, ''));
  get diagnostics n = row_count;
  return n;
end
$$;

-- Open or close new wishes
drop function if exists public.update_settings(boolean, boolean);
drop function if exists public.update_settings(text, boolean);
create function public.update_settings(p_token text, p_submissions_open boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  update public.app_settings set submissions_open = coalesce(p_submissions_open, submissions_open) where id = 1;
end
$$;

-- Function rights. Supabase lets everyone run new functions by default, so the internal ones are locked.
revoke execute on function public.rate_hit(text, text, int, interval) from public, anon, authenticated;
revoke execute on function public.bms_ok(text) from public, anon, authenticated;
revoke execute on function public.bms_looks_real(text) from public, anon, authenticated;
revoke execute on function public.conn_code() from public, anon, authenticated;
revoke execute on function public.wish_flags(text) from public, anon, authenticated;
revoke execute on function public.session_role(text) from public, anon, authenticated;
revoke execute on function public.session_who(text) from public, anon, authenticated;
revoke execute on function public.set_access_password(text, text) from public, anon, authenticated;
-- Everyone (each checks a password token or only shows approved things)
grant execute on function public.get_leader_messages() to anon, authenticated;
grant execute on function public.get_leader_photos(uuid[]) to anon, authenticated;
grant execute on function public.get_settings() to anon, authenticated;
grant execute on function public.submit_wish(text, text, text, text, text, text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.get_my_wish(text, text) to anon, authenticated;
grant execute on function public.set_like(text, uuid, text, boolean, text) to anon, authenticated;
grant execute on function public.get_device_likes(text) to anon, authenticated;
grant execute on function public.access_login(text, text) to anon, authenticated;
grant execute on function public.access_check(text) to anon, authenticated;
grant execute on function public.access_logout(text) to anon, authenticated;
grant execute on function public.leader_save(text, text, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.leader_get_mine(text, text) to anon, authenticated;
grant execute on function public.leader_delete_mine(text, text) to anon, authenticated;
grant execute on function public.admin_queue(text) to anon, authenticated;
grant execute on function public.admin_set_name(text, text) to anon, authenticated;
grant execute on function public.admin_set_status(text, text, uuid[], text) to anon, authenticated;
grant execute on function public.admin_edit_message(text, text, uuid, text) to anon, authenticated;
grant execute on function public.admin_edit_wish(text, uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_edit_leader(text, uuid, text, text, text, text, boolean, int) to anon, authenticated;
grant execute on function public.admin_kpi(text) to anon, authenticated;
grant execute on function public.get_prize_check(text, int) to anon, authenticated;
grant execute on function public.get_wish_likes(text, uuid) to anon, authenticated;
grant execute on function public.remove_likes_by_bms(text, text) to anon, authenticated;
grant execute on function public.update_settings(text, boolean) to anon, authenticated;


-- 9b. Daily Grab voucher draw ---------------------------------
-- Every day from 1 December each country has winners by likes ('top'), random wishes ('random') and random likers
-- ('liker'), as set in prize_plan. On the Approvals page an admin draws a day's winners (the evening before) and
-- approves them. Approved winners go live at 9 am Malaysia time on their day, and each one gets the next unused
-- Grab code. Only the phone that made the winning wish (or the winning likes) can open that code.
-- The codes are added on the Approvals page. Nobody can read a code except the winner's phone, or an approver who
-- presses Show code for a winner whose phone can't open it (logged with their name, at most 20 an hour for everyone).
-- Rules: one prize per person (BMS). Anyone drawn once is out of later draws, also when they were redrawn.

-- Which country a wish counts for: Singha Complex is Thailand; work from home counts as Thailand when the wish is
-- in Thai. Everything else is Malaysia. (Change this if you add a site in Thailand.)
create or replace function public.wish_country(p_site text, p_lang text) returns text
language sql immutable set search_path = '' as $$
  select case when p_site = 'singha' then 'TH'
              when p_site = 'wfh' and p_lang = 'th' then 'TH'
              else 'MY' end
$$;

-- The plan: how many winners a day, for which prize, from which day to which day.
-- Days that weren't drawn, or had too few people, carry over to the next draw.
create table if not exists public.prize_plan (
  country text not null check (country in ('MY', 'TH')),
  pool text not null check (pool in ('top', 'random', 'liker')),
  prize text not null,
  per_day int not null check (per_day between 0 and 20),
  first_day date not null,
  last_day date not null,
  primary key (country, pool),
  check (last_day >= first_day)
);
insert into public.prize_plan (country, pool, prize, per_day, first_day, last_day) values
  ('MY', 'top',    'RM 50',   3, '2026-12-01', '2026-12-18'),
  ('MY', 'random', 'RM 20',   3, '2026-12-01', '2026-12-18'),
  ('MY', 'liker',  'RM 20',   1, '2026-12-01', '2026-12-18'),
  ('TH', 'top',    'THB 250', 1, '2026-12-01', '2026-12-16'),
  ('TH', 'random', 'THB 250', 1, '2026-12-01', '2026-12-16'),
  ('TH', 'liker',  'THB 250', 1, '2026-12-01', '2026-12-16')
on conflict (country, pool) do nothing;
-- The lucky draw (pool 'random') leaves out the most-liked wishes still in the race: they got their likes partly by
-- hanging on the tree, and they can win Most liked anyway. Malaysia: the top 10; Thailand (few wishes): the top 3.
alter table public.prize_plan add column if not exists skip_top int not null default 0 check (skip_top between 0 and 50);
update public.prize_plan set skip_top = case when country = 'MY' then 10 else 3 end
where pool = 'random' and skip_top = 0;

-- Winners get a country, a pool (early = picked by hand before the daily draw), the day they go live, and for
-- likers the phones (device codes) their likes came from when they were drawn
alter table public.prize_winners add column if not exists country text check (country in ('MY', 'TH'));
alter table public.prize_winners add column if not exists pool text check (pool in ('early', 'manual', 'top', 'random', 'liker'));
alter table public.prize_winners add column if not exists draw_day date;
alter table public.prize_winners add column if not exists live_at timestamptz;
alter table public.prize_winners add column if not exists devices text[];
alter table public.prize_winners add column if not exists likes_at_draw int;
alter table public.prize_winners add column if not exists approved_at timestamptz;
alter table public.prize_winners add column if not exists approved_by text;
alter table public.prize_winners add column if not exists redraw_reason text;
alter table public.prize_winners add column if not exists redrawn_at timestamptz;
alter table public.prize_winners add column if not exists redrawn_by text;
alter table public.prize_winners add column if not exists replaces bigint;
-- Before approving, someone on the team checks the BMS is a real person (from the day's list); the whole team sees it
alter table public.prize_winners add column if not exists bms_checked_at timestamptz;
alter table public.prize_winners add column if not exists bms_checked_by text;
-- The winners picked by hand before the daily draw: RM 50 (THB 250 in Thailand), live since they were picked
update public.prize_winners p
set country = coalesce((select public.wish_country(w.site, w.lang) from public.wishes w where w.id = p.wish_id), 'MY'),
    pool = 'early',
    live_at = coalesce(p.live_at, p.created_at),
    approved_at = coalesce(p.approved_at, case when p.status in ('approved', 'sent') then p.created_at end),
    approved_by = coalesce(p.approved_by, p.created_by)
where p.pool is null;
update public.prize_winners p
set prize = case when p.country = 'TH' then 'THB 250' else 'RM 50' end
where p.pool = 'early' and p.prize is null;
-- ...and they're announced with the first daily winners: 9 am on 1 December
update public.prize_winners
set live_at = '2026-12-01 09:00:00+08'
where pool = 'early' and status in ('picked', 'approved') and live_at < '2026-12-01 09:00:00+08';
-- ...once an admin approves them on the Prize draw page, like every other winner
update public.prize_winners
set status = 'picked', approved_at = null, approved_by = null
where pool = 'early' and status = 'approved' and approved_at = created_at
  and not exists (select 1 from public.prize_codes c where c.winner_id = prize_winners.id);

-- Days already drawn, per country (days are drawn in order)
create table if not exists public.prize_draw_days (
  country text not null check (country in ('MY', 'TH')),
  day date not null,
  at timestamptz not null default now(),
  who text,
  primary key (country, day)
);

-- The Grab codes (or links). winner_id: who it's set aside for. given_at: the first time it was shown (to the
-- winner's phone, or to the prize owner to send by WhatsApp). A code that was shown is never given to anyone else.
create table if not exists public.prize_codes (
  id bigint generated always as identity primary key,
  country text not null check (country in ('MY', 'TH')),
  prize text not null,
  code text not null unique check (char_length(code) between 4 and 500),
  expires_on date,
  added_at timestamptz not null default now(),
  added_by text,
  winner_id bigint unique references public.prize_winners(id) on delete set null,
  assigned_at timestamptz,
  given_at timestamptz,
  given_how text check (given_how in ('phone', 'whatsapp')),
  views int not null default 0
);
create index if not exists prize_codes_free_idx on public.prize_codes (country, prize) where winner_id is null and given_at is null;

-- Everything that happens to a prize or a code (never the code itself)
create table if not exists public.prize_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  who text,
  action text not null,
  winner_id bigint,
  code_id bigint,
  detail text,
  conn text
);
create index if not exists prize_log_winner_idx on public.prize_log (winner_id);

alter table public.prize_plan enable row level security;
alter table public.prize_draw_days enable row level security;
alter table public.prize_codes enable row level security;
alter table public.prize_log enable row level security;
-- No policies on purpose: only the functions below reach these tables
revoke all on public.prize_plan, public.prize_draw_days, public.prize_codes, public.prize_log
  from anon, authenticated;

-- Wishes that can still win in a country: approved, a real-looking BMS, not excluded, never drawn before
create or replace function public.prize_wish_pool(p_country text)
returns table (id uuid, bms text, like_count int, approved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.id, w.bms,
         (select count(*) from public.likes l where l.kind = 'wish' and l.target_id = w.id)::int,
         w.approved_at
  from public.wishes w
  where w.status = 'approved'
    and public.wish_country(w.site, w.lang) = p_country
    and public.bms_ok(w.bms)
    and not exists (select 1 from public.prize_excluded e where e.bms = w.bms)
    and not exists (select 1 from public.prize_winners p where p.bms = w.bms or p.wish_id = w.id)
$$;

-- Likers who can still win in a country, with the phones they liked from. A liker counts for the country of their
-- own wish, or (no wish) the country most of their likes went to. Phones used with more than one BMS are left out,
-- and so is everyone who liked from such a phone.
create or replace function public.prize_liker_pool(p_country text)
returns table (bms text, devices text[])
language sql stable security definer set search_path = '' as $$
  with lk as (
    select l.bms, l.device_id, l.kind, l.target_id from public.likes l where public.bms_ok(l.bms)
  ), shared as (
    select l.device_id from public.likes l where l.device_id is not null
    group by l.device_id having count(distinct l.bms) > 1
  ), cand as (
    select lk.bms, array_agg(distinct lk.device_id) filter (where lk.device_id is not null) as devs
    from lk
    group by lk.bms
    having count(lk.device_id) > 0
       and not bool_or(coalesce(lk.device_id in (select s.device_id from shared s), false))
  ), own as (
    select distinct on (w.bms) w.bms, public.wish_country(w.site, w.lang) as c
    from public.wishes w order by w.bms, (w.status = 'approved') desc, w.created_at
  ), lc as (
    select lk.bms, count(*) filter (where public.wish_country(w.site, w.lang) = 'TH') as th, count(*) as n
    from lk join public.wishes w on lk.kind = 'wish' and w.id = lk.target_id
    group by lk.bms
  )
  select c.bms, c.devs
  from cand c left join own o on o.bms = c.bms left join lc on lc.bms = c.bms
  where coalesce(o.c, case when coalesce(lc.th, 0) * 2 > coalesce(lc.n, 0) then 'TH' else 'MY' end) = p_country
    and not exists (select 1 from public.prize_excluded e where e.bms = c.bms)
    and not exists (select 1 from public.prize_winners p where p.bms = c.bms)
$$;

-- Set aside the next unused code for an approved winner (soonest to expire first). Answers the code's id or null.
create or replace function public.prize_assign_code(p_winner_id bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  w public.prize_winners;
  v_code bigint;
begin
  select * into w from public.prize_winners p where p.id = p_winner_id;
  if not found or w.status not in ('approved', 'sent') then return null; end if;
  select c.id into v_code from public.prize_codes c where c.winner_id = w.id;
  if v_code is not null then return v_code; end if;
  select c.id into v_code from public.prize_codes c
  where c.winner_id is null and c.given_at is null and c.country = w.country and c.prize = w.prize
    and (c.expires_on is null or c.expires_on >= (now() at time zone 'Asia/Kuala_Lumpur')::date)
  order by c.expires_on nulls last, c.id
  limit 1 for update skip locked;
  if v_code is null then return null; end if;
  update public.prize_codes c set winner_id = w.id, assigned_at = now() where c.id = v_code;
  insert into public.prize_log (who, action, winner_id, code_id) values ('system', 'code_set_aside', w.id, v_code);
  return v_code;
end
$$;

-- Draw winners for one pool of one day (used by the draw and by a redraw). Answers how many were drawn.
create or replace function public.prize_draw_pool(p_country text, p_pool text, p_day date, p_n int, p_who text,
                                                  p_replaces bigint default null)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_prize text;
  v_reason text;
  v_skip int := 0;
  n int := 0;
  r record;
begin
  if coalesce(p_n, 0) < 1 then return 0; end if;
  select pp.prize into v_prize from public.prize_plan pp where pp.country = p_country and pp.pool = p_pool;
  if v_prize is null then return 0; end if;
  v_reason := case p_pool when 'top' then 'Most liked' when 'random' then 'Lucky draw' else 'Lucky liker' end;
  if p_pool = 'top' then
    -- The top of the Most liked list: most likes first; same likes, the one approved first. At least 1 like.
    for r in select q.id, q.bms, q.like_count from public.prize_wish_pool(p_country) q
             where q.like_count >= 1 order by q.like_count desc, q.approved_at asc limit p_n loop
      insert into public.prize_winners (kind, wish_id, bms, prize, reason, status, created_by, country, pool, draw_day, likes_at_draw, replaces)
      values ('wish', r.id, r.bms, v_prize, v_reason, 'picked', p_who, p_country, p_pool, p_day, r.like_count, p_replaces);
      n := n + 1;
    end loop;
  elsif p_pool = 'random' then
    -- the lucky draw leaves out the top of the Most liked list (prize_plan.skip_top)
    select coalesce(pp.skip_top, 0) into v_skip from public.prize_plan pp where pp.country = p_country and pp.pool = 'random';
    for r in select q.id, q.bms, q.like_count from public.prize_wish_pool(p_country) q
             where q.id not in (select t.id from public.prize_wish_pool(p_country) t where t.like_count >= 1
                                order by t.like_count desc, t.approved_at asc limit coalesce(v_skip, 0))
             order by gen_random_uuid() limit p_n loop
      insert into public.prize_winners (kind, wish_id, bms, prize, reason, status, created_by, country, pool, draw_day, likes_at_draw, replaces)
      values ('wish', r.id, r.bms, v_prize, v_reason, 'picked', p_who, p_country, p_pool, p_day, r.like_count, p_replaces);
      n := n + 1;
    end loop;
  elsif p_pool = 'liker' then
    for r in select q.bms, q.devices from public.prize_liker_pool(p_country) q
             order by gen_random_uuid() limit p_n loop
      insert into public.prize_winners (kind, wish_id, bms, prize, reason, status, created_by, country, pool, draw_day, devices, replaces)
      values ('liker', null, r.bms, v_prize, v_reason, 'picked', p_who, p_country, p_pool, p_day, r.devices, p_replaces);
      n := n + 1;
    end loop;
  end if;
  if n > 0 then
    insert into public.prize_log (who, action, detail)
    values (p_who, 'drawn', p_country || ' ' || p_pool || ' ' || p_day || ': ' || n);
  end if;
  return n;
end
$$;

-- Approvals: draw the winners for one day in one country (one click = one day's winners). Days go in order from
-- today, up to a week ahead, so the team has time to check every BMS before approving. Drawing a day again only fills
-- what's missing.
-- Answers {result: 'ok', drawn: {top, random, liker}, short: {...}} or {result: 'name_required' | 'bad_day' |
-- 'earlier_day_first' (with day) | 'nothing_to_draw'}.
create or replace function public.admin_prize_draw(p_token text, p_country text, p_day date) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_who text := public.session_who(p_token);
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_first date;
  v_missing date;
  pl record;
  v_cum int; v_total int; v_upto int; v_all int; v_need int; v_got int;
  v_drawn json := '{}'::json;
  v_short json := '{}'::json;
  v_any boolean := false;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if v_who is null then return json_build_object('result', 'name_required'); end if;
  if p_country not in ('MY', 'TH') then raise exception 'bad_country'; end if;
  select min(pp.first_day) into v_first from public.prize_plan pp where pp.country = p_country;
  if p_day is null or v_first is null or p_day < v_today or p_day > v_today + 7 or p_day < v_first then
    return json_build_object('result', 'bad_day');
  end if;
  perform 1 from public.prize_plan pp where pp.country = p_country for update;
  select d::date into v_missing
  from generate_series(greatest(v_today, v_first), p_day - 1, interval '1 day') d
  where not exists (select 1 from public.prize_draw_days x where x.country = p_country and x.day = d::date)
  order by d limit 1;
  if v_missing is not null then
    return json_build_object('result', 'earlier_day_first', 'day', v_missing);
  end if;

  for pl in select * from public.prize_plan pp where pp.country = p_country
            order by case pp.pool when 'top' then 1 when 'random' then 2 else 3 end loop
    v_total := pl.per_day * (pl.last_day - pl.first_day + 1);
    v_cum := case when p_day < pl.first_day then 0
                  else pl.per_day * (least(p_day, pl.last_day) - pl.first_day + 1) end;
    select count(*) filter (where p.draw_day <= p_day), count(*) into v_upto, v_all
    from public.prize_winners p where p.country = p_country and p.pool = pl.pool and p.status <> 'redrawn';
    v_need := greatest(0, least(v_cum - v_upto, v_total - v_all));
    v_got := public.prize_draw_pool(p_country, pl.pool, p_day, v_need, v_who);
    if v_need > 0 then v_any := true; end if;
    v_drawn := (v_drawn::jsonb || jsonb_build_object(pl.pool, v_got))::json;
    v_short := (v_short::jsonb || jsonb_build_object(pl.pool, v_need - v_got))::json;
  end loop;

  insert into public.prize_draw_days (country, day, who) values (p_country, p_day, v_who)
  on conflict (country, day) do update set at = now(), who = excluded.who;
  return json_build_object('result', case when v_any then 'ok' else 'nothing_to_draw' end,
                           'drawn', v_drawn, 'short', v_short);
end
$$;

-- Approvals: approve drawn winners. Each gets a code set aside and goes live at 9 am on their day (now, if that's
-- passed). Only winners whose BMS was checked are approved. Answers {approved, without_code, skipped (wishes no
-- longer approved), unchecked (BMS not checked yet)}.
create or replace function public.admin_prize_approve(p_token text, p_ids bigint[]) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_who text := public.session_who(p_token);
  r record;
  n int := 0;
  m int := 0;
  k int := 0;
  u int := 0;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if v_who is null then return json_build_object('result', 'name_required'); end if;
  for r in select p.id, p.draw_day, p.kind, p.wish_id, p.bms_checked_at from public.prize_winners p
           where p.id = any(coalesce(p_ids, '{}')) and p.status = 'picked' order by p.id for update loop
    if r.bms_checked_at is null then
      u := u + 1;
      continue;
    end if;
    -- a wish that was set aside or edited back to waiting since the draw can't be approved: redraw it
    if r.kind = 'wish' and not exists (select 1 from public.wishes w where w.id = r.wish_id and w.status = 'approved') then
      k := k + 1;
      continue;
    end if;
    update public.prize_winners p
    set status = 'approved', approved_at = now(), approved_by = v_who,
        live_at = greatest(coalesce((r.draw_day + time '09:00') at time zone 'Asia/Kuala_Lumpur', p.live_at, now()), now())
    where p.id = r.id;
    insert into public.prize_log (who, action, winner_id) values (v_who, 'approved', r.id);
    n := n + 1;
    if public.prize_assign_code(r.id) is null then m := m + 1; end if;
  end loop;
  return json_build_object('result', 'ok', 'approved', n, 'without_code', m, 'skipped', k, 'unchecked', u);
end
$$;

-- Approvals: mark drawn winners as "BMS checked" (or take the mark off), before approving them. Logged.
create or replace function public.admin_prize_check(p_token text, p_ids bigint[], p_on boolean) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_who text := public.session_who(p_token);
  n int := 0;
  r record;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if v_who is null then return json_build_object('result', 'name_required'); end if;
  for r in select p.id from public.prize_winners p
           where p.id = any(coalesce(p_ids, '{}')) and p.status = 'picked'
             and (case when p_on then p.bms_checked_at is null else p.bms_checked_at is not null end)
           order by p.id for update loop
    update public.prize_winners p
    set bms_checked_at = case when p_on then now() end, bms_checked_by = case when p_on then v_who end
    where p.id = r.id;
    insert into public.prize_log (who, action, winner_id) values (v_who, case when p_on then 'bms_checked' else 'bms_unchecked' end, r.id);
    n := n + 1;
  end loop;
  return json_build_object('result', 'ok', 'changed', n);
end
$$;

-- Approvals: replace a winner (not once their code was shown). A reason is required and kept. A new winner is drawn
-- from the same pool for the same day; the old one is out of later draws.
create or replace function public.admin_prize_redraw(p_token text, p_id bigint, p_reason text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_who text := public.session_who(p_token);
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), '[[:space:]]+', ' ', 'g'));
  w public.prize_winners;
  v_got int := 0;
  v_new bigint;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if v_who is null then return json_build_object('result', 'name_required'); end if;
  if char_length(v_reason) not between 3 and 200 or v_reason ~ '[<>]' then
    return json_build_object('result', 'reason_required');
  end if;
  select * into w from public.prize_winners p where p.id = p_id for update;
  if not found or w.status not in ('picked', 'approved', 'sent') then return json_build_object('result', 'not_found'); end if;
  if w.status = 'sent' or exists (select 1 from public.prize_codes c where c.winner_id = w.id and c.given_at is not null) then
    return json_build_object('result', 'already_opened');
  end if;
  update public.prize_winners p
  set status = 'redrawn', redraw_reason = v_reason, redrawn_at = now(), redrawn_by = v_who
  where p.id = w.id;
  update public.prize_codes c set winner_id = null, assigned_at = null where c.winner_id = w.id and c.given_at is null;
  insert into public.prize_log (who, action, winner_id, detail) values (v_who, 'redrawn', w.id, v_reason);
  if w.pool in ('top', 'random', 'liker') then
    v_got := public.prize_draw_pool(w.country, w.pool, w.draw_day, 1, v_who, w.id);
    if v_got > 0 then
      select p.id into v_new from public.prize_winners p where p.replaces = w.id order by p.id desc limit 1;
    end if;
  end if;
  return json_build_object('result', 'ok', 'new_id', v_new);
end
$$;

-- Approvals: who can win right now, per country: how many wishes and likers are in the draw, how many wishes are
-- still waiting for approval, and the next in line for Most liked
create or replace function public.admin_prize_pool(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  return (select json_object_agg(c.country, json_build_object(
      'wishes', (select count(*) from public.prize_wish_pool(c.country)),
      'with_likes', (select count(*) from public.prize_wish_pool(c.country) q where q.like_count >= 1),
      'skip_top', coalesce((select pp.skip_top from public.prize_plan pp where pp.country = c.country and pp.pool = 'random'), 0),
      'likers', (select count(*) from public.prize_liker_pool(c.country)),
      'waiting', (select count(*) from public.wishes w where w.status = 'pending' and public.wish_country(w.site, w.lang) = c.country),
      'next', coalesce((select json_agg(x) from (
        select w.first_name, w.site, q.like_count as likes
        from public.prize_wish_pool(c.country) q join public.wishes w on w.id = q.id
        where q.like_count >= 1 order by q.like_count desc, q.approved_at asc limit 5) x), '[]'::json)))
    from (values ('MY'), ('TH')) c(country));
end
$$;

-- Approvals: everything on the Winners tabs (never the codes themselves)
create or replace function public.admin_prize_state(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  return json_build_object(
    'today', v_today,
    'now', now(),
    'plan', coalesce((select json_agg(x order by x.country, x.sort) from (
      select pp.country, pp.pool, pp.prize, pp.per_day, pp.first_day, pp.last_day, pp.skip_top,
             case pp.pool when 'top' then 1 when 'random' then 2 else 3 end as sort,
             pp.per_day * (pp.last_day - pp.first_day + 1) as total,
             (select count(*) from public.prize_winners p where p.country = pp.country and p.pool = pp.pool and p.status <> 'redrawn')::int as drawn,
             (select count(*) from public.prize_winners p where p.country = pp.country and p.pool = pp.pool and p.status in ('approved', 'sent'))::int as approved
      from public.prize_plan pp) x), '[]'::json),
    'days', coalesce((select json_agg(x order by x.day) from (
      select d.country, d.day, d.at, d.who from public.prize_draw_days d) x), '[]'::json),
    'winners', coalesce((select json_agg(x order by x.draw_day nulls first, x.id) from (
      select p.id, p.kind, p.wish_id, p.bms, p.prize, p.reason, p.status, p.country, p.pool, p.draw_day, p.live_at,
             p.likes_at_draw, p.created_at, p.created_by, p.approved_at, p.approved_by,
             p.redraw_reason, p.redrawn_at, p.redrawn_by, p.replaces, p.bms_checked_at, p.bms_checked_by,
             coalesce(array_length(p.devices, 1), 0) as device_count,
             w.first_name, w.site, w.lang, w.message,
             (select count(*) from public.likes l where l.kind = 'wish' and l.target_id = w.id)::int as like_count,
             (select string_agg('BMS ' || o.bms, ', ' order by o.created_at) from public.wishes o
               where w.device_id is not null and o.device_id = w.device_id and o.id <> w.id) as same_device,
             (select count(*) from public.likes l where l.bms = p.bms)::int as likes_given,
             c.id is not null as has_code, c.expires_on, c.given_at, c.given_how, coalesce(c.views, 0) as views
      from public.prize_winners p
      left join public.wishes w on w.id = p.wish_id
      left join public.prize_codes c on c.winner_id = p.id) x), '[]'::json),
    'codes', coalesce((select json_agg(x order by x.country, x.prize) from (
      select c.country, c.prize, count(*)::int as total,
             count(*) filter (where c.given_at is not null)::int as opened,
             count(*) filter (where c.winner_id is not null and c.given_at is null)::int as set_aside,
             count(*) filter (where c.winner_id is null and c.given_at is null
                                and (c.expires_on is null or c.expires_on >= v_today))::int as free,
             count(*) filter (where c.winner_id is null and c.given_at is null and c.expires_on < v_today)::int as expired,
             min(c.expires_on) filter (where c.given_at is null) as soonest_expiry
      from public.prize_codes c group by c.country, c.prize) x), '[]'::json)
  );
end
$$;

-- Approvals: add Grab codes or links, one per line. Codes that are already there are skipped.
-- Approved winners still waiting for a code get one straight away. Answers counts and the line numbers that
-- didn't look like a code or a link (never the codes).
create or replace function public.admin_prize_add_codes(p_token text, p_country text, p_prize text,
                                                        p_codes text, p_expires date)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_who text := public.session_who(p_token);
  v_line text;
  v_no int := 0;
  v_bad int[] := '{}';
  v_valid int := 0;
  v_added int := 0;
  v_assigned int := 0;
  r record;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if v_who is null then return json_build_object('result', 'name_required'); end if;
  if not exists (select 1 from public.prize_plan pp where pp.country = p_country and pp.prize = p_prize)
     and not (p_country = 'MY' and p_prize = 'RM 50') then
    return json_build_object('result', 'bad_prize');
  end if;
  if p_expires is not null and p_expires < (now() at time zone 'Asia/Kuala_Lumpur')::date then
    return json_build_object('result', 'expired');
  end if;
  if char_length(coalesce(p_codes, '')) > 200000 then return json_build_object('result', 'too_many'); end if;
  for v_line in select regexp_split_to_table(coalesce(p_codes, ''), E'\\r?\\n') loop
    v_no := v_no + 1;
    v_line := btrim(v_line);
    continue when v_line = '';
    if char_length(v_line) <= 500
       and (v_line ~ '^https://[^[:space:]<>"'']{6,}$' or v_line ~ '^[A-Za-z0-9][A-Za-z0-9_-]{3,99}$') then
      v_valid := v_valid + 1;
      insert into public.prize_codes (country, prize, code, expires_on, added_by)
      values (p_country, p_prize, v_line, p_expires, v_who)
      on conflict (code) do nothing;
      if found then v_added := v_added + 1; end if;
    else
      v_bad := array_append(v_bad, v_no);
    end if;
  end loop;
  if v_added > 0 then
    insert into public.prize_log (who, action, detail)
    values (v_who, 'codes_added', p_country || ' ' || p_prize || ': ' || v_added);
  end if;
  for r in select p.id from public.prize_winners p
           where p.status in ('approved', 'sent') and p.country = p_country and p.prize = p_prize
             and not exists (select 1 from public.prize_codes c where c.winner_id = p.id)
           order by p.live_at nulls first, p.id loop
    if public.prize_assign_code(r.id) is not null then v_assigned := v_assigned + 1; end if;
  end loop;
  return json_build_object('result', 'ok', 'added', v_added, 'already_there', v_valid - v_added,
                           'bad_lines', to_json(v_bad[1:20]), 'bad_count', coalesce(array_length(v_bad, 1), 0),
                           'given_to_waiting_winners', v_assigned);
end
$$;

-- Approvals: remove the unused codes of one prize (for a wrong batch). Codes set aside for a winner or already
-- shown stay.
create or replace function public.admin_prize_remove_codes(p_token text, p_country text, p_prize text)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_who text := public.session_who(p_token);
  n int;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if v_who is null then return json_build_object('result', 'name_required'); end if;
  delete from public.prize_codes c
  where c.country = p_country and c.prize = p_prize and c.winner_id is null and c.given_at is null;
  get diagnostics n = row_count;
  insert into public.prize_log (who, action, detail) values (v_who, 'codes_removed', p_country || ' ' || p_prize || ': ' || n);
  return json_build_object('result', 'ok', 'removed', n);
end
$$;

-- Approvals: see a live winner's code, to send it by WhatsApp when their phone can't open it (new phone, cleared
-- browser). The code then counts as given. Logged with the approver's name; at most 20 an hour for everyone.
create or replace function public.admin_prize_show_code(p_token text, p_id bigint) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_who text := public.session_who(p_token);
  w public.prize_winners;
  c public.prize_codes;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if v_who is null then return json_build_object('result', 'name_required'); end if;
  select * into w from public.prize_winners p where p.id = p_id;
  if not found or w.status not in ('approved', 'sent') then return json_build_object('result', 'not_found'); end if;
  if w.live_at > now() then return json_build_object('result', 'not_live_yet'); end if;
  select * into c from public.prize_codes x where x.winner_id = w.id for update;
  if not found then return json_build_object('result', 'no_code'); end if;
  if not public.rate_hit('show_code', 'all', 20, interval '1 hour') then return json_build_object('result', 'slow_down'); end if;
  update public.prize_codes x
  set given_at = coalesce(x.given_at, now()), given_how = coalesce(x.given_how, 'whatsapp'), views = x.views + 1
  where x.id = c.id;
  update public.prize_winners p set status = 'sent', sent_at = coalesce(p.sent_at, now()), sent_by = coalesce(p.sent_by, v_who)
  where p.id = w.id;
  insert into public.prize_log (who, action, winner_id, code_id, conn) values (v_who, 'code_shown_to_admin', w.id, c.id, public.conn_code());
  return json_build_object('result', 'ok', 'code', c.code, 'prize', w.prize, 'expires_on', c.expires_on,
                           'bms', w.bms, 'is_link', c.code ~ '^https://');
end
$$;

-- Is this phone the winner's? Wishes: the phone the wish was first sent from, or the wish's edit key (kept on the
-- phone that sent it). Likers: one of the phones their likes came from when they were drawn. A BMS alone is never
-- enough. p_keys: [{"bms": "...", "key": "..."}] from this phone (at most 10).
create or replace function public.prize_owner(p_id bigint, p_device text, p_keys json) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  w public.prize_winners;
  v_dev boolean := coalesce(p_device, '') ~ '^[A-Za-z0-9-]{16,64}$';
begin
  select * into w from public.prize_winners p where p.id = p_id;
  if not found then return false; end if;
  if w.kind = 'liker' then
    return v_dev and p_device = any(coalesce(w.devices, '{}'));
  end if;
  return exists (
    select 1 from public.wishes x
    where x.id = w.wish_id and x.bms = w.bms
      and ((v_dev and x.device_id = p_device)
           or (x.edit_key_hash is not null and x.edit_key_hash in (
                 select encode(sha256(convert_to(k ->> 'key', 'UTF8')), 'hex')
                 from (select k from json_array_elements(
                         case when json_typeof(p_keys) = 'array' then p_keys else '[]'::json end) k limit 10) q
                 where k ->> 'bms' = x.bms and coalesce(k ->> 'key', '') ~ '^[0-9a-f]{32,96}$'))));
end
$$;

-- This phone's prizes that are live (no codes here). Answers {result: 'ok', prizes: [...]} or 'slow_down'.
create or replace function public.my_prizes(p_device text, p_keys json) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_out json;
begin
  if not public.rate_hit('prize_check', public.conn_code(), 120, interval '15 minutes') then
    return json_build_object('result', 'slow_down');
  end if;
  select coalesce(json_agg(x order by x.live_at desc), '[]'::json) into v_out from (
    select p.id, p.kind, p.prize, p.pool, p.reason, p.draw_day, p.live_at,
           c.id is not null as has_code, c.expires_on, c.given_at is not null as opened
    from public.prize_winners p
    left join public.prize_codes c on c.winner_id = p.id
    where p.status in ('approved', 'sent') and p.live_at <= now()
      and public.prize_owner(p.id, p_device, p_keys)) x;
  return json_build_object('result', 'ok', 'prizes', v_out);
end
$$;

-- Open a prize on the winner's phone. Answers {result: 'ok', code, is_link, prize, expires_on} or
-- 'not_found' | 'not_yours' | 'no_code_yet' | 'slow_down'. Every try is logged.
create or replace function public.reveal_prize(p_device text, p_keys json, p_id bigint) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_conn text := public.conn_code();
  w public.prize_winners;
  c public.prize_codes;
begin
  if not public.rate_hit('prize_reveal', v_conn, 30, interval '15 minutes') then
    return json_build_object('result', 'slow_down');
  end if;
  select * into w from public.prize_winners p where p.id = p_id;
  if not found or w.status not in ('approved', 'sent') or w.live_at > now() then
    return json_build_object('result', 'not_found');
  end if;
  if not public.prize_owner(w.id, p_device, p_keys) then
    insert into public.prize_log (who, action, winner_id, conn) values ('phone', 'open_refused', w.id, v_conn);
    return json_build_object('result', 'not_yours');
  end if;
  select * into c from public.prize_codes x where x.winner_id = w.id for update;
  if not found then return json_build_object('result', 'no_code_yet', 'prize', w.prize); end if;
  update public.prize_codes x
  set given_at = coalesce(x.given_at, now()), given_how = coalesce(x.given_how, 'phone'), views = x.views + 1
  where x.id = c.id;
  update public.prize_winners p set status = 'sent', sent_at = coalesce(p.sent_at, now()), sent_by = coalesce(p.sent_by, 'their phone')
  where p.id = w.id;
  insert into public.prize_log (who, action, winner_id, code_id, conn) values ('phone', 'code_opened', w.id, c.id, v_conn);
  return json_build_object('result', 'ok', 'code', c.code, 'is_link', c.code ~ '^https://', 'prize', w.prize,
                           'expires_on', c.expires_on);
end
$$;

-- Tree and TV pages: every approved wish, with like counts
create or replace function public.get_approved_wishes()
returns table (id uuid, message text, display_name text, site text, lang text, tag_color text, charm text,
               approved_at timestamptz, like_count int)
language sql stable security definer set search_path = '' as $$
  select w.id, w.message, w.first_name, w.site, w.lang, w.tag_color, w.charm, w.approved_at,
         (select count(*) from public.likes l where l.kind = 'wish' and l.target_id = w.id)::int
  from public.wishes w
  where w.status = 'approved'
  order by w.approved_at desc nulls last
  limit 5000
$$;

-- Wishes whose likes are paused: the winners picked before the daily draw, until they're announced on 1 December.
-- The pages keep them off the tree and at the end of Most liked, and show "Likes paused" instead of the like button.
-- (Wishes drawn in the daily draw stay as they are until 9 am on their day; their new likes just don't count.)
create or replace function public.get_paused_wishes()
returns table (wish_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.wish_id from public.prize_winners p
  where p.pool in ('early', 'manual') and p.wish_id is not null
    and p.status in ('picked', 'approved') and coalesce(p.live_at, p.created_at) > now()
$$;

-- Winners on the site: only once they're live (9 am on their day). Likers show as the last 4 digits of their BMS.
create or replace function public.get_winners()
returns table (wish_id uuid, kind text, bms_end text, prize text, reason text, won_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.wish_id, p.kind, case when p.kind = 'liker' then right(p.bms, 4) end, p.prize, p.reason,
         coalesce(p.live_at, p.created_at)
  from public.prize_winners p
  where p.status in ('approved', 'sent') and coalesce(p.live_at, p.created_at) <= now()
  order by coalesce(p.live_at, p.created_at) desc
$$;

-- Approvals: winners now come from the daily draw only (a winner picked by hand could be anyone's friend).
-- Undo still works for the early winners until their code is shown.
create or replace function public.admin_set_winner(p_token text, p_wish_id uuid, p_on boolean,
                                                   p_prize text default null, p_reason text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if coalesce(p_on, false) then return 'use_draw'; end if;
  select p.id into v_id from public.prize_winners p
  where p.wish_id = p_wish_id and p.status in ('picked', 'approved', 'sent') and p.pool in ('early', 'manual');
  if v_id is null then return 'not_found'; end if;
  if exists (select 1 from public.prize_codes c where c.winner_id = v_id and c.given_at is not null) then return 'already_sent'; end if;
  update public.prize_codes c set winner_id = null, assigned_at = null where c.winner_id = v_id;
  delete from public.prize_winners p where p.id = v_id;
  insert into public.prize_log (who, action, detail) values (public.session_who(p_token), 'winner_undone', 'wish ' || p_wish_id);
  return 'ok';
end
$$;

-- A wish that has won can't be deleted (redraw it first), so no prize goes missing
create or replace function public.admin_delete(p_token text, p_kind text, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_since timestamptz;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if p_kind = 'wish' and exists (select 1 from public.prize_winners p where p.wish_id = p_id and p.status <> 'redrawn') then
    raise exception 'is_winner';
  end if;
  if p_kind = 'wish' then
    delete from public.wishes w where w.id = p_id returning w.id, coalesce(w.updated_at, w.created_at) into v_id, v_since;
  elsif p_kind = 'leader' then
    delete from public.leader_messages m where m.id = p_id returning m.id, m.updated_at into v_id, v_since;
  else
    raise exception 'bad_kind';
  end if;
  delete from public.likes l where l.kind = p_kind and l.target_id = p_id;
  if v_id is null then return false; end if;
  insert into public.admin_log (who, action, kind, target_id, wait_secs)
  values (public.session_who(p_token), 'deleted', p_kind, p_id, greatest(0, extract(epoch from now() - v_since))::int);
  return true;
end
$$;

-- Function rights for the draw
revoke execute on function public.wish_country(text, text) from public, anon, authenticated;
revoke execute on function public.prize_wish_pool(text) from public, anon, authenticated;
revoke execute on function public.prize_liker_pool(text) from public, anon, authenticated;
revoke execute on function public.prize_assign_code(bigint) from public, anon, authenticated;
revoke execute on function public.prize_draw_pool(text, text, date, int, text, bigint) from public, anon, authenticated;
revoke execute on function public.prize_owner(bigint, text, json) from public, anon, authenticated;
grant execute on function public.admin_prize_draw(text, text, date) to anon, authenticated;
grant execute on function public.admin_prize_approve(text, bigint[]) to anon, authenticated;
grant execute on function public.admin_prize_check(text, bigint[], boolean) to anon, authenticated;
grant execute on function public.admin_prize_redraw(text, bigint, text) to anon, authenticated;
grant execute on function public.admin_prize_state(text) to anon, authenticated;
grant execute on function public.admin_prize_pool(text) to anon, authenticated;
grant execute on function public.admin_prize_add_codes(text, text, text, text, date) to anon, authenticated;
grant execute on function public.admin_prize_remove_codes(text, text, text) to anon, authenticated;
grant execute on function public.admin_prize_show_code(text, bigint) to anon, authenticated;
grant execute on function public.my_prizes(text, json) to anon, authenticated;
grant execute on function public.reveal_prize(text, json, bigint) to anon, authenticated;
grant execute on function public.get_approved_wishes() to anon, authenticated;
grant execute on function public.get_paused_wishes() to anon, authenticated;
grant execute on function public.get_winners() to anon, authenticated;
grant execute on function public.admin_set_winner(text, uuid, boolean, text, text) to anon, authenticated;
grant execute on function public.admin_delete(text, text, uuid) to anon, authenticated;


-- 10. Set the passwords ---------------------------------------
-- Run these two lines on their own (remove the leading "--" first), with your own passwords of at least
-- 10 characters. Use a different, longer one for the Approvals page. Run a line again to change a password:
-- everyone using the old one has to enter the new one.
--
-- select public.set_access_password('leader', 'the leaders password');
-- select public.set_access_password('admin', 'the approvals password');
--
-- People who can't win a prize (Amr, Maszy, the Wish Tree team): add their BMS numbers in
-- Table Editor > prize_excluded (bms, note). Don't write real BMS numbers in this file: the repo is public.
