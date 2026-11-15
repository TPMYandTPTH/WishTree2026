-- =========================================================
-- TP Gift Exchange (on the spot) - Supabase database setup
-- Supabase > SQL Editor > New query > paste all of this > Run.
-- Safe to run again: it keeps the people and saved tags already there.
-- Then set the organiser PIN once (step 7 at the bottom).
-- =========================================================
--
-- How it works
-- - One event at a time. People scan the QR, type their name and get
--   the next simple number (#1, #2, #3 ...).
-- - The big screen shows the QR and everyone's number and name.
-- - The organiser (with the PIN) taps "Match everyone": everyone is put
--   in one random circle. Each person gives to the next one and gets
--   from the one before, so nobody simply swaps with the person they
--   give to (with 3 or more people), and odd numbers work the same way.
-- - Private organiser rule: people can be tagged R or S on the organiser
--   page. The circle never puts two R people or two S people next to
--   each other, so nobody gives to someone tagged the same as them.
--   Untagged people can go anywhere. Tags never reach the big screen or
--   the phones.
-- - Nobody signs in. Each phone keeps a random token, stored here only
--   as a hash. The tables can't be read with the public key; the pages
--   only call the functions in section 5.


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
alter table public.gx_people add column if not exists team text check (team in ('R', 'S'));

-- Saved tags: when a name on this list joins, it gets the tag automatically.
create table if not exists public.gx_roster (
  key text primary key,
  name text not null,
  team text not null check (team in ('R', 'S')),
  updated_at timestamptz not null default now()
);

-- Locked: no direct access with the public key.
alter table public.gx_event enable row level security;
alter table public.gx_people enable row level security;
alter table public.gx_roster enable row level security;
revoke all on table public.gx_event from anon, authenticated;
revoke all on table public.gx_people from anon, authenticated;
revoke all on table public.gx_roster from anon, authenticated;


-- 3. Helpers (inside the database only) ------------------------
create or replace function public.gx_hash(k text) returns text
language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to('tp-gift:' || btrim(coalesce(k, '')), 'UTF8')), 'hex')
$$;

create or replace function public.gx_clean(t text) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')), 40), '')
$$;

