# UMami AWS backend preparation

The Vercel frontend uses `https://umami.elischiffler.dev`. Set its Production `VITE_API_BASE_URL` to `https://api.umami.elischiffler.dev` and redeploy after the API is reachable. The API allows the frontend origin in CORS. The API and scraper worker are separate containers; the worker has no published port.

`compose.aws.yaml` binds the API only to the host loopback address at port 3003. Route `api.umami.elischiffler.dev` through the shared server's HTTPS reverse proxy to `127.0.0.1:3003`, and set that subdomain's DNS to the instance's public address. The reverse proxy and DNS remain unconfigured until the instance exists. Do not publish port 3003 directly to the Internet.

On the instance, create `backend/.env.production` outside version control with restrictive filesystem permissions. It must contain `SUPABASE_URL` and `SUPABASE_SECRET_KEY` for the approved managed Supabase project. The worker also needs outbound access to its scraper sources. Never place these values in the Vercel frontend variables or images. The Compose file enables live scraping, so only start it when those destinations are approved.

Deploy only a merged, checked `main` commit. Set `UMAMI_REVISION` to its full SHA, then run `docker compose -f compose.aws.yaml config --quiet`, `docker compose -f compose.aws.yaml build`, and `docker compose -f compose.aws.yaml up --detach --wait`. Verify `/ready`, a CORS preflight from the frontend origin, the reverse proxy's TLS endpoint, and the worker health before directing the Vercel frontend at this API. Deployments to this Compose project must run serially; retain the prior image tag for rollback. Do not run `down --volumes` as part of deployment.

Restaurants run Monday at 08:00 and menus Tuesday at 08:00, both in `America/Los_Angeles`. The worker health becomes unhealthy after a failed tracked run, so inspect logs and fix the underlying cause. Supabase owns database and object storage persistence; backup and restore of both must be verified separately. A container rollback does not reverse database migrations.

The API container is limited to 256 MiB and the Playwright worker to 1 GiB, plus 256 MiB of shared memory. The instance needs headroom for Docker, the reverse proxy, and any other projects. Do not use the smallest 1 GiB instance for the complete shared stack. This file does not provision AWS, the reverse proxy, DNS, Supabase resources, or production secrets.
