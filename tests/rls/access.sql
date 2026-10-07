create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
end;
$$;
create function public.test_denied(statement text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when insufficient_privilege then return;
  end;
  raise exception 'FAIL: expected permission denial for %', statement;
end;
$$;

set role service_role;
insert into public.users(id,email) values
  ('00000000-0000-4000-8000-000000000001','one@example.invalid'),
  ('00000000-0000-4000-8000-000000000002','two@example.invalid');
insert into public.restaurants(id,name) values (1,'Fixture restaurant');
insert into public.menu_items(restaurant_id,name) values (1,'Fixture meal');
insert into public.reviews(id,restaurant_id,user_id,rating) values
  (1,1,'00000000-0000-4000-8000-000000000001',4);
insert into public.review_helpful_votes(review_id,user_id) values
  (1,'00000000-0000-4000-8000-000000000002');
insert into public.follows values
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
insert into public.bookmarks(user_id,restaurant_id) select id,1 from public.users;
insert into public.notifications(user_id,type,message) select id,'profile_photo','Fixture reminder' from public.users;
insert into storage.objects(bucket_id,name) values
  ('review-photos','fixture.png'),('profile-photos','avatars/fixture.png'),('unrelated','fixture.txt');
select public.test_assert((select rating_count=1 and rating_sum=4 from public.restaurants where id=1),'service review trigger');
select public.test_assert((select helpful_count=1 from public.reviews where id=1),'service vote trigger');
update public.reviews set rating=5 where id=1;
select public.test_assert((select rating_count=1 and rating_sum=5 from public.restaurants where id=1),'rating update trigger');
delete from public.review_helpful_votes;
select public.test_assert((select helpful_count=0 from public.reviews where id=1),'vote delete trigger');
insert into public.review_helpful_votes values (1,'00000000-0000-4000-8000-000000000002',now());
select 'PASS: backend writes and counter triggers' as result;
reset role;

set role anon;
select public.test_assert((select count(*)=1 from public.restaurants),'public restaurants');
select public.test_assert((select count(*)=1 from public.menu_items),'public menus');
select public.test_assert((select count(*)=1 from public.reviews),'public gallery');
select public.test_assert((select count(*)=1 from public.follows),'public follows');
select public.test_denied('select * from public.users');
select public.test_denied('select * from public.bookmarks');
select public.test_denied('select * from public.notifications');
select public.test_denied('select * from public.review_helpful_votes');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.test_assert((select count(*)=1 from public.users),'only own email');
select public.test_assert((select count(*)=0 from public.users where id='00000000-0000-4000-8000-000000000002'),'deny other email');
select public.test_assert((select count(*)=1 from public.bookmarks),'only own bookmarks');
select public.test_assert((select count(*)=1 from public.notifications),'only own notifications');
select public.test_assert((select count(*)=0 from public.review_helpful_votes),'deny other votes');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
select public.test_assert((select count(*)=1 from public.review_helpful_votes),'own votes');
select public.test_assert((select count(*)=0 from public.bookmarks where user_id='00000000-0000-4000-8000-000000000001'),'deny other bookmarks');
select public.test_assert((select count(*)=0 from public.notifications where user_id='00000000-0000-4000-8000-000000000001'),'deny other notifications');
select set_config('request.jwt.claim.sub','',false);
select public.test_assert((select count(*)=0 from public.users),'missing uid fails closed');
select public.test_assert((select count(*)=0 from public.bookmarks),'missing uid bookmarks');
select 'PASS: anonymous denial and two-user read isolation' as result;
reset role;

-- Actual operations, including owner writes, must fail for both client roles.
do $$
declare client text; target text;
begin
  foreach client in array array['anon','authenticated'] loop
    execute format('set local role %I',client);
    foreach target in array array['restaurants','menu_items','reviews','users','follows','bookmarks','notifications','review_helpful_votes'] loop
      perform public.test_denied(format('insert into public.%I default values',target));
      perform public.test_denied(format('delete from public.%I',target));
      perform public.test_denied(format('truncate public.%I cascade',target));
      perform public.test_denied(format('update public.%I set %I=%I',target,
        case when target = 'follows' then 'follower_id' when target = 'menu_items' then 'name' when target in ('bookmarks','review_helpful_votes') then 'user_id' else 'id' end,
        case when target = 'follows' then 'follower_id' when target = 'menu_items' then 'name' when target in ('bookmarks','review_helpful_votes') then 'user_id' else 'id' end));
    end loop;
    perform public.test_denied('update public.users set is_verified=true');
    perform public.test_assert((select count(*)=0 from storage.objects where bucket_id in ('review-photos','profile-photos')),'no photo listing');
    perform public.test_assert((select count(*)=1 from storage.objects where bucket_id='unrelated'),'other buckets preserved');
    perform public.test_denied('insert into storage.objects(bucket_id,name) values (''review-photos'',''attack.png'')');
    perform public.test_denied('insert into storage.objects(bucket_id,name) values (''profile-photos'',''attack.png'')');
    update storage.objects set name='hijacked' where bucket_id in ('review-photos','profile-photos');
    perform public.test_assert(not found,'no photo replacements');
    delete from storage.objects where bucket_id in ('review-photos','profile-photos');
    perform public.test_assert(not found,'no photo deletes');
    perform public.test_assert(not has_function_privilege(current_user,'public.update_helpful_count()','execute'),'no trigger RPC grant');
    execute 'reset role';
  end loop;
end;
$$;
select 'PASS: direct writes, truncation, verification forgery, and photo uploads denied' as result;
set role service_role;
select public.test_assert((select count(*)=2 from storage.objects where bucket_id in ('review-photos','profile-photos')),'photo metadata preserved');
delete from public.review_helpful_votes;
delete from public.reviews;
select public.test_assert((select rating_count=0 and rating_sum=0 from public.restaurants where id=1),'review delete trigger');
reset role;