create or replace function public.gx_key(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(public.gx_clean(t))
$$;

-- Saved tag for a name: exact match, or the saved name followed by more words
-- (a saved "Wei Ling" also tags "Wei Ling Tan").
create or replace function public.gx_team_for(p_name text) returns text
language sql stable set search_path = '' as $$
  select r.team from public.gx_roster r
   where public.gx_key(p_name) = r.key or public.gx_key(p_name) like r.key || ' %'
   order by char_length(r.key) desc
   limit 1
$$;

-- The fewest clashes possible: only when one tag has more than half the people.
create or replace function public.gx_min_clashes(n int, r int, s int) returns int
language sql immutable set search_path = '' as $$
  select greatest(0, 2 * r - n) + greatest(0, 2 * s - n)
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


-- 4. Matching ----------------------------------------------------
-- One random circle through everyone, built so nobody gives to someone with
-- the same tag (or as few as the numbers allow):
-- the bigger tagged group goes round the circle first in random order, the
-- gaps between them get a random number of other people (at least one each),
-- and the smaller tagged group is spread so two of them never sit together.
create or replace function public.gx_make_circle() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  r_ids uuid[]; s_ids uuid[]; o_ids uuid[];
  a_ids uuid[]; b_ids uuid[]; rest uuid[];
  n int; a int; b int; o int; m int;
  cuts int[]; sizes int[] := '{}'; slots int[]; bc int[]; chosen int[]; pick int[];
  circle uuid[] := '{}';
  prev int; nxt int; g int; k int; og int; bi int := 1; oi int := 1; ri int := 1;
begin
  r_ids := array(select id from public.gx_people where team = 'R' order by pg_catalog.gen_random_uuid());
  s_ids := array(select id from public.gx_people where team = 'S' order by pg_catalog.gen_random_uuid());
  o_ids := array(select id from public.gx_people where team is null order by pg_catalog.gen_random_uuid());
  if cardinality(r_ids) > cardinality(s_ids) or (cardinality(r_ids) = cardinality(s_ids) and random() < 0.5) then
    a_ids := r_ids; b_ids := s_ids;
  else
    a_ids := s_ids; b_ids := r_ids;
  end if;
  a := cardinality(a_ids); b := cardinality(b_ids); o := cardinality(o_ids);
  n := a + b + o; m := n - a;
  if n < 2 then
    return 0;
  end if;

  if a = 0 then
    -- nobody tagged: a plain random circle
    circle := o_ids;
  elsif a > m then
    -- the bigger group is more than half: everyone else goes in a different gap,
    -- some of that group have to sit together
    rest := array(select x from unnest(b_ids || o_ids) x order by pg_catalog.gen_random_uuid());
    pick := array(select gg from generate_series(1, a) gg order by random() limit m);
    for g in 1 .. a loop
      circle := circle || a_ids[g];
      if g = any(pick) then
        circle := circle || rest[ri];
        ri := ri + 1;
      end if;
    end loop;
  else
    -- split the others into a gaps of random size (each at least 1)
    cuts := array(select c from generate_series(1, m - 1) c order by random() limit a - 1);
    cuts := array(select x from unnest(cuts) x order by x);
    prev := 0;
    for g in 1 .. a loop
      nxt := case when g < a then cuts[g] else m end;
      sizes := sizes || (nxt - prev);
      prev := nxt;
    end loop;
    -- a gap of size s can hold up to ceil(s/2) of the smaller group without two touching
    slots := array(select gg from generate_series(1, a) gg, generate_series(1, (sizes[gg] + 1) / 2) kk order by random());
    bc := array_fill(0, array[a]);
    for k in 1 .. b loop
      bc[slots[k]] := bc[slots[k]] + 1;
    end loop;
    for g in 1 .. a loop
      circle := circle || a_ids[g];
      og := sizes[g] - bc[g];
      chosen := array(select kk from generate_series(0, og) kk order by random() limit bc[g]);
      for k in 0 .. og loop
        if k = any(chosen) then
          circle := circle || b_ids[bi];
          bi := bi + 1;
        end if;
        if k < og then
          circle := circle || o_ids[oi];
          oi := oi + 1;
        end if;
      end loop;
    end loop;
  end if;

  update public.gx_people p
     set grp = 1, pos = c.i, gives_to = circle[(c.i % n) + 1]
    from (select circle[i] as id, i from generate_series(1, n) i) c
   where p.id = c.id;

  return (select count(*)::int from public.gx_people x join public.gx_people y on y.id = x.gives_to
           where x.team is not null and x.team = y.team);
end $$;


-- 5. What the pages can call ---------------------------------

-- Big screen (and phones): everyone on the list, and who gives to who once matched.
-- Tags are never included here.
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
    'gives', case when e.status = 'matched' then coalesce((
      select jsonb_agg(jsonb_build_object('from', public.gx_person(a), 'to', public.gx_person(b)) order by a.num)
        from public.gx_people a
        join public.gx_people b on b.id = a.gives_to
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
  insert into public.gx_people (num, name, token_hash, team)
  values (v_num, v_name, public.gx_hash(v_token), public.gx_team_for(v_name));
  return jsonb_build_object('num', v_num, 'name', v_name, 'token', v_token);
end $$;

-- Phone: this person's number, and who they give to / get from once matched.
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

-- Organiser page: everyone with their tag, the saved tags, and the clash check.
create or replace function public.gx_admin_people(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.gx_pin(p_pin);
  e public.gx_event%rowtype;
  n int; r int; s int;
begin
  if v <> 'ok' then return jsonb_build_object('error', v); end if;
  select * into e from public.gx_event where id = 1;
  select count(*)::int, count(*) filter (where team = 'R')::int, count(*) filter (where team = 'S')::int
    into n, r, s from public.gx_people;
  return jsonb_build_object(
    'ok', true,
    'status', e.status,
    'round', e.round,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('num', p.num, 'name', p.name, 'team', p.team) order by p.num)
        from public.gx_people p
    ), '[]'::jsonb),
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'team', x.team) order by x.team, x.key)
        from public.gx_roster x
    ), '[]'::jsonb),
    'count', n, 'r', r, 's', s,
    'min_clashes', public.gx_min_clashes(n, r, s),
    'clashes', case when e.status = 'matched' then (
      select count(*)::int from public.gx_people a join public.gx_people b on b.id = a.gives_to
       where a.team is not null and a.team = b.team
    ) else null end
  );
end $$;

