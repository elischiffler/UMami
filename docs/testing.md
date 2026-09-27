# Testing and CI

## Pull requests

`CI Testing` installs from lockfiles, lints, runs the frontend and backend unit
tests, and builds the frontend. `Browser smoke` starts only Vite and runs
`cypress/e2e/smoke.cy.js`. Its Supabase URL and key are inert public placeholders;
the authentication request is stubbed in the browser. These checks require no
GitHub secrets and run for pull requests, including forked pull requests.

Run them locally:

```sh
npm ci
npm ci --prefix frontend
npm ci --prefix backend
npm run lint
npm test
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=public-test-key npm run build --prefix frontend
```

For the browser smoke, start Vite with those same placeholder values and run
`npx cypress run --spec cypress/e2e/smoke.cy.js` in another terminal.

## Full E2E

The `Isolated full E2E` workflow is manual and uses the GitHub environment
`e2e`. It starts both the API and frontend and runs the data-changing API and
UI journeys. It must target a **separate, disposable Supabase project** with the
application schema and a dedicated test account. Never copy the production
Supabase secret key or a production user's credentials into this environment.

Create a GitHub Actions environment named `e2e` in the repository. Set these
environment **variables**:

| Name                           | Value                                                         |
| ------------------------------ | ------------------------------------------------------------- |
| `E2E_SUPABASE_URL`             | URL of the isolated Supabase project                          |
| `E2E_SUPABASE_ANON_KEY`        | Publishable/anon key of that project                          |
| `E2E_RESTAURANT_NAME`          | Name of a seeded restaurant used by the review journey        |
| `E2E_BOOKMARK_RESTAURANT_NAME` | Name of a seeded restaurant used by the bookmark journey      |
| `E2E_FOLLOW_USER_NAME`         | Display name of a seeded user, distinct from the test account |

Set these environment **secrets**:

| Name                      | Value                                                |
| ------------------------- | ---------------------------------------------------- |
| `E2E_SUPABASE_SECRET_KEY` | Secret key of the isolated project, for the API only |
| `E2E_TEST_EMAIL`          | Dedicated confirmed test account email               |
| `E2E_TEST_PASSWORD`       | Password of that test account                        |

Seed the two restaurant names and follow target in the isolated project before
running the workflow. The tests create reviews, upload a photo, and change
follow and bookmark state. They attempt to undo these changes, but a failed
test can leave data or uploaded files behind. Reset or recreate the disposable
project regularly. The current repository has no database migrations or
repeatable seed for the full app schema; the isolated project and its fixtures
must be prepared before full E2E can be considered verified.

After the environment is configured and this workflow has reached `main`, run
**Isolated full E2E** from the Actions tab. GitHub requires a manually
triggered workflow file to exist on the default branch. Before merge, run the
same Cypress specs locally against the isolated project: set the corresponding
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, `TEST_EMAIL`, `TEST_PASSWORD`,
`TEST_RESTAURANT_NAME`, `TEST_BOOKMARK_RESTAURANT_NAME`, and
`TEST_FOLLOW_USER_NAME` environment variables; start `npm run backend:dev` and
`npm run frontend:dev` in separate terminals; then run
`npx cypress run --spec cypress/e2e/api-tests.cy.js,cypress/e2e/ui-tests.cy.js`.
Do not put credentials in tracked files. The PR workflow never references the
`e2e` environment or its secrets.
