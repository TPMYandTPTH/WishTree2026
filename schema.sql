-- =========================================================
-- TP Wish Tree 2026 - Supabase database setup
-- Supabase > SQL Editor > New query > paste all of this > Run.
-- Safe to run again: it updates what already exists.
--
-- How people are identified:
--   Employees: no sign-in. First name (or nickname) + BMS number (4-7 digits) + optional phone.
--              One wish per BMS. It can be edited only from the browser that sent it (a secret
--              edit key kept on that device). BMS and phone are never shown on the tree or TVs.
--   Leaders and the Wish Tree team: sign in with their TP account (leaders' page, Approvals page).
-- =========================================================


-- 1. Settings (one row) ------------------------------------
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  submissions_open boolean not null default true,
  allowed_domains text[] not null default array['tp.com'],
  max_wishes_per_person int not null default 3 check (max_wishes_per_person between 1 and 50)  -- no longer used: one wish per BMS
);
alter table public.app_settings add column if not exists leaders_need_approval boolean not null default true;
insert into public.app_settings (id) values (1) on conflict (id) do nothing;


-- 2. Who may post leaders' messages, and who approves -------
-- Manage these two lists in Table Editor. Emails in lower case.
create table if not exists public.leaders (
  email text primary key check (email = lower(btrim(email))),
  default_name text,
  default_title text,
  added_at timestamptz not null default now()
);

-- Where each leader's message hangs: 'ceo' (the big ornament under the star), 'crown' (the top of the tree)
-- or 'gift' (inside a gift box under the tree). sort_order sets the order (lower first).
alter table public.leaders add column if not exists spot text not null default 'crown';
alter table public.leaders add column if not exists sort_order int not null default 100;
alter table public.leaders drop constraint if exists leaders_spot_check;
alter table public.leaders add constraint leaders_spot_check check (spot in ('ceo', 'crown', 'gift'));
-- A photo kept with the site (assets/leaders/name.jpg), shown until the leader uploads their own
alter table public.leaders add column if not exists default_photo text;
alter table public.leaders drop constraint if exists leaders_default_photo_check;
alter table public.leaders add constraint leaders_default_photo_check
  check (default_photo is null or default_photo ~ '^assets/leaders/[a-z0-9-]+\.(jpg|jpeg|png|webp)$');

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

-- The visitor's IP address as Supabase passes it on (used only for rate limits and like checks)
create or replace function public.request_ip() returns text
language sql stable set search_path = '' as $$
  select coalesce(
           nullif(btrim(h ->> 'cf-connecting-ip'), ''),
           nullif(btrim(h ->> 'x-real-ip'), ''),
           nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''),
           'unknown')
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) x
$$;

-- Rate limits: counts recent actions per key (an IP address or a BMS). Only the functions below use it.
create table if not exists public.rate_events (
  action text not null,
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_events_idx on public.rate_events (action, key, at desc);

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

-- Optional list of real BMS numbers (import a CSV with a "bms" column in Table Editor > bms_allowlist).
-- While the list is empty, any 4-7 digit BMS is accepted. Once it has rows, only those BMS can post or like.
create table if not exists public.bms_allowlist (
  bms text primary key check (bms ~ '^[0-9]{4,7}$'),
  name text
);

create or replace function public.bms_ok(p_bms text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_bms, '') ~ '^[0-9]{4,7}$'
     and (not exists (select 1 from public.bms_allowlist)
          or exists (select 1 from public.bms_allowlist a where a.bms = p_bms))
$$;

-- BMS numbers that can't win the RM 100 prize (Amr, Maszy, the Wish Tree team, leaders).
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


-- 4. Employee wishes (always wait for approval) --------------
-- If you add a site in config.js, add its id to wishes_site_check below too.
create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text not null default public.current_email(),
  message text not null,
  display_mode text not null check (display_mode in ('name', 'anon')),
  first_name text check (first_name is null or char_length(first_name) <= 40),
  site text not null,
  lang text not null default 'en',
  tag_color text not null default 'cream' check (tag_color in ('cream', 'red', 'gold')),
  charm text not null default 'snow' check (charm in ('snow', 'star', 'tree', 'gift')),
  consent boolean not null default false check (consent),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  flags text[] not null default '{}',
  reviewed_at timestamptz,
  reviewed_by text,
  approved_at timestamptz
);

