# CoachMe Backend Test Suite

Real integration tests against real routes, a real (dedicated) test database, and real business logic — only Resend (email), Razorpay, and Anthropic (AI) are mocked, since those are third-party services with real costs/side effects.

## Before you run this for the first time

**This suite has not been executed successfully yet.** It was built and verified via careful manual cross-referencing against the actual route/controller/service code, and by installing a real Postgres locally — but the final step (actually running the tests) failed in the sandbox this was built in: Prisma's engine binaries only download from `binaries.prisma.sh`, which wasn't reachable there. That means there's a real chance something needs a small fix on your first run — a slightly-off assertion, a timing issue — and that's normal for a test suite's first real run, not a sign anything is fundamentally wrong. Treat the first run as a debugging pass, not a guaranteed green checkmark.

## Setup

1. **A dedicated test database — never point this at production.** Options:
   - Local Postgres: `createdb coachme_test`
   - A free Railway/Neon/Supabase Postgres instance, used only for tests

2. Set the connection string:
   ```bash
   export TEST_DATABASE_URL="postgresql://user:password@host:5432/coachme_test"
   ```

3. Push the schema to the test database (one-time, or after any schema change) — `db push` is the right tool specifically here, since this is a disposable test database with no real data to protect (see `prisma/BASELINE.md` for why production uses real migrations instead):
   ```bash
   DATABASE_URL="$TEST_DATABASE_URL" npx prisma db push
   ```

4. Install dependencies if you haven't:
   ```bash
   npm install
   ```

## Running

```bash
npm test              # everything, sequentially
npm run test:coach    # just coach.test.js
npm run test:client   # just client.test.js
npm run test:admin    # just admin.test.js
npm run test:perf     # just performance.test.js, with a longer timeout
npm run test:watch    # watch mode while iterating
```

## What's covered

- **coach.test.js** — registration through the real OTP flow, client management, workout templates, coach-submitted check-ins, invoicing + Razorpay payment links (mocked), tier-based feature gating, cross-coach authorization boundaries
- **client.test.js** — registration, username login, self-submitted check-ins, and specifically that a coach's check-in entry shows up automatically on the client's own view
- **admin.test.js** — user management (including live-verifying that a `/admin/config` change actually takes effect for a real account, not just that the write succeeds), tier changes, impersonation restrictions, real account deletion with the active-clients warning, audit log
- **performance.test.js** — response-time budgets on real endpoints, concurrent-request handling, and a concurrency check that check-in upserts don't create duplicate rows

## What this is *not*

- **Not a full load-testing setup.** These are lightweight, in-process concurrency/timing checks that run alongside the functional suite. For real load testing (hundreds/thousands of concurrent users against a deployed instance), use a dedicated tool like k6 or Artillery against a real staging deployment — genuinely different infrastructure than this.
- **Not exhaustive.** This covers the core flows and the highest-risk areas (auth, permissions, money, admin power) — not every single endpoint in the app. Good next additions as the app grows: workout scheduling/booking flows, notification preferences, the leads pipeline.

## Extending this suite

New tests go in `tests/*.test.js`, importing helpers from `tests/setup.js` (`registerAndVerify`, `loginAs`, `authHeader`, `cleanupTestData`, `uniqueEmail`). Keep using real emails ending in `@test.coachme.internal` — `cleanupTestData()` only deletes rows matching that pattern, which is also what keeps this suite safe to point at a shared test database without risking unrelated data.
