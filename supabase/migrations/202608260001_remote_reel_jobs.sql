create extension if not exists pgcrypto;

create table if not exists public.remote_reel_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  request jsonb not null check (
    jsonb_typeof(request) = 'object'
    and request->>'schemaVersion' = '1'
    and jsonb_typeof(request->'overlays') = 'array'
    and jsonb_array_length(request->'overlays') between 1 and 12
  ),
  progress double precision not null default 0 check (progress between 0 and 1),
  worker_id text,
  worker_heartbeat_at timestamptz,
  output_object_path text,
  thumbnail_object_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists remote_reel_jobs_user_created_idx
  on public.remote_reel_jobs(user_id, created_at desc);
create index if not exists remote_reel_jobs_queue_idx
  on public.remote_reel_jobs(status, created_at);

alter table public.remote_reel_jobs enable row level security;

drop policy if exists "Users can read their reel jobs" on public.remote_reel_jobs;
create policy "Users can read their reel jobs"
  on public.remote_reel_jobs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create queued reel jobs" on public.remote_reel_jobs;
create policy "Users can create queued reel jobs"
  on public.remote_reel_jobs
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'queued'
    and progress = 0
    and worker_id is null
    and output_object_path is null
    and thumbnail_object_path is null
    and error is null
    and request->'background'->>'objectPath' like user_id::text || '/inputs/%'
    and not exists (
      select 1
      from jsonb_array_elements(request->'overlays') as overlay
      where overlay->>'objectPath' not like user_id::text || '/inputs/%'
    )
    and (
      request->'bgm' = 'null'::jsonb
      or request->'bgm'->>'objectPath' like user_id::text || '/inputs/%'
    )
  );

drop policy if exists "Users can delete finished reel jobs" on public.remote_reel_jobs;
create policy "Users can delete finished reel jobs"
  on public.remote_reel_jobs
  for delete
  to authenticated
  using ((select auth.uid()) = user_id and status in ('completed', 'failed'));

create or replace function public.enforce_remote_reel_job_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (
    select count(*)
    from public.remote_reel_jobs
    where user_id = new.user_id and status in ('queued', 'processing')
  ) >= 5 then
    raise exception '同時に生成待ちにできるリールは5本までです。';
  end if;
  if (
    select count(*)
    from public.remote_reel_jobs
    where user_id = new.user_id and created_at >= now() - interval '24 hours'
  ) >= 50 then
    raise exception '24時間の生成上限に達しました。時間を置いてお試しください。';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_remote_reel_job_quota() from public;
drop trigger if exists enforce_remote_reel_job_quota on public.remote_reel_jobs;
create trigger enforce_remote_reel_job_quota
  before insert on public.remote_reel_jobs
  for each row execute function public.enforce_remote_reel_job_quota();

create or replace function public.claim_remote_reel_job(p_worker_id text)
returns setof public.remote_reel_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_id uuid;
begin
  if coalesce(length(trim(p_worker_id)), 0) = 0 then
    raise exception 'worker id is required';
  end if;

  update public.remote_reel_jobs
  set
    status = 'failed',
    error = 'Macワーカーとの接続が途切れました。もう一度生成してください。',
    completed_at = now(),
    updated_at = now()
  where status = 'processing'
    and worker_heartbeat_at < now() - interval '30 minutes';

  select id into selected_id
  from public.remote_reel_jobs
  where status = 'queued'
  order by created_at asc
  for update skip locked
  limit 1;

  if selected_id is null then
    return;
  end if;

  return query
  update public.remote_reel_jobs
  set
    status = 'processing',
    progress = 0.01,
    worker_id = p_worker_id,
    worker_heartbeat_at = now(),
    error = null,
    updated_at = now()
  where id = selected_id and status = 'queued'
  returning *;
end;
$$;

revoke all on function public.claim_remote_reel_job(text) from public;
revoke all on function public.claim_remote_reel_job(text) from anon;
revoke all on function public.claim_remote_reel_job(text) from authenticated;
grant execute on function public.claim_remote_reel_job(text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reel-private',
  'reel-private',
  false,
  1073741824,
  array[
    'image/jpeg',
    'image/png',
    'video/mp4',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/x-m4a',
    'audio/wav',
    'audio/x-wav'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their reel files" on storage.objects;
create policy "Users can upload their reel files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'reel-private'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] = 'inputs'
  );

drop policy if exists "Users can read their reel files" on storage.objects;
create policy "Users can read their reel files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'reel-private'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can remove their reel files" on storage.objects;
create policy "Users can remove their reel files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'reel-private'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
