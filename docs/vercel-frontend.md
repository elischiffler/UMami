# UMami frontend on Vercel

The `umami` project in the `eli-schifflers-projects` Vercel team is connected
to `elischiffler/UMami`. Its root directory is `frontend`, framework is Vite,
install command is `npm ci`, build command is `npm run build`, and output
directory is `dist`. `frontend/vercel.json` sends direct browser visits to
nested client routes to `index.html`.

## Environment ownership

- Production has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, copied from
  the existing local frontend configuration. The key is a Supabase publishable
  key intended for browser use. Never put a Supabase secret or service role key
  in a `VITE_` variable.
- Preview uses disabled placeholder Supabase settings. Preview can validate the
  static frontend but cannot validate login or data workflows until a separate
  test Supabase project or branch is available. Do not test writes against the
  live project.
- `VITE_API_BASE_URL` can select the API endpoint for either environment. If it
  is unset in production, the existing Azure API URL remains the fallback.
  Keep that backend running until a replacement has passed functional checks.

## Checks and cutover

Run `npm ci`, `npm run lint`, `npm test -- --watchAll=false`, and `npm run build`
from `frontend`. Verify the Vercel deployment on desktop and mobile, including
direct visits to nested routes. Test login, data reads, uploads, and backend
calls with an isolated test environment before moving production traffic.

Add `umami.elischiffler.dev` to the Vercel project and inspect its required
record. At GoDaddy, add only that subdomain record; keep the Azure site and
unrelated DNS entries intact. After HTTPS and core flows pass on the custom
domain, update public links. If cutover fails, restore the old public link and
remove or change only the `umami` DNS record.

The API, scheduled menu scrapes, Supabase database, Auth, and Storage are
separate services. Moving this frontend does not migrate those workloads.
The retained Azure deployment workflows run only in `Calpoly-Yelp/UMami`,
which owns their deployment credentials; pushes to this personal fork cannot
deploy the old organization's Azure apps.
