-- =========================================================
-- TP Gift Exchange (on the spot) - Supabase database setup
-- Supabase > SQL Editor > New query > paste all of this > Run.
-- Safe to run again: it keeps the people already on the list.
-- Then set the organiser PIN once (step 6 at the bottom).
-- =========================================================
--
-- How it works
-- - One event at a time. People scan the QR, type their name and get
--   the next simple number (#1, #2, #3 ...).
-- - The big screen shows the QR and everyone's number and name.
-- - The organiser (with the PIN) taps "Match everyone": the list is
--   shuffled into pairs who swap gifts. With an odd number of people,
--   one group of 3 gives in a small circle (A to B, B to C, C to A).
-- - The matches show on the big screen and on each person's phone.
-- - Nobody signs in. Each phone keeps a random token, stored here only
--   as a hash. The tables can't be read with the public key; the pages
--   only call the functions in section 4.


-- 1. Remove the earlier Secret Santa version (if it's there) ----
drop function if exists public.gift_create(text, text, text, text, text);
drop function if exists public.gift_info(text);
drop function if exists public.gift_join(text, text, text);
drop function if exists public.gift_me(text, text);
drop function if exists public.gift_opened(text, text);
drop function if exists public.gift_set_hints(text, text, text);
drop function if exists public.gift_leave(text, text);
drop function if exists public.gift_host_view(text, text);
drop function if exists public.gift_host_update(text, text, text, text, text, text, text);
drop function if exists public.gift_host_remove(text, text, uuid);
drop function if exists public.gift_host_draw(text, text);
drop function if exists public.gift_host_undo(text, text);
drop function if exists public.gift_host_group(text, text, boolean);
drop function if exists public.gift_group_json(public.gift_groups);
drop function if exists public.gift_random_code(int);
drop function if exists public.gift_norm(text);
drop function if exists public.gift_hash(text);
drop function if exists public.gift_clean(text, int);
drop function if exists public.gift_clean_hints(text);
drop table if exists public.gift_people;
drop table if exists public.gift_groups;


-- 2. Tables --------------------------------------------------
create table if not exists public.gx_event (
  id int primary key default 1 check (id = 1),
  status text not null default 'open' check (status in ('open', 'matched')),
  round int not null default 0,
  matched_at timestamptz,
  pin_hash text,
  fails int not null default 0,
  fail_since timestamptz
);
insert into public.gx_event (id) values (1) on conflict (id) do nothing;

create table if not exists public.gx_people (
  id uuid primary key default gen_random_uuid(),
  num int not null unique check (num between 1 and 999),
  name text not null check (char_length(name) between 1 and 40),
  token_hash text unique,
  grp int,
  pos int,
  gives_to uuid references public.gx_people (id) on delete set null,
  joined_at timestamptz not null default now()
);
create unique index if not exists gx_people_name_uq on public.gx_people (lower(name));

-- Locked: no direct access with the public key.
alter table public.gx_event enable row level security;
alter table public.gx_people enable row level security;
revoke all on table public.gx_event from anon, authenticated;
revoke all on table public.gx_people from anon, authenticated;


-- 3. Helpers (inside the database only) ------------------------
create or replace function public.gx_hash(k text) returns text
language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to('tp-gift:' || btrim(coalesce(k, '')), 'UTF8')), 'hex')
$$;

create or replace function public.gx_clean(t text) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')), 40), '')
$$;

