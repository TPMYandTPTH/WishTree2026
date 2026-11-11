-- =========================================================
-- TP Gift Exchange - Supabase database setup
-- Supabase > SQL Editor > New query > paste all of this > Run.
-- Safe to run again: it updates what already exists and keeps
-- every exchange and name already saved.
-- Works in the Wish Tree project or in a project of its own.
-- =========================================================
--
-- How the secret is kept
-- - Nobody signs in. Each person gets a 10-character secret code
--   when they join; their phone keeps it. The host gets a host key.
-- - Only a hash of each code is stored, never the code itself.
-- - The two tables below can't be read or changed with the public
--   key at all. The pages only talk to the functions in section 3,
--   and each one returns just what that person may see:
--     a player  -> their own name and the one person they give to
--     the host  -> who joined and who has opened their gift, never the pairs
-- - The draw is one big circle (A gives to B, B to C ... last to A),
--   so nobody draws themselves and no two people simply swap.
-- - The pairs do sit in gift_people.giving_to, so anyone who opens
--   that table in Supabase Table Editor after the draw could work
--   them out. If you are playing too, don't open it.


-- 1. Tables --------------------------------------------------
create table if not exists public.gift_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[2-9A-HJ-NP-Z]{6}$'),
  host_key_hash text not null,
  name text not null check (char_length(name) between 1 and 60),
  host_name text check (host_name is null or char_length(host_name) <= 40),
  budget text check (budget is null or char_length(budget) <= 30),
  exchange_day text check (exchange_day is null or char_length(exchange_day) <= 60),
  note text check (note is null or char_length(note) <= 200),
  status text not null default 'open' check (status in ('open', 'drawn')),
  drawn_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.gift_people (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.gift_groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  hints text check (hints is null or char_length(hints) <= 200),
  key_hash text not null unique,
  giving_to uuid references public.gift_people (id) on delete set null,
  joined_at timestamptz not null default now(),
  opened_at timestamptz
);

create unique index if not exists gift_people_name_uq on public.gift_people (group_id, lower(name));
create index if not exists gift_people_group_idx on public.gift_people (group_id, joined_at);

-- Locked: no direct access with the public key. Everything goes through section 3.
alter table public.gift_groups enable row level security;
alter table public.gift_people enable row level security;
revoke all on table public.gift_groups from anon, authenticated;
revoke all on table public.gift_people from anon, authenticated;


-- 2. Helpers (used inside the database only) ------------------

-- Random code from 32 easy-to-read characters (no 0, O, 1 or I).
create or replace function public.gift_random_code(len int) returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  -- byte positions of a v4 uuid that are fully random
  pos constant int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15];
  b bytea;
  result text := '';
  i int;
begin
  while char_length(result) < len loop
    b := decode(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 'hex');
    foreach i in array pos loop
      exit when char_length(result) >= len;
      result := result || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
  end loop;
  return result;
end $$;

-- Codes are typed in any case, with or without the dash.
create or replace function public.gift_norm(k text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(k, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function public.gift_hash(k text) returns text
language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to(public.gift_norm(k), 'UTF8')), 'hex')
$$;

create or replace function public.gift_clean(t text, max_len int) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')), max_len), '')
$$;

create or replace function public.gift_clean_hints(t text) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(coalesce(t, ''), '[ \t]+', ' ', 'g')), 200), '')
$$;

create or replace function public.gift_group_json(g public.gift_groups) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'code', g.code,
    'name', g.name,
    'host_name', g.host_name,
    'budget', g.budget,
    'exchange_day', g.exchange_day,
    'note', g.note,
    'status', g.status,
    'drawn_at', g.drawn_at,
    'count', (select count(*) from public.gift_people p where p.group_id = g.id)
  )
$$;

-- Finds an exchange by its host key, or stops with bad_key.
create or replace function public.gift_host_group(p_code text, p_host_key text, p_lock boolean default false)
returns public.gift_groups
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.gift_groups%rowtype;
begin
  if p_lock then
    select * into g from public.gift_groups
     where code = public.gift_norm(p_code) and host_key_hash = public.gift_hash(p_host_key)
     for update;
  else
    select * into g from public.gift_groups
     where code = public.gift_norm(p_code) and host_key_hash = public.gift_hash(p_host_key);
  end if;
  if not found then
    raise exception 'bad_key';
  end if;
  return g;
end $$;


-- 3. What the pages can call ---------------------------------

