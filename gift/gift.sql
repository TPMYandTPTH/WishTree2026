-- =========================================================
-- TP Gift Exchange (on the spot) - Supabase database setup
-- Supabase > SQL Editor > New query > paste all of this > Run.
-- Safe to run again: it keeps the people already on the list.
-- Then set the organiser PIN once (step 7 at the bottom).
-- =========================================================
--
-- How it works
-- - People scan the QR and type their name. No numbers yet.
-- - The big screen shows the QR and everyone's name.
-- - The organiser (with the PIN) taps "Match everyone": everyone gets a
--   number 1..N, which is the order they stand in. Each number gives to
--   the next one, and the last number gives to #1.
-- - The order is random. The optional gx_order list (filled in privately,
--   not in this file) can move some names towards the end of the line.
-- - Nobody signs in. Each phone keeps a random token, stored here only
--   as a hash. The tables can't be read with the public key; the pages
--   only call the functions in section 5.


-- 1. Remove earlier versions (if they're there) ------------------
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
drop function if exists public.gx_admin_people(text);
drop function if exists public.gx_admin_set_team(text, int, text);
drop function if exists public.gx_admin_roster_add(text, text, text);
drop function if exists public.gx_admin_roster_remove(text, text);
drop function if exists public.gx_team_for(text);
drop function if exists public.gx_min_clashes(int, int, int);
drop function if exists public.gx_key(text);
drop function if exists public.gx_make_circle();
drop function if exists public.gx_person(public.gx_people);
drop table if exists public.gx_roster;
alter table if exists public.gx_people drop column if exists team;


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
  num int not null unique check (num between 1 and 999),   -- join order (internal, not shown)
  name text not null check (char_length(name) between 1 and 40),
  token_hash text unique,
  grp int,
  pos int,                                                  -- number in the line, set when matching
  gives_to uuid references public.gx_people (id) on delete set null,
  joined_at timestamptz not null default now()
);
create unique index if not exists gx_people_name_uq on public.gx_people (lower(name));

-- Optional, private: first names (lower case) placed towards the end of the line.
--   'bridge' = first of the end group, 'end' = in the end group, 'last' = very last.
-- Fill it from the SQL Editor, for example:
--   insert into public.gx_order (alias, place) values ('jane', 'last');
create table if not exists public.gx_order (
  alias text primary key,
  place text not null check (place in ('bridge', 'end', 'last'))
);

-- Locked: no direct access with the public key.
alter table public.gx_event enable row level security;
alter table public.gx_people enable row level security;
alter table public.gx_order enable row level security;
revoke all on table public.gx_event from anon, authenticated;
revoke all on table public.gx_people from anon, authenticated;
revoke all on table public.gx_order from anon, authenticated;


-- 3. Helpers (inside the database only) ------------------------
create or replace function public.gx_hash(k text) returns text
language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to('tp-gift:' || btrim(coalesce(k, '')), 'UTF8')), 'hex')
$$;

create or replace function public.gx_clean(t text) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')), 40), '')
$$;

-- Where a name goes in the line: 'bridge', 'end', 'last', or null (anywhere at the front).
-- Matches the first word ("Jane Lee" -> jane), a two-word alias ("Mei Ling Tan" -> mei ling)
-- or the alias written as one word ("MeiLing" -> mei ling).
create or replace function public.gx_place(p_name text) returns text
language sql stable set search_path = '' as $$
  with k as (
    select btrim(regexp_replace(lower(regexp_replace(coalesce(p_name, ''), '[^A-Za-z ]', '', 'g')), '\s+', ' ', 'g')) as key
  )
  select o.place
    from public.gx_order o, k
   where k.key <> ''
     and (k.key = o.alias or k.key like o.alias || ' %' or split_part(k.key, ' ', 1) = replace(o.alias, ' ', ''))
   order by case o.place when 'last' then 1 when 'bridge' then 2 else 3 end
   limit 1
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


-- 4. Matching ----------------------------------------------------
-- Gives everyone a number 1..N: the front of the line in random order,
-- then anyone on the gx_order list ('bridge' first, 'last' at the very end).
-- Each number gives to the next one; the last gives to #1.
create or replace function public.gx_make_line() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  ids uuid[];
  n int;
