-- =========================================================
-- TP Wish Tree 2026 - Supabase database setup
-- Supabase > SQL Editor > New query > paste all of this > Run.
-- Safe to run again: it updates what already exists. Then set the two passwords (section 10).
--
-- What is stored, and nothing more:
--   Employees: first name (or nickname), BMS, the wish (words, site, language, tag colour and charm),
--              the consent tick and the approval status. No emails, no phone numbers, no IP addresses.
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
-- Likes stop counting after this moment (end of Christmas Day, Malaysia time). Change it in Table Editor > app_settings.
alter table public.app_settings add column if not exists likes_close_at timestamptz default '2026-12-25 23:59:59+08';
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

-- BMS numbers that can't win the RM 100 prize (Amr, Maszy, the Wish Tree team).
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

alter table public.leader_messages drop constraint if exists leader_messages_display_name_check;
alter table public.leader_messages add constraint leader_messages_display_name_check
  check (char_length(btrim(display_name)) between 1 and 60);
alter table public.leader_messages drop constraint if exists leader_messages_title_check;
alter table public.leader_messages add constraint leader_messages_title_check
  check (title is null or char_length(title) <= 80);
-- Message length: 250 characters (keep LEADER_MAX_LENGTH in config.js the same)
alter table public.leader_messages drop constraint if exists leader_messages_message_check;
alter table public.leader_messages add constraint leader_messages_message_check
  check (char_length(btrim(message)) between 1 and 250) not valid;
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
alter table public.access_passwords enable row level security;
alter table public.access_sessions enable row level security;
alter table public.wishes enable row level security;
alter table public.leader_messages enable row level security;
alter table public.likes enable row level security;
-- No policies on purpose: the pages only reach the data through the functions below.
revoke all on public.app_settings, public.private_salt, public.rate_events, public.prize_excluded,
              public.access_passwords, public.access_sessions, public.wishes, public.leader_messages, public.likes
  from anon, authenticated;


-- 9. What the pages can do -------------------------------------

-- Tree and TV pages: approved wishes only, only the fields shown on screen, with like counts
drop function if exists public.get_approved_wishes();
create function public.get_approved_wishes()
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

-- Wish page: hang or edit a wish. One wish per BMS: sending again from the same browser edits it
-- (it goes back for approval); from any other browser the BMS is refused.
-- Answers result 'ok', 'bms_taken' or 'slow_down' (answers, not errors, so the rate limits still count the attempt).
drop function if exists public.submit_wish(text, text, text, text, text, text, text, text, boolean, text);
drop function if exists public.submit_wish(text, text, text, text, text, text, text, boolean, text);
create function public.submit_wish(
  p_bms text, p_name text, p_message text, p_site text, p_lang text,
  p_tag_color text, p_charm text, p_consent boolean, p_edit_key text default null)
returns table (result text, wish_id uuid, edit_key text, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare
  st public.app_settings%rowtype;
  v_bms text := regexp_replace(coalesce(p_bms, ''), '[[:space:]]+', '', 'g');
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
  v_msg text := btrim(coalesce(p_message, ''));
  v_conn text := public.conn_code();
  v_id uuid;
  v_hash text;
  v_key text;
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

  select w.id, w.edit_key_hash into v_id, v_hash from public.wishes w where w.bms = v_bms for update;
  if found then
    if p_edit_key is null or v_hash is null or v_hash <> encode(sha256(convert_to(p_edit_key, 'UTF8')), 'hex') then
      return query select 'bms_taken'::text, null::uuid, null::text, false; return;
    end if;
    if not public.rate_hit('edit_bms', v_bms, 20, interval '1 hour') then
      return query select 'slow_down'::text, null::uuid, null::text, false; return;
    end if;
    begin
      update public.wishes w
         set message = v_msg, first_name = v_name, site = p_site, lang = p_lang,
             tag_color = p_tag_color, charm = p_charm, consent = true,
             status = 'pending', reviewed_at = null, approved_at = null,
             flags = public.wish_flags(v_msg), updated_at = now(), edit_count = w.edit_count + 1, conn_code = v_conn
       where w.id = v_id;
    exception when check_violation or not_null_violation then
      raise exception 'bad_input';   -- a plain message, so no row details go back to the browser
    end;
    return query select 'ok'::text, v_id, p_edit_key, false;
    return;
  end if;

  v_key := encode(extensions.gen_random_bytes(24), 'hex');
  begin
    insert into public.wishes (bms, first_name, message, site, lang, tag_color, charm, consent, flags, edit_key_hash, conn_code)
    values (v_bms, v_name, v_msg, p_site, p_lang, p_tag_color, p_charm, true, public.wish_flags(v_msg),
            encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), v_conn)
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
  if char_length(v_msg) not between 1 and 250 then raise exception 'bad_message'; end if;
  -- Leaders' messages are in English only: no Thai, Chinese, Japanese, Korean, Tamil, Arabic and other non-Latin scripts
  if (v_msg || ' ' || coalesce(v_title, '') || ' ' || v_name)
     ~ '[֐-ࣿऀ-෿฀-໿က-႟ᄀ-ᇿ぀-ヿ㄀-ㇿ㐀-䶿一-鿿가-힯豈-﫿]' then
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
             w.status, w.flags, w.reviewed_at, w.approved_at, w.edit_count,
             (select count(*) from public.likes l where l.kind = 'wish' and l.target_id = w.id)::int as like_count
      from public.wishes w order by w.created_at desc limit 5000) x), '[]'::json),
    -- photos of approved messages come from get_leader_photos; the others come here, to be checked
    'leaders', coalesce((select json_agg(x) from (
      select m.id, m.created_at, m.updated_at, m.display_name, m.title, m.message, m.lang,
             case when m.status = 'approved' then null else m.photo end as photo,
             case when m.photo is null then 0 else m.photo_version end as photo_version,
             m.status, m.hidden, m.reviewed_at,
             (select count(*) from public.likes l where l.kind = 'leader' and l.target_id = m.id)::int as like_count
      from public.leader_messages m order by m.updated_at desc) x), '[]'::json),
    'settings', (select json_build_object('submissions_open', s.submissions_open, 'likes_close_at', s.likes_close_at)
                 from public.app_settings s where s.id = 1)
  );