-- Message length: 150 characters (keep MAX_LENGTH in config.js the same)
alter table public.wishes drop constraint if exists wishes_message_check;
alter table public.wishes add constraint wishes_message_check
  check (char_length(btrim(message)) between 1 and 150) not valid;

-- Language: any 2-3 letter code, so languages can be added in config.js without touching the database
alter table public.wishes drop constraint if exists wishes_lang_check;
alter table public.wishes add constraint wishes_lang_check check (lang ~ '^[a-z]{2,3}$');

alter table public.wishes drop constraint if exists wishes_site_check;
alter table public.wishes add constraint wishes_site_check
  check (site in ('gtower', 'kcp', 'gbs', 'op', 'lv', 'jb', 'singha', 'wfh'));

create index if not exists wishes_status_idx on public.wishes (status, approved_at desc);
create index if not exists wishes_user_idx on public.wishes (user_id);

-- No sign-in for employees: the BMS number identifies the wish (one per BMS)
alter table public.wishes alter column user_id drop not null;
alter table public.wishes alter column email drop not null;
alter table public.wishes add column if not exists bms text;
alter table public.wishes add column if not exists phone text;
alter table public.wishes add column if not exists edit_key_hash text;
alter table public.wishes add column if not exists ip text;
alter table public.wishes add column if not exists updated_at timestamptz;
alter table public.wishes add column if not exists edit_count int not null default 0;
alter table public.wishes drop constraint if exists wishes_bms_check;
alter table public.wishes add constraint wishes_bms_check check (bms is null or bms ~ '^[0-9]{4,7}$');
alter table public.wishes drop constraint if exists wishes_phone_check;
alter table public.wishes add constraint wishes_phone_check check (phone is null or phone ~ '^\+?[0-9]{8,15}$');
create unique index if not exists wishes_bms_key on public.wishes (bms) where bms is not null;

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
  new.email       := nullif(public.current_email(), '');
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

  if new.user_id is not null then
    select count(*) into n from public.wishes w
    where w.user_id = new.user_id and w.status <> 'rejected';
    if n >= s.max_wishes_per_person then
      raise exception 'wish_limit';
    end if;
  end if;

  new.flags := public.wish_flags(new.message);
  return new;
end
$$;

-- Approvals: record who reviewed and when it went live
create or replace function public.wishes_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id         := old.id;
  new.created_at := old.created_at;
  new.user_id    := old.user_id;
  new.email      := old.email;
  new.bms        := old.bms;
  new.edit_key_hash := old.edit_key_hash;
  new.ip         := old.ip;
  if new.status is distinct from old.status then
    if new.status = 'pending' then
      new.reviewed_at := null;
      new.reviewed_by := null;
    else
      new.reviewed_at := now();
      new.reviewed_by := nullif(public.current_email(), '');
    end if;
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


-- 5. Leaders' messages (one per leader, approved before they show) --
create table if not exists public.leader_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  email text not null default public.current_email(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  title text check (title is null or char_length(title) <= 80),
  message text not null,
  lang text not null default 'en',
  sort_order int not null default 100,   -- lower = shown first; set by moderators
  hidden boolean not null default false
);
alter table public.leader_messages add column if not exists status text not null default 'pending';
alter table public.leader_messages add column if not exists reviewed_at timestamptz;
alter table public.leader_messages add column if not exists reviewed_by text;
alter table public.leader_messages add column if not exists photo_url text;

alter table public.leader_messages drop constraint if exists leader_messages_lang_check;
alter table public.leader_messages add constraint leader_messages_lang_check check (lang ~ '^[a-z]{2,3}$');

-- Photo: a link to the leader's picture in Supabase Storage (bucket leader-photos, see section 9)
alter table public.leader_messages drop constraint if exists leader_messages_photo_check;
alter table public.leader_messages add constraint leader_messages_photo_check
  check (photo_url is null or (char_length(photo_url) <= 600 and photo_url ~ '^https://[^[:space:]"''<>()\\]+$'));

alter table public.leader_messages drop constraint if exists leader_messages_status_check;
alter table public.leader_messages add constraint leader_messages_status_check
  check (status in ('pending', 'approved', 'rejected'));

