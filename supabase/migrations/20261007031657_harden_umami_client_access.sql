-- Existing UMami schema: writes are owned by the authenticated API/worker.
begin;

do $$
declare
  target text;
  existing record;
  columns text;
begin
  foreach target in array array[
    'restaurants', 'menu_items', 'reviews', 'users', 'follows',
    'bookmarks', 'notifications', 'review_helpful_votes'
  ] loop
    execute format('alter table public.%I enable row level security', target);
    for existing in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = target
    loop
      execute format('drop policy %I on public.%I', existing.policyname, target);
    end loop;
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', target);
    -- Table revocation does not remove separately granted column privileges.
    select string_agg(format('%I', attname), ', ' order by attnum)
      into columns from pg_attribute
      where attrelid = format('public.%I', target)::regclass
        and attnum > 0 and not attisdropped;
    execute format(
      'revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on public.%2$I from public, anon, authenticated',
      columns, target
    );
  end loop;
end;
$$;

grant select on public.restaurants, public.menu_items, public.reviews,
  public.follows to anon, authenticated;
grant select on public.users, public.bookmarks, public.notifications,
  public.review_helpful_votes to authenticated;

create policy umami_public_read on public.restaurants
  for select to anon, authenticated using (true);
create policy umami_public_read on public.menu_items
  for select to anon, authenticated using (true);
create policy umami_public_read on public.reviews
  for select to anon, authenticated using (true);
create policy umami_public_read on public.follows
  for select to anon, authenticated using (true);
create policy umami_owner_read on public.users
  for select to authenticated using (id = (select auth.uid()));
create policy umami_owner_read on public.bookmarks
  for select to authenticated using (user_id = (select auth.uid()));
create policy umami_owner_read on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy umami_owner_read on public.review_helpful_votes
  for select to authenticated using (user_id = (select auth.uid()));

-- Both schemas are verified to disallow client CREATE. Put pg_temp last.
-- Keep SECURITY INVOKER: backend service_role writes maintain the counters.
alter function public.update_helpful_count() set search_path = public, pg_temp;
alter function public.update_restaurant_rating_optimized() set search_path = public, pg_temp;
revoke execute on function public.update_helpful_count(),
  public.update_restaurant_rating_optimized() from public, anon, authenticated;

drop policy if exists "Allow authenticated uploads 1tsy3yu_0" on storage.objects;
drop policy if exists "Allow public read 1tsy3yu_0" on storage.objects;
drop policy if exists umami_api_owned_photos on storage.objects;
-- Restrictive policies prevent another permissive bucket policy reopening access.
-- Public object URLs still work; writes/listing go through the API service role.
create policy umami_api_owned_photos on storage.objects
  as restrictive for all to anon, authenticated
  using (bucket_id not in ('review-photos', 'profile-photos'))
  with check (bucket_id not in ('review-photos', 'profile-photos'));

commit;
