begin;
create table public.bookmark_shares (
  user_id uuid primary key references public.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.bookmark_shares enable row level security;
revoke all privileges on public.bookmark_shares from public, anon, authenticated;
grant select, insert, update, delete on public.bookmark_shares to service_role;
-- No client policy: only the API may resolve, rotate or revoke capabilities.
commit;