-- Message length: 250 characters (keep LEADER_MAX_LENGTH in config.js the same)
alter table public.leader_messages drop constraint if exists leader_messages_message_check;
alter table public.leader_messages add constraint leader_messages_message_check
  check (char_length(btrim(message)) between 1 and 250) not valid;

create or replace function public.leader_messages_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  needs_ok boolean;
  is_mod boolean;
begin
  select coalesce(s.leaders_need_approval, true) into needs_ok from public.app_settings s where s.id = 1;
  needs_ok := coalesce(needs_ok, true);
  is_mod := auth.uid() is not null and public.is_moderator();

  new.display_name := btrim(new.display_name);
  new.title        := nullif(btrim(coalesce(new.title, '')), '');
  new.message      := btrim(new.message);

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.user_id    := auth.uid();
      new.email      := public.current_email();
      new.hidden     := false;
      new.sort_order := 100;
      new.status     := case when needs_ok then 'pending' else 'approved' end;
      new.reviewed_at := null;
      new.reviewed_by := null;
    end if;
    new.created_at := now();
  else
    new.id         := old.id;
    new.user_id    := old.user_id;
    new.email      := old.email;
    new.created_at := old.created_at;
    if auth.uid() is not null and not is_mod then
      -- leaders can't approve themselves; editing the words sends it back for approval
      new.hidden      := old.hidden;
      new.sort_order  := old.sort_order;
      new.status      := old.status;
      new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by;
      if new.message is distinct from old.message
         or new.display_name is distinct from old.display_name
         or new.title is distinct from old.title
         or new.lang is distinct from old.lang
         or new.photo_url is distinct from old.photo_url then
        new.status      := case when needs_ok then 'pending' else 'approved' end;
        new.reviewed_at := null;
        new.reviewed_by := null;
      end if;
    elsif new.status is distinct from old.status then
      new.reviewed_at := now();
      new.reviewed_by := nullif(public.current_email(), '');
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists leader_messages_before_write on public.leader_messages;
create trigger leader_messages_before_write before insert or update on public.leader_messages
  for each row execute function public.leader_messages_before_write();


-- 6. Likes (anyone can like a message once per device) -------
create table if not exists public.likes (
  kind text not null check (kind in ('wish', 'leader')),
  target_id uuid not null,
  device_id text not null check (char_length(device_id) between 16 and 64),
  created_at timestamptz not null default now(),
  primary key (kind, target_id, device_id)
);
create index if not exists likes_target_idx on public.likes (kind, target_id);

-- Likes count once per BMS (so they can be checked before the RM 100 prizes are given).
-- Earlier device-only likes are removed.
alter table public.likes add column if not exists bms text;
alter table public.likes add column if not exists ip text;
alter table public.likes drop constraint if exists likes_pkey;
alter table public.likes alter column device_id drop not null;
delete from public.likes where bms is null;
alter table public.likes add constraint likes_pkey primary key (kind, target_id, bms);
alter table public.likes drop constraint if exists likes_bms_check;
alter table public.likes add constraint likes_bms_check check (bms ~ '^[0-9]{4,7}$');
create index if not exists likes_bms_idx on public.likes (bms);


-- 7. Row level security --------------------------------------
alter table public.app_settings enable row level security;
alter table public.leaders enable row level security;
alter table public.moderators enable row level security;
alter table public.wishes enable row level security;
alter table public.leader_messages enable row level security;
alter table public.likes enable row level security;
alter table public.rate_events enable row level security;
alter table public.bms_allowlist enable row level security;
alter table public.prize_excluded enable row level security;
-- app_settings, leaders, moderators, likes, rate_events, bms_allowlist and prize_excluded have no
-- policies on purpose: the website only reaches them through the functions below.

-- Wishes are only added or edited through submit_wish() below, never written directly.
drop policy if exists "staff add wishes" on public.wishes;

drop policy if exists "own wishes or moderators read" on public.wishes;
drop policy if exists "moderators read wishes" on public.wishes;
create policy "moderators read wishes" on public.wishes
  for select to authenticated
  using (public.is_moderator());

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