begin
  ids := array(
    select id
      from (select id, public.gx_place(name) as pl, pg_catalog.gen_random_uuid() as r from public.gx_people) s
     order by case when pl is null then 0 when pl = 'bridge' then 1 when pl = 'end' then 2 else 3 end, r
  );
  n := coalesce(cardinality(ids), 0);
  if n < 2 then
    return n;
  end if;
  update public.gx_people p
     set grp = 1, pos = c.i, gives_to = ids[(c.i % n) + 1]
    from (select ids[i] as id, i from generate_series(1, n) i) c
   where p.id = c.id;
  return n;
end $$;


-- 5. What the pages can call ---------------------------------

-- Big screen (and phones): everyone's name, and the numbered line once matched.
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
    'line', case when e.status = 'matched' then coalesce((
      select jsonb_agg(jsonb_build_object('pos', p.pos, 'name', p.name) order by p.pos)
        from public.gx_people p
       where p.pos is not null
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;

-- Phone: join. Returns the phone's token.
create or replace function public.gx_join(p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.gx_event%rowtype;
  v_name text := public.gx_clean(p_name);
  v_num int;
  v_token text;
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
  if exists (select 1 from public.gx_people where lower(name) = lower(v_name)) then
    raise exception 'name_taken';
  end if;

  select coalesce(max(num), 0) + 1 into v_num from public.gx_people;
  v_token := replace(pg_catalog.gen_random_uuid()::text, '-', '') || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  insert into public.gx_people (num, name, token_hash) values (v_num, v_name, public.gx_hash(v_token));
  return jsonb_build_object('name', v_name, 'token', v_token);
end $$;

-- Phone: this person's status, and once matched their number, who they give to and get from.
create or replace function public.gx_me(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.gx_event%rowtype;
  me public.gx_people%rowtype;
  v_give public.gx_people%rowtype;
  v_get public.gx_people%rowtype;
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
    v_match := jsonb_build_object(
      'pos', me.pos,
      'give', jsonb_build_object('pos', v_give.pos, 'name', v_give.name),
      'get', jsonb_build_object('pos', v_get.pos, 'name', v_get.name)
    );
  end if;

  return jsonb_build_object(
    'name', me.name,
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
begin
  if v <> 'ok' then return jsonb_build_object('error', v); end if;
  if v_name is null then return jsonb_build_object('error', 'bad_input'); end if;
  select * into e from public.gx_event where id = 1 for update;
  if e.status <> 'open' then return jsonb_build_object('error', 'already_matched'); end if;
  if exists (select 1 from public.gx_people where lower(name) = lower(v_name)) then
    return jsonb_build_object('error', 'name_taken');
  end if;
  select coalesce(max(num), 0) + 1 into v_num from public.gx_people;
  insert into public.gx_people (num, name) values (v_num, v_name);
  return jsonb_build_object('ok', true, 'name', v_name);
end $$;

-- Organiser: take a name off the list (only before matching). Uses the internal join number.
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

-- Organiser: give everyone their number in the line.
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
  perform public.gx_make_line();
  update public.gx_event set status = 'matched', round = round + 1, matched_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

-- Organiser: undo the matching and open the list again.
create or replace function public.gx_admin_reopen(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.gx_pin(p_pin);
begin
  if v <> 'ok' then return jsonb_build_object('error', v); end if;
  perform 1 from public.gx_event where id = 1 for update;
  update public.gx_people set grp = null, pos = null, gives_to = null where pos is not null or gives_to is not null;
  update public.gx_event set status = 'open', matched_at = null where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- Organiser: clear everyone and start again.
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


-- 6. Who can call what -----------------------------------------
revoke all on function public.gx_hash(text) from public, anon, authenticated;
revoke all on function public.gx_clean(text) from public, anon, authenticated;
revoke all on function public.gx_place(text) from public, anon, authenticated;
revoke all on function public.gx_pin(text) from public, anon, authenticated;
revoke all on function public.gx_set_pin(text) from public, anon, authenticated;
revoke all on function public.gx_make_line() from public, anon, authenticated;

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


-- 7. Set the organiser PIN (once) --------------------------------
-- Remove the leading "--", put your own PIN (4 or more digits) and run just this line:
--
-- select public.gx_set_pin('123456');
