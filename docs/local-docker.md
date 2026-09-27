# Local Docker preview

Run from the repository root with Node.js 24 and Docker Desktop Linux containers. The default Compose project is `umami-local`; frontend and API bind only to `127.0.0.1:8083` and `127.0.0.1:3003`. The worker and fixture have no published ports. The worker and fixture network is marked Docker `internal`; the preview network serves the two loopback ports. This does not configure a production reverse proxy or external TLS.

In PowerShell:

```powershell
$env:UMAMI_REVISION = git rev-parse HEAD
docker compose config --quiet
docker compose build
docker compose up --detach --wait --wait-timeout 60
docker compose ps
node tests/container-smoke.mjs
node tests/auth-container-smoke.mjs
```

On a POSIX shell, use `export UMAMI_REVISION=$(git rev-parse HEAD)` before the same Docker and Node commands. The smoke script uses the default ports. `UMAMI_FRONTEND_PORT` and `UMAMI_API_PORT` can change the loopback ports, but rebuilding the frontend is required because Vite embeds its URLs at build time. Avoid using a source branch name as the revision tag. Base images are pinned by digest; package dependencies install from committed locks. Build outputs are identified by the commit SHA tag and can be inspected with `docker image inspect`.

Browse http://127.0.0.1:8083/signin with `preview@calpoly.edu` / `preview-only`. This fixed account and token exist only in the disposable fixture server. `tests/auth-container-smoke.mjs` checks that real API containers reject missing, invalid, and cross-user tokens before privileged operations, and that this fixture account can bookmark and read its own data. Use it to review the protected restaurant and menu UI, but never infer real Auth, RLS, Storage, or durable data behavior from it. The fixture resets on recreation. Real Supabase Auth, database, and Storage remain managed external services in the intended production architecture; this local stack neither copies nor deletes their data. The frontend's production API URL is overridden by `VITE_API_BASE_URL` in this build. With no override, the existing Azure production URL remains the fallback.

`backend/index.js` starts only the API. The separate worker owns a Monday 08:00 restaurant scrape and a Tuesday 08:00 menu scrape, both in `America/Los_Angeles`; overlap is suppressed. `docker compose exec -T worker node -e "fetch('http://127.0.0.1:3004/status').then(r=>r.text()).then(console.log)"` shows scheduler/run state. The health endpoint returns 503 after a failed tracked run and 200 after a successful recovery. Fixture mode restricts destinations to the internal fixture service, including browser navigation, redirects, and subrequests. To exercise a one-shot fixture scrape, run `docker compose run --rm --no-deps worker node worker.js --once=restaurants` or `--once=menus`. Live scraping requires separate explicit configuration and is not part of this local preview.

For logs and recovery:

```powershell
docker compose logs --no-color --tail=100 api worker frontend fixture-supabase
docker compose restart api worker frontend
docker compose up --detach --wait --wait-timeout 60
docker compose down
```

The declared local acceptance deadlines are 60 seconds for healthy startup/recovery after images exist, 10 seconds for an HTTP response, and 10 seconds for stop. Services run nonroot with read-only roots, dropped capabilities, `no-new-privileges`, memory/CPU/PID limits, bounded JSON logs, and dedicated `/tmp` tmpfs where needed. The worker has a 256 MiB shared-memory segment for Chromium, tracks browser instances, closes them on shutdown, and has a 10-second stop grace. Do not use `docker compose down --volumes` as a routine command; this fixture has no durable volume, while any future real persistence must be backed up and restored separately. A database backup does not contain Supabase Storage object bytes. Production backup, restore, and deployment target remain unconfigured for this PR.

CI jobs `checks` and `container-smoke` run on PRs and `main` without production secrets or deployment permissions. The existing Azure deployment workflows still run on `main` after an approved merge. The provider-backed Cypress workflow is manual and requires a separately provisioned `isolated-supabase-test` environment; absent those credentials, its gate remains blocked.