-- Column rights on wishes: nobody reads or writes it directly except the Wish Tree team, and even they
-- never see the edit key hash or the IP address.
revoke all on public.wishes from anon, authenticated;
grant select (id, created_at, email, message, display_mode, first_name, site, lang, tag_color, charm, status, flags,
              reviewed_at, reviewed_by, approved_at, bms, phone, updated_at, edit_count) on public.wishes to authenticated;
grant update (message, status, first_name) on public.wishes to authenticated;
grant delete on public.wishes to authenticated;
revoke all on public.likes, public.rate_events, public.bms_allowlist, public.prize_excluded from anon, authenticated;


-- 8. What the tree and TV pages can read ----------------------
-- Only approved messages, only the fields shown on screen (no emails), with like counts.
drop function if exists public.get_approved_wishes();
create function public.get_approved_wishes()
returns table (id uuid, message text, display_name text, site text, lang text, tag_color text, charm text, approved_at timestamptz, like_count int)
language sql stable security definer set search_path = '' as $$
  select w.id, w.message,
         case when w.display_mode = 'name' or w.bms is not null then w.first_name end,
         w.site, w.lang, w.tag_color, w.charm, w.approved_at,
         (select count(*) from public.likes l where l.kind = 'wish' and l.target_id = w.id)::int
  from public.wishes w
  where w.status = 'approved'
  order by w.approved_at desc nulls last
  limit 5000
$$;

drop function if exists public.get_leader_messages();
create function public.get_leader_messages()
returns table (id uuid, display_name text, title text, message text, lang text, photo_url text, updated_at timestamptz,
               like_count int, spot text, sort_order int)
language sql stable security definer set search_path = '' as $$
  select m.id, m.display_name, m.title, m.message, m.lang, coalesce(m.photo_url, ld.default_photo), m.updated_at,
         (select count(*) from public.likes l where l.kind = 'leader' and l.target_id = m.id)::int,
         coalesce(ld.spot, 'crown'),
         coalesce(ld.sort_order, m.sort_order)
  from public.leader_messages m
  left join public.leaders ld on ld.email = lower(m.email)
  where m.status = 'approved' and not m.hidden
  order by (coalesce(ld.spot, 'crown') = 'ceo') desc, coalesce(ld.sort_order, m.sort_order), m.created_at
$$;

-- Hang or edit a wish (no sign-in). One wish per BMS: sending again from the same browser edits it
-- (it goes back for approval); from any other browser the BMS is refused.
-- Returns result: 'ok', 'bms_taken', 'unknown_bms' or 'slow_down' (these are answers, not errors,
-- so the rate limits still count the attempt).
drop function if exists public.submit_wish(text, text, text, text, text, text, text, text, boolean, text);
create function public.submit_wish(
  p_bms text, p_name text, p_phone text, p_message text, p_site text, p_lang text,
  p_tag_color text, p_charm text, p_consent boolean, p_edit_key text default null)
returns table (result text, wish_id uuid, edit_key text, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare
  st public.app_settings%rowtype;
  v_bms text := btrim(coalesce(p_bms, ''));
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[[:space:]().-]', '', 'g');
  v_msg text := btrim(coalesce(p_message, ''));
  v_ip text := public.request_ip();
  v_id uuid;
  v_hash text;
  v_key text;
begin
  select * into st from public.app_settings where id = 1;
  if not found or not st.submissions_open then raise exception 'wishes_closed'; end if;
  if not coalesce(p_consent, false) then raise exception 'consent_required'; end if;
  if v_bms !~ '^[0-9]{4,7}$' then raise exception 'bad_bms'; end if;
  if char_length(v_name) not between 1 and 30 or v_name ~ '[<>]' then raise exception 'name_required'; end if;
  if v_phone = '' then
    v_phone := null;
  elsif v_phone !~ '^\+?[0-9]{8,15}$' then
    raise exception 'bad_phone';
  end if;
  if char_length(v_msg) not between 1 and 150 then raise exception 'bad_message'; end if;

  -- Generous for shared office connections, tight enough to stop a script
  if not public.rate_hit('submit_ip', v_ip, 60, interval '10 minutes') then
    return query select 'slow_down'::text, null::uuid, null::text, false; return;
  end if;
  if not public.bms_ok(v_bms) then
    return query select 'unknown_bms'::text, null::uuid, null::text, false; return;
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
         set message = v_msg, first_name = v_name, display_mode = 'name', phone = v_phone,
             site = p_site, lang = p_lang, tag_color = p_tag_color, charm = p_charm, consent = true,
             status = 'pending', flags = public.wish_flags(v_msg), updated_at = now(), edit_count = w.edit_count + 1
       where w.id = v_id;
    exception when check_violation or not_null_violation then
      raise exception 'bad_input';   -- a plain message, so no row details go back to the browser
    end;
    return query select 'ok'::text, v_id, p_edit_key, false;
    return;
  end if;

  v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  begin
    insert into public.wishes (bms, first_name, display_mode, phone, message, site, lang, tag_color, charm, consent, edit_key_hash, ip)
    values (v_bms, v_name, 'name', v_phone, v_msg, p_site, p_lang, p_tag_color, p_charm, true,
            encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), v_ip)
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

