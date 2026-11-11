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

-- Approvals: record who reviewed and when it went live
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


-- 7. Row level security --------------------------------------
alter table public.app_settings enable row level security;
alter table public.leaders enable row level security;
alter table public.moderators enable row level security;
alter table public.wishes enable row level security;
alter table public.leader_messages enable row level security;
alter table public.likes enable row level security;
-- app_settings, leaders, moderators and likes have no policies on purpose:
-- the website only reaches them through the functions below.

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


-- 8. What the tree and TV pages can read ----------------------
-- Only approved messages, only the fields shown on screen (no emails), with like counts.
drop function if exists public.get_approved_wishes();
create function public.get_approved_wishes()
returns table (id uuid, message text, display_name text, site text, lang text, tag_color text, charm text, approved_at timestamptz, like_count int)
language sql stable security definer set search_path = '' as $$
  select w.id, w.message,
         case when w.display_mode = 'name' then w.first_name end,
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

-- Like or unlike; returns the new count
create or replace function public.set_like(p_kind text, p_id uuid, p_device text, p_on boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if p_kind not in ('wish', 'leader') or p_device is null or char_length(p_device) not between 16 and 64 then
    raise exception 'bad_like';
  end if;
  if p_kind = 'wish' and not exists (select 1 from public.wishes w where w.id = p_id and w.status = 'approved') then
    raise exception 'not_found';
  end if;
  if p_kind = 'leader' and not exists (select 1 from public.leader_messages m where m.id = p_id and m.status = 'approved' and not m.hidden) then
    raise exception 'not_found';
  end if;
  if p_on then
    insert into public.likes (kind, target_id, device_id) values (p_kind, p_id, p_device) on conflict do nothing;
  else
    delete from public.likes l where l.kind = p_kind and l.target_id = p_id and l.device_id = p_device;
  end if;
  select count(*) into n from public.likes l where l.kind = p_kind and l.target_id = p_id;
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

grant execute on function public.get_approved_wishes() to anon, authenticated;
grant execute on function public.get_leader_messages() to anon, authenticated;
grant execute on function public.set_like(text, uuid, text, boolean) to anon, authenticated;
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
