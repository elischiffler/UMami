# UMami

## Local container preview

Use Node.js 24 and Docker Desktop with Linux containers. From the repository root, set `UMAMI_REVISION` to the checked-out Git SHA, then run `docker compose build` and `docker compose up --detach --wait --wait-timeout 60`. The production frontend build is served at http://127.0.0.1:8083, the API at http://127.0.0.1:3003. The fixture-only browser account is `preview@calpoly.edu` with password `preview-only`; it cannot access a real Supabase project. The worker and disposable fixture service are internal and have no host ports. See [the local runbook](docs/local-docker.md) for commands, recovery, and limitations.

Check with `npm run format:check`, `npm run lint`, `npm test`, `npm --prefix frontend run build` (with the documented `VITE_*` values), and `node tests/container-smoke.mjs` while Compose is running. [Validation status](docs/validation.md) distinguishes local fixture evidence from checks requiring actual isolated Supabase resources. The Azure production deployment workflows remain in place for approved merges to `main`.

## Project Documents

- [Tech Spec](https://docs.google.com/document/d/1biFBA__u-CT9FaSdJ9TKkr0FtEnpOxAQAJ2IcFMF8Ec/edit?tab=t.0)
- [Presentation](https://docs.google.com/presentation/d/1GdwA16oiCBMre5I_dxVai33FX3x5VDIYP7rzQ17KHrA/edit?slide=id.p1#slide=id.p1)
- [Video Demo](https://youtu.be/DkY0ubg_JFQ)

## Deployment

### Live App

🌐 [UMami](https://umami.elischiffler.dev/)

The frontend is live on Vercel at this domain. The intended AWS API domain is
`api.umami.elischiffler.dev`; its DNS, HTTPS route, and backend deployment are
still pending. Until that cutover, the frontend API configuration may still use
the legacy Azure backend. See [the Vercel frontend runbook](docs/vercel-frontend.md)
and [AWS backend runbook](docs/aws-backend.md).

### CI/CD Status

[![Frontend Check](https://img.shields.io/github/actions/workflow/status/elischiffler/UMami/vercel-frontend-check.yml?style=for-the-badge&label=Frontend+Check&logo=vercel)](https://github.com/elischiffler/UMami/actions/workflows/vercel-frontend-check.yml)

[![CI Testing](https://img.shields.io/github/actions/workflow/status/elischiffler/UMami/ci-testing.yml?style=for-the-badge&label=CI+Testing&logo=github)](https://github.com/elischiffler/UMami/actions/workflows/ci-testing.yml)

## Running Testing:

```console
npm run test
npm run frontend:test
npm run backend:test
```

## Running Test Coverage & Updating README:

```console
npm run test:coverage
node update-coverage.js
```

## Running Prettier:

```console
npm run format
```

## Running Linter

```console
npm run lint
npm run lint:fix
```

## Running Frontend

```console
npm run frontend:dev
```

## Running Backend

```console
npm run backend:dev
```

## Running Frontend+Backend

```console
npm run dev
```

## Formatting + Linting (Using Prettier and ESLint)

### One-time setup

1. Install dependencies from the repo root:
   - `npm install`
   - `npm --prefix frontend install`
   - `npm --prefix backend install`

2. Install VS Code extensions:
   - **ESLint** (dbaeumer.vscode-eslint)
   - **Prettier – Code formatter** (esbenp.prettier-vscode)

3. VS Code will use the repo’s `.vscode/settings.json` to:
   - format on save (Prettier)
   - auto-fix lint issues on save (ESLint)

## Code Coverage

<!-- Screenshot of Terminal Test Coverage -->

![Coverage Screenshot](assets/coverage-screenshot-frontend.png)
![Coverage Screenshot](assets/coverage-screenshot-backend.png)

<!-- COVERAGE-START -->

| Project  | Lines  | Statements | Functions | Branches |
| :------- | :----: | :--------: | :-------: | :------: |
| Frontend | 59.11% |   57.37%   |  52.78%   |  53.8%   |
| Backend  |  100%  |    100%    |   100%    |   100%   |

<!-- COVERAGE-END -->
