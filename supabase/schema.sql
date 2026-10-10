-- Carteira: esquema da base de dados (Supabase / PostgreSQL 15 ou superior)
-- Correr uma vez no SQL Editor do Supabase, por esta ordem: schema.sql e depois seed.sql.
--
-- Regra central: cada pessoa só vê e só altera as suas próprias divisões, posições e registos mensais.
-- Isso é garantido pela própria base de dados (row level security), não pela página.
-- As cotações e a taxa de câmbio são partilhadas por todos e só a tarefa de preços as escreve.

create extension if not exists pgcrypto;

-- ───────────────────────── Divisões ─────────────────────────
create table if not exists public.divisions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);

-- ───────────────────────── Posições ─────────────────────────
-- ticker: o símbolo como o utilizador o conhece (por exemplo o da XTB: VUAA.DE, MSFT.US, CIBR.UK).
-- symbol: o símbolo usado para ir buscar o preço (Yahoo). Calcula-se sozinho a partir do ticker,
--         e pode ser forçado com symbol_override. Posições manuais (PPR, obrigações fora da corretora)
--         não têm símbolo: o preço é o que o utilizador escrever em manual_price.
create table if not exists public.positions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  division_id      uuid,
  ticker           text not null check (char_length(btrim(ticker)) between 1 and 20),
  name             text not null default '' check (char_length(name) <= 80),
  qty              numeric not null check (qty >= 0),
  avg_cost         numeric not null check (avg_cost >= 0),
  currency         text not null default 'EUR' check (currency in ('EUR', 'USD')),
  manual           boolean not null default false,
  manual_price     numeric check (manual_price >= 0),
  manual_price_at  timestamptz,
  symbol_override  text check (symbol_override is null or char_length(symbol_override) <= 20),
  symbol           text generated always as (
    case when manual then null
         else upper(coalesce(nullif(btrim(symbol_override), ''),
                case when ticker ~* '\.US$' then regexp_replace(btrim(ticker), '\.US$', '', 'i')
                     when ticker ~* '\.NL$' then regexp_replace(btrim(ticker), '\.NL$', '.AS', 'i')
                     when ticker ~* '\.UK$' then regexp_replace(btrim(ticker), '\.UK$', '.L', 'i')
                     else btrim(ticker) end))
    end) stored,
  created_at       timestamptz not null default now(),
  -- a divisão tem de ser do mesmo utilizador; ao apagar a divisão, a posição fica sem divisão
  foreign key (division_id, user_id) references public.divisions (id, user_id) on delete set null (division_id)
);
create index if not exists positions_user_idx   on public.positions (user_id);
create index if not exists positions_symbol_idx on public.positions (symbol);

-- ───────────────────────── Cotações e câmbio (partilhados) ─────────────────────────
create table if not exists public.quotes (
  symbol      text primary key,
  price       numeric not null check (price > 0),
  prev_close  numeric check (prev_close is null or prev_close > 0),
  currency    text,
  as_of       timestamptz not null default now(),
  source      text not null default 'yahoo'
);

-- pair 'USD_EUR': quantos euros vale 1 dólar
create table if not exists public.fx_rates (
  pair   text primary key,
  rate   numeric not null check (rate > 0),
  as_of  timestamptz not null default now()
);

-- ───────────────────────── Registos mensais ─────────────────────────
create table if not exists public.snapshots (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month        date not null,                     -- primeiro dia do mês
  value        numeric not null,                  -- euros
  invested     numeric not null,                  -- euros
  by_division  jsonb not null default '{}'::jsonb, -- { "<id da divisão>" | "_none": { "value": x, "invested": y } }
  missing      int not null default 0,            -- posições sem preço, deixadas de fora
  updated_at   timestamptz not null default now(),
  primary key (user_id, month)
);

-- ───────────────────────── Limites por utilizador (protege o plano gratuito) ─────────────────────────
create or replace function public.enforce_limits() returns trigger
language plpgsql as $$
declare n int;
begin
  if tg_table_name = 'positions' then
    select count(*) into n from public.positions where user_id = new.user_id;
    if n >= 500 then raise exception 'Limite de 500 posições por conta atingido'; end if;
  elsif tg_table_name = 'divisions' then
    select count(*) into n from public.divisions where user_id = new.user_id;
    if n >= 30 then raise exception 'Limite de 30 divisões por conta atingido'; end if;
  end if;
  return new;
end $$;

drop trigger if exists positions_limit on public.positions;
create trigger positions_limit before insert on public.positions for each row execute function public.enforce_limits();
drop trigger if exists divisions_limit on public.divisions;
create trigger divisions_limit before insert on public.divisions for each row execute function public.enforce_limits();

