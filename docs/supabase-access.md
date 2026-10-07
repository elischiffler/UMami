# Supabase access review and hardening

Live metadata inspected on October 6, 2026 (America/Los_Angeles), project
`yxuclucskxbqrgjhbzou` (UMami). Both migrations were **applied with user approval**
on October 6 at 8:16 PM PDT. The findings below describe the pre-change state.
The starting code is personal-fork main `0947333`.

## Confirmed findings

- **FAIL:** RLS is disabled on reviews, follows, review_helpful_votes, and
  notifications. Both client roles have all table privileges, including
  TRUNCATE, which RLS does not restrict.
- **FAIL:** Bookmarks have public SELECT and authenticated INSERT WITH CHECK
  true alongside owner policies. Permissive policies combine with OR, so the
  owner policies do not close those paths.
- **FAIL:** Users have public SELECT on every column, including email. The
  owner UPDATE policy permits changing is_verified directly, bypassing the
  backend's verified-email calculation and allowed-field list.
- **FAIL:** Storage permits authenticated uploads anywhere in review-photos
  and public object listing. Both photo buckets are public, with no size or
  MIME limits. Public URLs are an intentional existing application behavior.
- **FAIL:** Both counter trigger functions lack fixed search paths.
- **WARN:** Supabase reports leaked-password protection disabled. This is an
  Auth setting and is outside the SQL patch; check plan availability before
  enabling it. [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Authoritative access paths

| Data                               | Client access after this patch                  | App access                                                                                |
| ---------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Restaurants / menu items / reviews | Public SELECT; no writes                        | Public API reads, authenticated review writes, worker catalog writes                      |
| Follows                            | Public SELECT; no writes                        | Public profile following; owner-authenticated sync                                        |
| Users                              | Owner SELECT; no writes                         | Public API selects only id/name/avatar/created_at/is_verified; owner API includes email   |
| Bookmarks                          | Owner SELECT; no writes                         | Direct browser reads in Restaurants/RestaurantInfo; owner API writes and saved-list reads |
| Notifications / helpful votes      | Owner SELECT; no writes                         | Authenticated API restricts private records to the verified caller                        |
| Review/profile photos              | No client listing or mutations in these buckets | Authenticated upload API uses server secret; public image URLs keep rendering             |
| Bookmark share hashes              | No client access                                | API generates/resolves/revokes optional read-only capabilities                            |

`frontend/src/pages/PhotoGallery.jsx` selects reviews directly. Restaurants and
RestaurantInfo select the caller's bookmarks directly. Other mutations use
the API. `backend/config/supabaseClient.js` uses a server secret, which bypasses
RLS. `backend/middleware/auth.js` verifies bearer tokens using getUser;
ownership and input checks in the backend therefore remain essential. The
worker also needs privileged writes. No SECURITY DEFINER function is added.

Bookmarks are private by default with optional sharing. This patch
also protects the privileged `/api/restaurants/bookmarks/:userId` read route
and stops fetching/displaying bookmarks on other users' profiles. RLS alone
would not fix that route because its secret bypasses RLS.

Owners explicitly create a link from their saved restaurants. The API derives
ownership from verified Auth, generates 256 random bits, stores only SHA-256
hashes, and expires the capability after 30 days. Replacing a link invalidates
the old link atomically; revocation deletes only the caller's capability row.
The viewer receives only saved restaurant fields, without owner identity or
email, and cannot edit bookmarks. Direct access to bookmark_shares is denied
even to the owner. The raw token stays in the URL fragment and POST body,
avoiding server access-log URLs and referrer headers. Responses use no-store.
A recipient can retain previously downloaded content; revocation prevents
future retrieval. Do not add request-body logging for these routes.

## Migration and verification

`supabase/migrations/20261007031657_harden_umami_client_access.sql` is an
additive access-control migration for the existing eight-table schema. It
replaces policies on those tables, revokes client table and column grants,
restores only SELECT privileges, fixes function search paths, and restricts
client photo operations without changing other buckets' policies. It does
not delete application rows or Storage bytes, change bucket publicity, or
create cloud resources. Unexpected tables/views/functions require a fresh
review before live application.

`supabase/migrations/20261007031659_add_private_bookmark_shares.sql` adds a
service-only capability table. Apply it after the hardening migration, before
releasing the share-link UI. The table deliberately has RLS enabled without
client policies, with client grants revoked. Any advisor notice about that
absence is expected; do not add a public policy to silence it.

Run `npm run test:rls` with Docker available. It runs the migration twice in
a disposable, network-isolated PostgreSQL 17 container, with no host port or
persistent volume, using only synthetic users. Tests execute real SQL under
anon, authenticated and service_role, checking private row isolation,
public reads, owner-write denial, column-grant revocation, TRUNCATE denial,
photo upload/list/update/delete denial, backend counter maintenance, capability
hash privacy, rotation and expiry. Jest tests also exercise share authentication,
ownership derivation, token validation, read-only field selection and failures.
The schema fixture is an approximation of the inspected schema, not a full
Supabase emulator. These tests do not prove Auth JWT issuance, PostgREST
behavior, Storage object-byte operations, or the live deployed API version.

Local verification: **PASS** for PostgreSQL access/counter/capability tests,
107 frontend tests, 310 backend tests, lint, formatting and the Vite production
build. Browser inspection at desktop and 390x844 confirmed that the read-only
shared page fits without horizontal overflow and images load; fixture owner
controls create and revoke links on desktop/mobile. These browser checks used
only synthetic data and stubbed sharing responses. Remote CI passed build,
RLS, frontend, container and browser checks on `86f4a154`.

Live read-only verification after applying both migrations: **PASS** for RLS
on all nine public tables, effective client table/column write and TRUNCATE
denial, anonymous private-table denial, service-role access, owner SELECT
policies, restrictive photo policy, and invoker trigger search paths. A SQL
authenticated-role read with a synthetic unowned subject returned no private
rows and could read public restaurants. No application rows or photo bytes
were changed. Security advisors no longer report disabled RLS or mutable
function paths; the share table's no-policy INFO is intentional, and leaked
password protection remains disabled. This is live SQL/metadata evidence,
not real-user JWT or Storage-byte acceptance. Migration filenames match the
versions assigned by Supabase's migration history. Application deployment and
post-release checks must be recorded separately.

Anonymous live HTTPS Data API checks also passed: public content returned 200,
all five private tables returned 401 with Postgres code 42501, and both photo
bucket list endpoints returned empty lists. No private rows were downloaded.

Production application requires approval of the exact migration and target.
Deploy the corresponding API/frontend through the user-approved merge before
or alongside the database change: SQL alone cannot make the old privileged
bookmark endpoint private. After application, inspect pg_policies and grants,
rerun security advisors and verify anonymous public reads plus two real
users' separation through the API/Data API in an approved test environment.
Keep U2-U4 BLOCKED until that provider acceptance is recorded. The SQL is
transactional; a failure before COMMIT rolls back permission changes. After
COMMIT, an image rollback does not undo the database policies. Prefer a
reviewed forward correction; restoring the former configuration reopens the
confirmed exposures. Take a protected metadata snapshot before applying.

## Separate follow-ups

- The legacy Azure site's public bundle uses this Supabase project. Its API
  still returned 200/empty list for an unauthenticated bookmark-route request
  with a synthetic nonexistent user ID; no actual user's bookmarks were read.
  Its exact backend project configuration is not verified. Personal-fork
  deployments cannot update that organization's Azure app. Update or retire
  that legacy API with explicit authority; this release alone cannot establish
  privacy there. Do not delete a shared App Service plan during retirement.
- The API uses one privileged client for public reads, user writes and worker
  operations. Separating a verified user's scoped client from the worker/admin
  client would add database enforcement behind API guards. This needs its own
  PR because profile joins, counter triggers and read contracts must change
  together; adopting owner-write policies alone would break cross-row counters.
- Upload routes use unrestricted in-memory multer uploads and caller-supplied
  MIME types/extensions. Add decoded-image validation, bounded request sizes,
  quotas/rate limits, and owner paths for review-photo cleanup in a separate
  PR. Blocking direct Storage clients does not constrain the privileged API.
- The profile's current privacy toggle is stored in localStorage and cannot
  enforce server privacy. Replace it with a persisted backend rule before
  presenting private profiles as a supported security guarantee.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control),
[Search-path advisory](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
