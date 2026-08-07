-- Server-side rate limiting for mutations. Called from server actions with a
-- SCOPE (not a full key) — the function appends the caller's own id, so a
-- caller can never consume or poison another user's budget:
--   const { data: allowed } = await supabase.rpc('check_rate_limit',
--     { p_scope: 'items', p_max: 60, p_window_seconds: 60 });
--   if (!allowed) throw new RateLimitedError();

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

-- RLS enabled with NO policies: the table is reachable only through the
-- SECURITY DEFINER function below. Nobody reads or writes it directly.
alter table public.rate_limits enable row level security;

create or replace function public.check_rate_limit(
  p_scope text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  -- Identity comes from the verified JWT, never the caller's arguments, so the
  -- key cannot be spoofed to target someone else.
  v_key text := p_scope || ':' || coalesce(auth.uid()::text, 'anon');
begin
  insert into rate_limits as rl (key, window_start, count)
  values (v_key, v_now, 1)
  on conflict (key) do update set
    count = case
      when rl.window_start < v_now - make_interval(secs => p_window_seconds) then 1
      else rl.count + 1
    end,
    window_start = case
      when rl.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
      else rl.window_start
    end
  returning count into v_count;

  return v_count <= p_max;
end
$$;

-- Only signed-in users may call it (anonymous requests never reach actions anyway).
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated;