-- ───────────────────────── Segurança por linha ─────────────────────────
alter table public.divisions  enable row level security;
alter table public.positions  enable row level security;
alter table public.snapshots  enable row level security;
alter table public.quotes     enable row level security;
alter table public.fx_rates   enable row level security;

drop policy if exists divisions_own on public.divisions;
create policy divisions_own on public.divisions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists positions_own on public.positions;
create policy positions_own on public.positions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists snapshots_own_read on public.snapshots;
create policy snapshots_own_read on public.snapshots for select to authenticated
  using (user_id = auth.uid());

drop policy if exists quotes_read on public.quotes;
create policy quotes_read on public.quotes for select to authenticated using (true);

drop policy if exists fx_read on public.fx_rates;
create policy fx_read on public.fx_rates for select to authenticated using (true);

-- Permissões de tabela: quem não tem sessão não vê nada; quem tem sessão só mexe nas suas linhas (políticas acima).
revoke all on public.divisions, public.positions, public.snapshots, public.quotes, public.fx_rates from anon;
revoke all on public.divisions, public.positions, public.snapshots, public.quotes, public.fx_rates from authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.divisions, public.positions to authenticated;
grant select on public.snapshots, public.quotes, public.fx_rates to authenticated;
grant all on public.divisions, public.positions, public.snapshots, public.quotes, public.fx_rates to service_role;

-- ───────────────────────── Registo mensal ─────────────────────────
-- Calcula o valor da carteira de um utilizador no mês corrente, total e por divisão, em euros.
-- Uma posição sem preço (ou com preço noutra moeda), ou em dólares sem taxa de câmbio, fica de fora e conta em "missing".
create or replace function public._snapshot_for(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_fx      numeric;
  v_month   date := date_trunc('month', now() at time zone 'Europe/Lisbon')::date;
  v_value   numeric;
  v_inv     numeric;
  v_missing int;
  v_by      jsonb;
begin
  if not exists (select 1 from positions where user_id = p_user) then
    return;
  end if;

  select rate into v_fx from fx_rates where pair = 'USD_EUR';

  with calc as (
    select p.division_id, p.qty, p.avg_cost,
           case when p.currency = 'USD' then v_fx else 1 end as r,
           case when p.manual then p.manual_price
                when q.currency is null or upper(q.currency) = p.currency then q.price
           end as price
    from positions p
    left join quotes q on q.symbol = p.symbol
    where p.user_id = p_user
  ), eur as (
    select coalesce(division_id::text, '_none') as k,
           qty * price * r  as value,
           qty * avg_cost * r as invested,
           (price is null or r is null) as missing
    from calc
  ), per_div as (
    select k, sum(value) as value, sum(invested) as invested
    from eur where not missing group by k
  )
  select coalesce((select sum(value) from per_div), 0),
         coalesce((select sum(invested) from per_div), 0),
         (select count(*) from eur where missing),
         coalesce((select jsonb_object_agg(k, jsonb_build_object('value', round(value, 2), 'invested', round(invested, 2))) from per_div), '{}'::jsonb)
    into v_value, v_inv, v_missing, v_by;

  insert into snapshots (user_id, month, value, invested, by_division, missing, updated_at)
  values (p_user, v_month, round(v_value, 2), round(v_inv, 2), v_by, v_missing, now())
  on conflict (user_id, month) do update
    set value = excluded.value, invested = excluded.invested, by_division = excluded.by_division,
        missing = excluded.missing, updated_at = excluded.updated_at;
end $$;

-- Chamada pela tarefa de preços, para todos os utilizadores (só com a chave de serviço)
create or replace function public.refresh_snapshots() returns void
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select distinct user_id from positions loop
    perform _snapshot_for(u);
  end loop;
end $$;

-- Chamada pela página, para o utilizador com sessão iniciada
create or replace function public.take_my_snapshot() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sem sessão iniciada'; end if;
  perform _snapshot_for(auth.uid());
end $$;

-- Símbolos a pedir à fonte de preços: os de todos os utilizadores, sem repetidos
create or replace function public.symbols_to_update() returns setof text
language sql stable security definer set search_path = public as $$
  select distinct symbol from positions where symbol is not null order by 1
$$;

revoke execute on function public._snapshot_for(uuid), public.refresh_snapshots(), public.take_my_snapshot(), public.symbols_to_update() from public, anon, authenticated;
grant execute on function public.refresh_snapshots(), public.symbols_to_update() to service_role;
grant execute on function public.take_my_snapshot() to authenticated;