end
$$;

-- Approve, set aside or move back to waiting (one or many)
drop function if exists public.admin_set_status(text, text, uuid[], text);
create function public.admin_set_status(p_token text, p_kind text, p_ids uuid[], p_status text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'bad_status'; end if;
  if p_kind = 'wish' then
    update public.wishes w
       set status = p_status,
           reviewed_at = case when p_status = 'pending' then null else now() end,
           approved_at = case when p_status <> 'approved' then null
                              when w.status = 'approved' then w.approved_at else now() end
     where w.id = any (coalesce(p_ids, '{}'::uuid[]));
  elsif p_kind = 'leader' then
    update public.leader_messages m
       set status = p_status,
           reviewed_at = case when p_status = 'pending' then null else now() end
     where m.id = any (coalesce(p_ids, '{}'::uuid[]));
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
           approved_at = case when w.status = 'approved' then w.approved_at else now() end
     where w.id = p_id;
  elsif p_kind = 'leader' then
    if char_length(v_msg) not between 1 and 250 then raise exception 'bad_message'; end if;
    update public.leader_messages m set message = v_msg, status = 'approved', reviewed_at = now() where m.id = p_id;
  else
    raise exception 'bad_kind';
  end if;
  return found;
end
$$;

-- Delete for good: a wish (so its BMS can hang a new one) or a leader message (so the name is free again)
drop function if exists public.admin_delete(text, text, uuid);
create function public.admin_delete(p_token text, p_kind text, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if public.session_role(p_token) is distinct from 'admin' then raise exception 'not_allowed'; end if;
  if p_kind = 'wish' then
    delete from public.wishes w where w.id = p_id;
  elsif p_kind = 'leader' then
    delete from public.leader_messages m where m.id = p_id;
  else
    raise exception 'bad_kind';
  end if;
  get diagnostics n = row_count;
  delete from public.likes l where l.kind = p_kind and l.target_id = p_id;
  return n > 0;
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
revoke execute on function public.set_access_password(text, text) from public, anon, authenticated;
-- Everyone (each checks a password token or only shows approved things)
grant execute on function public.get_approved_wishes() to anon, authenticated;
grant execute on function public.get_leader_messages() to anon, authenticated;
grant execute on function public.get_leader_photos(uuid[]) to anon, authenticated;
grant execute on function public.get_settings() to anon, authenticated;
grant execute on function public.submit_wish(text, text, text, text, text, text, text, boolean, text) to anon, authenticated;
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
grant execute on function public.admin_set_status(text, text, uuid[], text) to anon, authenticated;
grant execute on function public.admin_edit_message(text, text, uuid, text) to anon, authenticated;
grant execute on function public.admin_delete(text, text, uuid) to anon, authenticated;
grant execute on function public.get_prize_check(text, int) to anon, authenticated;
grant execute on function public.get_wish_likes(text, uuid) to anon, authenticated;
grant execute on function public.remove_likes_by_bms(text, text) to anon, authenticated;
grant execute on function public.update_settings(text, boolean) to anon, authenticated;


-- 10. Set the two passwords -----------------------------------
-- Run these two lines on their own (remove the leading "--" first), with your own passwords of at least
-- 10 characters. Use a different, longer one for the Approvals page. Run a line again to change a password:
-- everyone using the old one has to enter the new one.
--
-- select public.set_access_password('leader', 'the leaders password');
-- select public.set_access_password('admin', 'the approvals password');
--
-- People who can't win the RM 100 prize (Amr, Maszy, the Wish Tree team): add their BMS numbers in
-- Table Editor > prize_excluded (bms, note). Don't write real BMS numbers in this file: the repo is public.