-- Checks the organiser PIN. Returns 'ok', 'bad_pin', 'locked' or 'no_pin'.
-- After 10 wrong PINs in 10 minutes it locks for the rest of those 10 minutes.
create or replace function public.gx_pin(p_pin text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.gx_event%rowtype;
begin
  select * into e from public.gx_event where id = 1 for update;
  if e.pin_hash is null then
    return 'no_pin';
  end if;
  if e.fail_since is not null and e.fail_since < now() - interval '10 minutes' then
    update public.gx_event set fails = 0, fail_since = null where id = 1;
    e.fails := 0;
  end if;
  if e.fails >= 10 then
    return 'locked';
  end if;
  if e.pin_hash = public.gx_hash(p_pin) then
    update public.gx_event set fails = 0, fail_since = null where id = 1;
    return 'ok';
  end if;
  update public.gx_event set fails = fails + 1, fail_since = coalesce(fail_since, now()) where id = 1;
  return 'bad_pin';
end $$;

-- Organiser only, from the Supabase SQL Editor: select public.gx_set_pin('123456');
create or replace function public.gx_set_pin(p_pin text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if char_length(btrim(coalesce(p_pin, ''))) < 4 then
    raise exception 'PIN needs at least 4 characters';
  end if;
  update public.gx_event set pin_hash = public.gx_hash(p_pin), fails = 0, fail_since = null where id = 1;
end $$;

create or replace function public.gx_person(p public.gx_people) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('num', p.num, 'name', p.name)
$$;


-- 4. What the pages can call ---------------------------------

-- Big screen (and phones): everyone on the list, and the matches once made.
create or replace function public.gx_board() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.gx_event%rowtype;
begin
  select * into e from public.gx_event where id = 1;
  return jsonb_build_object(
    'status', e.status,
    'round', e.round,
    'matched_at', e.matched_at,
    'has_pin', e.pin_hash is not null,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('num', p.num, 'name', p.name) order by p.num)
        from public.gx_people p
    ), '[]'::jsonb),
    'groups', case when e.status = 'matched' then coalesce((
      select jsonb_agg(members order by first_num)
        from (
          select p.grp,
                 min(p.num) as first_num,
                 jsonb_agg(jsonb_build_object('num', p.num, 'name', p.name) order by p.pos) as members
            from public.gx_people p
           where p.grp is not null
           group by p.grp
        ) g
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;

-- Phone: join. Returns the simple number and the phone's token.
create or replace function public.gx_join(p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.gx_event%rowtype;
  v_name text := public.gx_clean(p_name);
  v_num int;
  v_token text;
  v_taken int;
begin
  if v_name is null then
    raise exception 'bad_input';
  end if;
  select * into e from public.gx_event where id = 1 for update;
  if e.status <> 'open' then
    raise exception 'closed';
  end if;
  if (select count(*) from public.gx_people) >= 300 then
    raise exception 'full';
  end if;
  select num into v_taken from public.gx_people where lower(name) = lower(v_name);
  if found then
    raise exception 'name_taken:%', v_taken;
  end if;

  select coalesce(max(num), 0) + 1 into v_num from public.gx_people;
  v_token := replace(pg_catalog.gen_random_uuid()::text, '-', '') || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  insert into public.gx_people (num, name, token_hash) values (v_num, v_name, public.gx_hash(v_token));
  return jsonb_build_object('num', v_num, 'name', v_name, 'token', v_token);
end $$;

-- Phone: this person's number, and their match once made.
create or replace function public.gx_me(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.gx_event%rowtype;
  me public.gx_people%rowtype;
  v_give public.gx_people%rowtype;
  v_get public.gx_people%rowtype;
  v_size int;
  v_match jsonb := null;
begin
  select * into e from public.gx_event where id = 1;
  select * into me from public.gx_people where token_hash = public.gx_hash(p_token);
  if not found then
    raise exception 'not_found';
  end if;

  if e.status = 'matched' and me.gives_to is not null then
    select * into v_give from public.gx_people where id = me.gives_to;
    select * into v_get from public.gx_people where gives_to = me.id limit 1;
    select count(*) into v_size from public.gx_people where grp = me.grp;
    v_match := jsonb_build_object(
      'size', v_size,
      'give', public.gx_person(v_give),
      'get', public.gx_person(v_get)
    );
  end if;

  return jsonb_build_object(
    'num', me.num, 'name', me.name,
    'status', e.status, 'round', e.round,
    'count', (select count(*) from public.gx_people),
    'match', v_match
  );
end $$;

-- Phone: take my name off (only before matching) so I can type it again.
create or replace function public.gx_leave(p_token text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.gx_event%rowtype;
begin
  select * into e from public.gx_event where id = 1 for update;
  if e.status <> 'open' then
    raise exception 'already_matched';
  end if;
  delete from public.gx_people where token_hash = public.gx_hash(p_token);
end $$;

-- Organiser: check the PIN.
create or replace function public.gx_admin_check(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.gx_pin(p_pin);
begin
  return case when v = 'ok' then jsonb_build_object('ok', true) else jsonb_build_object('error', v) end;
end $$;

-- Organiser: add someone without a phone.
create or replace function public.gx_admin_add(p_pin text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.gx_pin(p_pin);
  e public.gx_event%rowtype;
  v_name text := public.gx_clean(p_name);
  v_num int;
  v_taken int;
begin
  if v <> 'ok' then return jsonb_build_object('error', v); end if;
  if v_name is null then return jsonb_build_object('error', 'bad_input'); end if;
  select * into e from public.gx_event where id = 1 for update;
  if e.status <> 'open' then return jsonb_build_object('error', 'already_matched'); end if;
  select num into v_taken from public.gx_people where lower(name) = lower(v_name);
  if found then return jsonb_build_object('error', 'name_taken:' || v_taken); end if;
  select coalesce(max(num), 0) + 1 into v_num from public.gx_people;
  insert into public.gx_people (num, name) values (v_num, v_name);
  return jsonb_build_object('ok', true, 'num', v_num);
end $$;

-- Organiser: take a number off the list (only before matching).
create or replace function public.gx_admin_remove(p_pin text, p_num int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.gx_pin(p_pin);
  e public.gx_event%rowtype;
begin
  if v <> 'ok' then return jsonb_build_object('error', v); end if;
  select * into e from public.gx_event where id = 1 for update;
  if e.status <> 'open' then return jsonb_build_object('error', 'already_matched'); end if;
  delete from public.gx_people where num = p_num;
  return jsonb_build_object('ok', true);
end $$;

-- Organiser: match everyone. Random pairs; with an odd number, one group of 3.
create or replace function public.gx_admin_match(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.gx_pin(p_pin);
  e public.gx_event%rowtype;
  n int;
begin
  if v <> 'ok' then return jsonb_build_object('error', v); end if;
  select * into e from public.gx_event where id = 1 for update;
  if e.status <> 'open' then return jsonb_build_object('error', 'already_matched'); end if;
  select count(*) into n from public.gx_people;
  if n < 2 then return jsonb_build_object('error', 'too_few'); end if;

  with shuffled as (
    select id, row_number() over (order by pg_catalog.gen_random_uuid()) as rn
      from public.gx_people
  ),
  grouped as (
    select id, rn,
           case when n % 2 = 1 and rn > n - 3 then (n - 3) / 2 + 1
                else (rn + 1) / 2 end as grp
      from shuffled
  ),
  chained as (
    select id, grp,
           row_number() over (partition by grp order by rn) as pos,
           coalesce(lead(id) over (partition by grp order by rn),
                    first_value(id) over (partition by grp order by rn)) as nxt
      from grouped
  )
  update public.gx_people p
     set grp = c.grp, pos = c.pos, gives_to = c.nxt
    from chained c
   where p.id = c.id;

  update public.gx_event set status = 'matched', round = round + 1, matched_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

-- Organiser: undo the matches and open the list again.
create or replace function public.gx_admin_reopen(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.gx_pin(p_pin);
begin
  if v <> 'ok' then return jsonb_build_object('error', v); end if;
  perform 1 from public.gx_event where id = 1 for update;
  update public.gx_people set grp = null, pos = null, gives_to = null where grp is not null;
  update public.gx_event set status = 'open', matched_at = null where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- Organiser: clear everyone and start again from #1.
create or replace function public.gx_admin_reset(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.gx_pin(p_pin);
begin
  if v <> 'ok' then return jsonb_build_object('error', v); end if;
  perform 1 from public.gx_event where id = 1 for update;
  delete from public.gx_people where true;
  update public.gx_event set status = 'open', matched_at = null, round = round + 1 where id = 1;
  return jsonb_build_object('ok', true);
end $$;


-- 5. Who can call what -----------------------------------------
revoke all on function public.gx_hash(text) from public, anon, authenticated;
revoke all on function public.gx_clean(text) from public, anon, authenticated;
revoke all on function public.gx_pin(text) from public, anon, authenticated;
revoke all on function public.gx_set_pin(text) from public, anon, authenticated;
revoke all on function public.gx_person(public.gx_people) from public, anon, authenticated;

revoke all on function public.gx_board() from public;
revoke all on function public.gx_join(text) from public;
revoke all on function public.gx_me(text) from public;
revoke all on function public.gx_leave(text) from public;
revoke all on function public.gx_admin_check(text) from public;
revoke all on function public.gx_admin_add(text, text) from public;
revoke all on function public.gx_admin_remove(text, int) from public;
revoke all on function public.gx_admin_match(text) from public;
revoke all on function public.gx_admin_reopen(text) from public;
revoke all on function public.gx_admin_reset(text) from public;

grant execute on function public.gx_board() to anon, authenticated;
grant execute on function public.gx_join(text) to anon, authenticated;
grant execute on function public.gx_me(text) to anon, authenticated;
grant execute on function public.gx_leave(text) to anon, authenticated;
grant execute on function public.gx_admin_check(text) to anon, authenticated;
grant execute on function public.gx_admin_add(text, text) to anon, authenticated;
grant execute on function public.gx_admin_remove(text, int) to anon, authenticated;
grant execute on function public.gx_admin_match(text) to anon, authenticated;
grant execute on function public.gx_admin_reopen(text) to anon, authenticated;
grant execute on function public.gx_admin_reset(text) to anon, authenticated;


-- 6. Set the organiser PIN (once) --------------------------------
-- Remove the leading "--", put your own PIN (4 or more digits) and run just this line:
--
-- select public.gx_set_pin('123456');