-- Organiser: tag a person (R, S or null). The tag is saved for that name too.
create or replace function public.gx_admin_set_team(p_pin text, p_num int, p_team text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.gx_pin(p_pin);
  p public.gx_people%rowtype;
  t text := nullif(upper(btrim(coalesce(p_team, ''))), '');
begin
  if v <> 'ok' then return jsonb_build_object('error', v); end if;
  if t is not null and t not in ('R', 'S') then return jsonb_build_object('error', 'bad_input'); end if;
  select * into p from public.gx_people where num = p_num;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  update public.gx_people set team = t where id = p.id;
  if t is null then
    delete from public.gx_roster where key = public.gx_key(p.name);
  else
    insert into public.gx_roster (key, name, team) values (public.gx_key(p.name), p.name, t)
    on conflict (key) do update set team = excluded.team, name = excluded.name, updated_at = now();
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Organiser: save a tag for a name before that person joins.
create or replace function public.gx_admin_roster_add(p_pin text, p_name text, p_team text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.gx_pin(p_pin);
  v_name text := public.gx_clean(p_name);
  t text := upper(btrim(coalesce(p_team, '')));
begin
  if v <> 'ok' then return jsonb_build_object('error', v); end if;
  if v_name is null or t not in ('R', 'S') then return jsonb_build_object('error', 'bad_input'); end if;
  insert into public.gx_roster (key, name, team) values (public.gx_key(v_name), v_name, t)
  on conflict (key) do update set team = excluded.team, name = excluded.name, updated_at = now();
  -- tag anyone already on the list with that name (only if they have no tag yet)
  update public.gx_people set team = t
   where team is null and (public.gx_key(name) = public.gx_key(v_name) or public.gx_key(name) like public.gx_key(v_name) || ' %');
  return jsonb_build_object('ok', true);
end $$;

-- Organiser: forget a saved tag (people already tagged keep their tag).
create or replace function public.gx_admin_roster_remove(p_pin text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.gx_pin(p_pin);
begin
  if v <> 'ok' then return jsonb_build_object('error', v); end if;
  delete from public.gx_roster where key = public.gx_key(p_name);
  return jsonb_build_object('ok', true);
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
  insert into public.gx_people (num, name, team) values (v_num, v_name, public.gx_team_for(v_name));
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

-- Organiser: match everyone in one circle.
create or replace function public.gx_admin_match(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.gx_pin(p_pin);
  e public.gx_event%rowtype;
  n int;
  c int;
begin
  if v <> 'ok' then return jsonb_build_object('error', v); end if;
  select * into e from public.gx_event where id = 1 for update;
  if e.status <> 'open' then return jsonb_build_object('error', 'already_matched'); end if;
  select count(*) into n from public.gx_people;
  if n < 2 then return jsonb_build_object('error', 'too_few'); end if;
  c := public.gx_make_circle();
  update public.gx_event set status = 'matched', round = round + 1, matched_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'count', n, 'clashes', c);
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

-- Organiser: clear everyone and start again from #1 (saved tags stay).
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
revoke all on function public.gx_key(text) from public, anon, authenticated;
revoke all on function public.gx_team_for(text) from public, anon, authenticated;
revoke all on function public.gx_min_clashes(int, int, int) from public, anon, authenticated;
revoke all on function public.gx_pin(text) from public, anon, authenticated;
revoke all on function public.gx_set_pin(text) from public, anon, authenticated;
revoke all on function public.gx_person(public.gx_people) from public, anon, authenticated;
revoke all on function public.gx_make_circle() from public, anon, authenticated;

revoke all on function public.gx_board() from public;
revoke all on function public.gx_join(text) from public;
revoke all on function public.gx_me(text) from public;
revoke all on function public.gx_leave(text) from public;
revoke all on function public.gx_admin_check(text) from public;
revoke all on function public.gx_admin_people(text) from public;
revoke all on function public.gx_admin_set_team(text, int, text) from public;
revoke all on function public.gx_admin_roster_add(text, text, text) from public;
revoke all on function public.gx_admin_roster_remove(text, text) from public;
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
grant execute on function public.gx_admin_people(text) to anon, authenticated;
grant execute on function public.gx_admin_set_team(text, int, text) to anon, authenticated;
grant execute on function public.gx_admin_roster_add(text, text, text) to anon, authenticated;
grant execute on function public.gx_admin_roster_remove(text, text) to anon, authenticated;
grant execute on function public.gx_admin_add(text, text) to anon, authenticated;
grant execute on function public.gx_admin_remove(text, int) to anon, authenticated;
grant execute on function public.gx_admin_match(text) to anon, authenticated;
grant execute on function public.gx_admin_reopen(text) to anon, authenticated;
grant execute on function public.gx_admin_reset(text) to anon, authenticated;


-- 7. Set the organiser PIN (once) --------------------------------
-- Remove the leading "--", put your own PIN (4 or more digits) and run just this line:
--
-- select public.gx_set_pin('123456');
