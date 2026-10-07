set role service_role;
insert into public.bookmark_shares(user_id,token_hash,expires_at) values
  ('00000000-0000-4000-8000-000000000001',repeat('a',64),now()+interval '30 days');
select public.test_assert((select count(*)=1 from public.bookmark_shares),'backend share access');
insert into public.bookmark_shares(user_id,token_hash,expires_at) values
  ('00000000-0000-4000-8000-000000000001',repeat('b',64),now()+interval '30 days')
  on conflict (user_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at;
select public.test_assert((select count(*)=0 from public.bookmark_shares where token_hash=repeat('a',64)),'rotation invalidates old token');
update public.bookmark_shares set expires_at=now()-interval '1 second';
select public.test_assert((select count(*)=0 from public.bookmark_shares where expires_at>now()),'expired share excluded');
reset role;
set role anon;
select public.test_denied('select * from public.bookmark_shares');
select public.test_denied('insert into public.bookmark_shares default values');
select public.test_denied('update public.bookmark_shares set expires_at=now()');
select public.test_denied('delete from public.bookmark_shares');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.test_denied('select * from public.bookmark_shares');
select public.test_denied('insert into public.bookmark_shares default values');
select public.test_denied('update public.bookmark_shares set expires_at=now()');
select public.test_denied('delete from public.bookmark_shares');
reset role;
select 'PASS: share capability hashes inaccessible even to their owner via Data API' as result;