-- The wish sent from this browser (needs its edit key), so it can be edited
drop function if exists public.get_my_wish(text, text);
create function public.get_my_wish(p_bms text, p_edit_key text)
returns table (id uuid, first_name text, phone text, message text, site text, lang text, tag_color text, charm text,
               status text, like_count int, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.id, w.first_name, w.phone, w.message, w.site, w.lang, w.tag_color, w.charm, w.status,
         (select count(*) from public.likes l where l.kind = 'wish' and l.target_id = w.id)::int,
         coalesce(w.updated_at, w.created_at)
  from public.wishes w
  where w.bms = btrim(coalesce(p_bms, ''))
    and p_edit_key is not null
    and w.edit_key_hash = encode(sha256(convert_to(p_edit_key, 'UTF8')), 'hex')
$$;

-- Like or unlike, once per BMS. Returns result ('ok', 'own_wish', 'unknown_bms', 'slow_down') and the new count.
drop function if exists public.set_like(text, uuid, text, boolean);
drop function if exists public.set_like(text, uuid, text, boolean, text);
create function public.set_like(p_kind text, p_id uuid, p_bms text, p_on boolean, p_device text default null)
returns table (result text, like_count int)
language plpgsql security definer set search_path = '' as $$
declare
  v_bms text := btrim(coalesce(p_bms, ''));
  v_ip text := public.request_ip();
  n int;
begin
  if p_kind not in ('wish', 'leader') or v_bms !~ '^[0-9]{4,7}$' then
    raise exception 'bad_like';
  end if;
  if p_kind = 'wish' and not exists (select 1 from public.wishes w where w.id = p_id and w.status = 'approved') then
    raise exception 'not_found';
  end if;
  if p_kind = 'leader' and not exists (select 1 from public.leader_messages m where m.id = p_id and m.status = 'approved' and not m.hidden) then
    raise exception 'not_found';
  end if;
  if not public.rate_hit('like_ip', v_ip, 400, interval '10 minutes')
     or not public.rate_hit('like_bms', v_bms, 60, interval '10 minutes') then
    return query select 'slow_down'::text, null::int; return;
  end if;
  if not public.bms_ok(v_bms) then
    return query select 'unknown_bms'::text, null::int; return;
  end if;
  if p_kind = 'wish' and exists (select 1 from public.wishes w where w.id = p_id and w.bms = v_bms) then
    return query select 'own_wish'::text, null::int; return;
  end if;
  if p_on then
    insert into public.likes (kind, target_id, bms, device_id, ip)
    values (p_kind, p_id, v_bms, left(p_device, 64), v_ip)
    on conflict do nothing;
  else
    delete from public.likes l where l.kind = p_kind and l.target_id = p_id and l.bms = v_bms;
  end if;
  select count(*) into n from public.likes l where l.kind = p_kind and l.target_id = p_id;
  return query select 'ok'::text, n;
end
$$;

-- RM 100 prize: the most-liked approved wishes, leaving out prize_excluded BMS numbers.
-- Ties: the wish that reached that number of likes first ranks higher.
drop function if exists public.get_prize_top(int);
create function public.get_prize_top(p_limit int default 5)
returns table (id uuid, display_name text, site text, like_count int, place int)
language sql stable security definer set search_path = '' as $$
  select x.id, x.first_name, x.site, x.n,
         (row_number() over (order by x.n desc, x.last_at asc))::int
  from (
    select w.id, w.first_name, w.site, count(l.bms)::int as n, max(l.created_at) as last_at
    from public.wishes w
    join public.likes l on l.kind = 'wish' and l.target_id = w.id
    where w.status = 'approved'
      and not exists (select 1 from public.prize_excluded e where e.bms = w.bms)
    group by w.id, w.first_name, w.site
  ) x
  order by x.n desc, x.last_at asc
  limit least(greatest(coalesce(p_limit, 5), 1), 20)
$$;

-- Approvals page: the prize standings with BMS and phone, and signs of like-farming
drop function if exists public.get_prize_check(int);
create function public.get_prize_check(p_limit int default 10)
returns table (id uuid, first_name text, bms text, phone text, site text, message text, like_count int,
               distinct_ips int, most_from_one_ip int, last_like_at timestamptz, excluded boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'not_allowed'; end if;
  return query
  select w.id, w.first_name, w.bms, w.phone, w.site, w.message, count(l.bms)::int,
         count(distinct l.ip)::int,
         coalesce((select max(c) from (select count(*)::int as c from public.likes l2
                   where l2.kind = 'wish' and l2.target_id = w.id group by l2.ip) q), 0),
         max(l.created_at),
         exists (select 1 from public.prize_excluded e where e.bms = w.bms)
  from public.wishes w
  join public.likes l on l.kind = 'wish' and l.target_id = w.id
  where w.status = 'approved'
  group by w.id
  order by count(l.bms) desc, max(l.created_at) asc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
end
$$;

-- Approvals page: who liked one wish (BMS, IP, time)
drop function if exists public.get_wish_likes(uuid);
create function public.get_wish_likes(p_id uuid)
returns table (bms text, ip text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'not_allowed'; end if;
  return query select l.bms, l.ip, l.created_at from public.likes l
  where l.kind = 'wish' and l.target_id = p_id order by l.created_at;
end
$$;

-- Approvals page: remove every like made with one BMS (for likes that look faked)
drop function if exists public.remove_likes_by_bms(text);
create function public.remove_likes_by_bms(p_bms text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not public.is_moderator() then raise exception 'not_allowed'; end if;
  delete from public.likes l where l.bms = btrim(coalesce(p_bms, ''));
  get diagnostics n = row_count;
  return n;
end
$$;

-- Leaders page: access check
drop function if exists public.leader_profile();
create function public.leader_profile()
returns table (is_leader boolean, default_name text, default_title text, spot text, default_photo text)
language sql stable security definer set search_path = '' as $$
  select public.is_leader(), l.default_name, l.default_title, coalesce(l.spot, 'crown'), l.default_photo
  from (select 1) as x
  left join public.leaders l on l.email = public.current_email()
$$;

-- Approvals page: access check and campaign switches
create or replace function public.am_i_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_moderator()
$$;

create or replace function public.get_settings()
returns table (submissions_open boolean, leaders_need_approval boolean, max_wishes_per_person int)
language sql stable security definer set search_path = '' as $$
  select s.submissions_open, s.leaders_need_approval, s.max_wishes_per_person
  from public.app_settings s where s.id = 1
$$;

create or replace function public.update_settings(p_submissions_open boolean, p_leaders_need_approval boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then
    raise exception 'not_allowed';
  end if;
  update public.app_settings
     set submissions_open = coalesce(p_submissions_open, submissions_open),
         leaders_need_approval = coalesce(p_leaders_need_approval, leaders_need_approval)
   where id = 1;
end
$$;

-- Function rights. Supabase lets everyone run new functions by default, so the internal ones are locked first.
revoke execute on function public.rate_hit(text, text, int, interval) from public, anon, authenticated;
revoke execute on function public.bms_ok(text) from public, anon, authenticated;
revoke execute on function public.request_ip() from public, anon, authenticated;
revoke execute on function public.wish_flags(text) from public, anon, authenticated;
grant execute on function public.get_approved_wishes() to anon, authenticated;
grant execute on function public.get_leader_messages() to anon, authenticated;
grant execute on function public.submit_wish(text, text, text, text, text, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.get_my_wish(text, text) to anon, authenticated;
grant execute on function public.set_like(text, uuid, text, boolean, text) to anon, authenticated;
grant execute on function public.get_prize_top(int) to anon, authenticated;
revoke execute on function public.get_prize_check(int) from public, anon;
revoke execute on function public.get_wish_likes(uuid) from public, anon;
revoke execute on function public.remove_likes_by_bms(text) from public, anon;
revoke execute on function public.update_settings(boolean, boolean) from public, anon;
grant execute on function public.get_prize_check(int) to authenticated;
grant execute on function public.get_wish_likes(uuid) to authenticated;
grant execute on function public.remove_likes_by_bms(text) to authenticated;
grant execute on function public.get_settings() to anon, authenticated;
grant execute on function public.leader_profile() to authenticated;
grant execute on function public.am_i_moderator() to authenticated;
grant execute on function public.update_settings(boolean, boolean) to authenticated;


-- 9. Leader photos (Supabase Storage) ------------------------
-- A public bucket: anyone can see the photos, only leaders can upload, each into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leader-photos', 'leader-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "leaders upload own photo" on storage.objects;
create policy "leaders upload own photo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'leader-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and public.is_leader());

drop policy if exists "leaders see own photos" on storage.objects;
create policy "leaders see own photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'leader-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "leaders replace own photo" on storage.objects;
create policy "leaders replace own photo" on storage.objects
  for update to authenticated
  using (bucket_id = 'leader-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and public.is_leader())
  with check (bucket_id = 'leader-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and public.is_leader());

drop policy if exists "leaders delete own photo" on storage.objects;
create policy "leaders delete own photo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'leader-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));


-- 10. Add your leaders and moderators ------------------------
-- Replace the emails, remove the leading "--", and run just these lines.
-- (Or add rows in Table Editor > leaders / moderators.)
-- spot: 'ceo' = the big ornament under the star (one person); 'crown' = around the top of the tree
--       (room for 7, mixed order); 'gift' = inside a gift box under the tree.
-- sort_order: the order in the list under the tree and on the TVs (after the CEO: two lines, 4 then 3).
-- default_photo: the photo file in assets/leaders/ on the site, used until the leader uploads their own.
--
-- insert into public.leaders (email, default_name, default_title, spot, sort_order, default_photo) values
--   ('andy@tp.com',        'Andy',        'Chief Executive Officer', 'ceo',   1, 'assets/leaders/andy.jpg'),
--   ('divya.dutta@tp.com', 'Divya Dutta', 'Chief Operating Officer', 'crown', 2, 'assets/leaders/divya-dutta.jpg'),
--   ('sarah@tp.com',       'Sarah',       'Chief of Staff',          'crown', 3, 'assets/leaders/sarah.jpg'),
--   ('rachel@tp.com',      'Rachel',      'Human Resources',         'crown', 4, 'assets/leaders/rachel.jpg'),
--   ('himanshu@tp.com',    'Himanshu',    'Chief Operating Officer', 'crown', 5, 'assets/leaders/himanshu.jpg'),
--   ('vivienne@tp.com',    'Vivienne',    'Vice President',          'crown', 6, 'assets/leaders/vivienne.jpg'),
--   ('chavis@tp.com',      'Chavis',      'Vice President',          'crown', 7, 'assets/leaders/chavis.jpg'),
--   ('sudhar@tp.com',      'Sudhar',      'Vice President',          'crown', 8, 'assets/leaders/sudhar.jpg')
-- on conflict (email) do update set default_name = excluded.default_name, default_title = excluded.default_title,
--   spot = excluded.spot, sort_order = excluded.sort_order, default_photo = excluded.default_photo;
--
-- insert into public.moderators (email) values
--   ('firstname.lastname@tp.com');
--
-- People who can't win the RM 100 prize (Amr, Maszy, the Wish Tree team):
-- insert into public.prize_excluded (bms, note) values
--   ('1234567', 'Amr Mihany'),
--   ('7654321', 'Maszy Ulip');
--
-- Optional: only real BMS numbers can post or like. In Table Editor > bms_allowlist > Insert > Import data from CSV,
-- upload a CSV with a "bms" column (and "name" if you like). Leave the table empty to accept any 4-7 digit BMS.
