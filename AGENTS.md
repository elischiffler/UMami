# UMami development workflow

Use Node.js 24 and the committed npm lockfiles. Install with `npm ci`, `npm ci --prefix frontend`, and `npm ci --prefix backend`. Run `npm run format:check`, `npm run lint`, `npm test`, and `npm --prefix frontend run build` before a PR. The local container checks are in `tests/container-smoke.mjs` and `docs/local-docker.md`.

`backend/index.js` owns the API and must not start scraper schedules. `backend/worker.js` owns the schedules; its shared overlap and health state is in `backend/workerState.js`. The `fixtures/` server is disposable, fixture-only infrastructure and is not a real Supabase Auth, database, or Storage implementation. Keep scraper destinations explicitly allowlisted in fixture mode and do not use live service credentials for container tests.

The existing Azure workflows deploy on a user-approved merge to `main`. The local Compose stack is a separate preview; do not enable cloud deployment, use production secrets in PR jobs, or infer that fixture-backed tests prove real Supabase permissions or persistence. Record each gate's evidence and blockers in `docs/validation.md`.