-- Host: start a new exchange. Returns the QR code and the host key (shown once).
create or replace function public.gift_create(
  p_name text, p_host_name text default null, p_budget text default null,
  p_day text default null, p_note text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name text := public.gift_clean(p_name, 60);
  v_code text;
  v_key text;
  tries int := 0;
begin
  if v_name is null then
    raise exception 'bad_input';
  end if;
  -- simple brake against someone spamming new exchanges
  if (select count(*) from public.gift_groups where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'busy';
  end if;

  v_key := public.gift_random_code(10);
  loop
    v_code := public.gift_random_code(6);
    exit when not exists (select 1 from public.gift_groups where code = v_code);
    tries := tries + 1;
    if tries > 20 then
      raise exception 'busy';
    end if;
  end loop;

  insert into public.gift_groups (code, host_key_hash, name, host_name, budget, exchange_day, note)
  values (
    v_code, public.gift_hash(v_key), v_name,
    public.gift_clean(p_host_name, 40), public.gift_clean(p_budget, 30),
    public.gift_clean(p_day, 60), public.gift_clean_hints(p_note)
  );

  return jsonb_build_object('code', v_code, 'host_key', v_key);
end $$;

-- Anyone with the QR link: exchange name, budget, day, open or drawn, how many joined.
create or replace function public.gift_info(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  g public.gift_groups%rowtype;
begin
  select * into g from public.gift_groups where code = public.gift_norm(p_code);
  if not found then
    return null;
  end if;
  return public.gift_group_json(g);
end $$;

-- Player: join. Returns the player's secret code (their phone keeps it).
create or replace function public.gift_join(p_code text, p_name text, p_hints text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.gift_groups%rowtype;
  v_name text := public.gift_clean(p_name, 40);
  v_key text;
begin
  if v_name is null then
    raise exception 'bad_input';
  end if;

  select * into g from public.gift_groups where code = public.gift_norm(p_code) for update;
  if not found then
    raise exception 'gift_not_found';
  end if;
  if g.status <> 'open' then
    raise exception 'gift_closed';
  end if;
  if (select count(*) from public.gift_people where group_id = g.id) >= 200 then
    raise exception 'gift_full';
  end if;
  if exists (select 1 from public.gift_people where group_id = g.id and lower(name) = lower(v_name)) then
    raise exception 'name_taken';
  end if;

  v_key := public.gift_random_code(10);
  insert into public.gift_people (group_id, name, hints, key_hash)
  values (g.id, v_name, public.gift_clean_hints(p_hints), public.gift_hash(v_key));

  return jsonb_build_object('key', v_key, 'name', v_name);
end $$;

-- Player: everything this player may see. After the draw, includes the one person they give to.
create or replace function public.gift_me(p_code text, p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  g public.gift_groups%rowtype;
  me public.gift_people%rowtype;
  them public.gift_people%rowtype;
  v_match jsonb := null;
begin
  select * into g from public.gift_groups where code = public.gift_norm(p_code);
  if not found then
    raise exception 'gift_not_found';
  end if;
  select * into me from public.gift_people where group_id = g.id and key_hash = public.gift_hash(p_key);
  if not found then
    raise exception 'bad_key';
  end if;

  if g.status = 'drawn' and me.giving_to is not null then
    select * into them from public.gift_people where id = me.giving_to;
    if found then
      v_match := jsonb_build_object('name', them.name, 'hints', them.hints);
    end if;
  end if;

  return jsonb_build_object(
    'group', public.gift_group_json(g),
    'me', jsonb_build_object('name', me.name, 'hints', me.hints, 'opened', me.opened_at is not null),
    'people', coalesce((
      select jsonb_agg(p.name order by p.joined_at, p.name)
        from public.gift_people p where p.group_id = g.id
    ), '[]'::jsonb),
    'match', v_match
  );
end $$;

-- Player: mark their gift as opened (the host sees a tick, not the name).
create or replace function public.gift_opened(p_code text, p_key text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.gift_people p
     set opened_at = coalesce(p.opened_at, now())
    from public.gift_groups g
   where g.code = public.gift_norm(p_code) and p.group_id = g.id
     and p.key_hash = public.gift_hash(p_key) and g.status = 'drawn';
end $$;

-- Player: change their own gift hints (any time, so their Secret Santa sees the latest).
create or replace function public.gift_set_hints(p_code text, p_key text, p_hints text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.gift_people p
     set hints = public.gift_clean_hints(p_hints)
    from public.gift_groups g
   where g.code = public.gift_norm(p_code) and p.group_id = g.id
     and p.key_hash = public.gift_hash(p_key);
  if not found then
    raise exception 'bad_key';
  end if;
end $$;

-- Player: leave before the draw.
create or replace function public.gift_leave(p_code text, p_key text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.gift_groups%rowtype;
begin
  select * into g from public.gift_groups where code = public.gift_norm(p_code) for update;
  if not found then
    raise exception 'gift_not_found';
  end if;
  if g.status <> 'open' then
    raise exception 'already_drawn';
  end if;
  delete from public.gift_people where group_id = g.id and key_hash = public.gift_hash(p_key);
  if not found then
    raise exception 'bad_key';
  end if;
end $$;

-- Host: who joined and who has opened their gift. Never the pairs.
create or replace function public.gift_host_view(p_code text, p_host_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  g public.gift_groups%rowtype;
begin
  g := public.gift_host_group(p_code, p_host_key);
  return jsonb_build_object(
    'group', public.gift_group_json(g),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'joined_at', p.joined_at,
               'opened', p.opened_at is not null)
             order by p.joined_at, p.name)
        from public.gift_people p where p.group_id = g.id
    ), '[]'::jsonb)
  );
end $$;

-- Host: change the exchange details.
create or replace function public.gift_host_update(
  p_code text, p_host_key text, p_name text, p_host_name text,
  p_budget text, p_day text, p_note text
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.gift_groups%rowtype;
  v_name text := public.gift_clean(p_name, 60);
begin
  if v_name is null then
    raise exception 'bad_input';
  end if;
  g := public.gift_host_group(p_code, p_host_key, true);
  update public.gift_groups
     set name = v_name,
         host_name = public.gift_clean(p_host_name, 40),
         budget = public.gift_clean(p_budget, 30),
         exchange_day = public.gift_clean(p_day, 60),
         note = public.gift_clean_hints(p_note)
   where id = g.id;
end $$;

-- Host: take a name off before the draw (duplicates, tests, someone who dropped out).
create or replace function public.gift_host_remove(p_code text, p_host_key text, p_person uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.gift_groups%rowtype;
begin
  g := public.gift_host_group(p_code, p_host_key, true);
  if g.status <> 'open' then
    raise exception 'already_drawn';
  end if;
  delete from public.gift_people where id = p_person and group_id = g.id;
end $$;

-- Host: draw names. Closes joining. One random circle through everyone.
create or replace function public.gift_host_draw(p_code text, p_host_key text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.gift_groups%rowtype;
  n int;
begin
  g := public.gift_host_group(p_code, p_host_key, true);
  if g.status <> 'open' then
    raise exception 'already_drawn';
  end if;
  select count(*) into n from public.gift_people where group_id = g.id;
  if n < 3 then
    raise exception 'too_few';
  end if;

  with shuffled as (
    select id,
           row_number() over (order by pg_catalog.gen_random_uuid()) as rn,
           count(*) over () as total
      from public.gift_people
     where group_id = g.id
  )
  update public.gift_people p
     set giving_to = nxt.id, opened_at = null
    from shuffled cur
    join shuffled nxt on nxt.rn = (cur.rn % cur.total) + 1
   where p.id = cur.id;

  update public.gift_groups set status = 'drawn', drawn_at = now() where id = g.id;
  return jsonb_build_object('count', n);
end $$;

-- Host: undo the draw and reopen joining. Everyone gets a new match on the next draw.
create or replace function public.gift_host_undo(p_code text, p_host_key text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.gift_groups%rowtype;
begin
  g := public.gift_host_group(p_code, p_host_key, true);
  update public.gift_people set giving_to = null, opened_at = null where group_id = g.id;
  update public.gift_groups set status = 'open', drawn_at = null where id = g.id;
end $$;


-- 4. Who can call what -----------------------------------------
revoke all on function public.gift_random_code(int) from public, anon, authenticated;
revoke all on function public.gift_norm(text) from public, anon, authenticated;
revoke all on function public.gift_hash(text) from public, anon, authenticated;
revoke all on function public.gift_clean(text, int) from public, anon, authenticated;
revoke all on function public.gift_clean_hints(text) from public, anon, authenticated;
revoke all on function public.gift_group_json(public.gift_groups) from public, anon, authenticated;
revoke all on function public.gift_host_group(text, text, boolean) from public, anon, authenticated;

revoke all on function public.gift_create(text, text, text, text, text) from public;
revoke all on function public.gift_info(text) from public;
revoke all on function public.gift_join(text, text, text) from public;
revoke all on function public.gift_me(text, text) from public;
revoke all on function public.gift_opened(text, text) from public;
revoke all on function public.gift_set_hints(text, text, text) from public;
revoke all on function public.gift_leave(text, text) from public;
revoke all on function public.gift_host_view(text, text) from public;
revoke all on function public.gift_host_update(text, text, text, text, text, text, text) from public;
revoke all on function public.gift_host_remove(text, text, uuid) from public;
revoke all on function public.gift_host_draw(text, text) from public;
revoke all on function public.gift_host_undo(text, text) from public;

grant execute on function public.gift_create(text, text, text, text, text) to anon, authenticated;
grant execute on function public.gift_info(text) to anon, authenticated;
grant execute on function public.gift_join(text, text, text) to anon, authenticated;
grant execute on function public.gift_me(text, text) to anon, authenticated;
grant execute on function public.gift_opened(text, text) to anon, authenticated;
grant execute on function public.gift_set_hints(text, text, text) to anon, authenticated;
grant execute on function public.gift_leave(text, text) to anon, authenticated;
grant execute on function public.gift_host_view(text, text) to anon, authenticated;
grant execute on function public.gift_host_update(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.gift_host_remove(text, text, uuid) to anon, authenticated;
grant execute on function public.gift_host_draw(text, text) to anon, authenticated;
grant execute on function public.gift_host_undo(text, text) to anon, authenticated;


-- 5. Optional clean-up after the season ------------------------
-- Remove the leading "--" and run this line to delete exchanges older than 90 days
-- (their names and pairs go with them).
--
-- delete from public.gift_groups where created_at < now() - interval '90 days';
