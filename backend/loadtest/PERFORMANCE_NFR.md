# CoachMe.life — Performance & Reliability Baselines (NFRs)

## What this document is, and isn't

These are **recommended starting targets**, reasoned from industry norms for a CRUD-style SaaS API and the specific, known characteristics of this app's current infrastructure (Railway, single instance, Node/Express, Postgres, no automated monitoring yet). They are **not measured facts** — I have no network access to your live deployment from where this was built, and no historical performance data to draw from. Treat these as the numbers to test against and tune, not guarantees.

The `loadtest/coach-journey.js` script has actually been executed - not just written - against a local mock server matching this app's real API response shapes (3 VUs, 5s smoke run). All 5 checks passed (30/30), and every custom-metric threshold passed, including confirming that the check-in flow's intentional 403 (a coach test account correctly can't self-submit a check-in) doesn't trip the `errors` threshold while k6's built-in `http_req_failed` metric does flag it - exactly the reasoning documented in the script's comments, now confirmed in practice rather than just asserted. It has never been run against your actual deployment.

---

## 1. Concurrency

**Target: comfortably handle 20-30 concurrent active users; degrade gracefully, not catastrophically, up to ~75.**

Reasoning: this is an early-stage product — realistically dozens to low hundreds of registered coaches at this stage, each with a handful to a few dozen clients. Concurrent *active* users at any given moment (the number that actually matters for load) is typically 5-15% of total registered users in SaaS usage patterns, and heavily clustered around specific hours (morning/evening workout times, given the product). A single Railway container (the default deployment shape here, unless explicitly scaled) has finite CPU/memory - this target is sized to that reality, not an assumption of significant horizontal scaling already in place.

**What would change this number:** moving to multiple Railway replicas behind a load balancer, or a larger instance size, would raise this ceiling directly. Worth revisiting once real usage data exists to justify the cost.

## 2. Latency

| Operation type | p95 target | p99 target | Why |
|---|---|---|---|
| Reads (dashboard, client list, schedule) | < 500ms | < 1000ms | Standard CRUD API expectation - anything slower reads as "laggy" to a user |
| Writes (check-in, booking, invoice creation) | < 800ms | < 1500ms | A real DB write plus validation costs more than a read; still should feel immediate |
| Login | < 1000ms | < 2000ms | Deliberately more generous - bcrypt password hashing is *intentionally* slow (a security property, not a performance bug) |
| AI endpoints (AI Coach, Meal Planner) | < 8s | < 15s | LLM inference is inherently slower than CRUD; excluded from the load test entirely for this reason, and because concurrent load-test traffic against these would cost real money against the Anthropic API |

## 3. Reliability

**Target: < 1% error rate under normal load; < 5% error rate at 2x expected peak (graceful degradation, not collapse).**

Reasoning: 1% is a common, achievable target for a maturing product without heavy infrastructure investment yet - tightening toward 0.1% is a reasonable next milestone once there's real monitoring in place to actually verify it (see the honest gap below).

**The real gap, stated plainly:** there's currently no error-tracking or alerting system in this app (flagged in an earlier conversation about production readiness). A reliability *target* without a way to *measure* whether you're hitting it is aspirational, not actionable. Setting up even lightweight error tracking (Sentry or similar) would do more for actual reliability than any specific number in this table - worth treating as a prerequisite, not a parallel task.

## 4. Availability

**Honest target given current infrastructure: ~99% (roughly 7 hours of downtime/month budget) - not 99.9%, and here's why that distinction matters.**

A single, non-redundant Railway instance has a hard ceiling on achievable availability regardless of code quality: every deploy causes a brief restart (downtime, unless a zero-downtime deploy strategy is configured), and there's no failover if the instance crashes or the underlying host has an issue. "99.9% uptime" (about 43 minutes/month) is a real, common SaaS marketing number, but it's **not honestly achievable** on this architecture without changes - claiming it would be inaccurate, not just optimistic.

| Tier | Uptime | Downtime budget/month | What it requires |
|---|---|---|---|
| **Realistic now** | ~99% | ~7 hours | Current single-instance setup, careful deploy timing |
| **Achievable with moderate investment** | ~99.5% | ~3.5 hours | Health checks + auto-restart, zero-downtime deploys |
| **"Production SaaS standard"** | ~99.9% | ~43 minutes | Multiple replicas, load balancing, likely multi-region - a real infrastructure investment, not a code change |

Recommendation: don't advertise or commit to an availability number you can't currently back up. Target the "realistic now" tier honestly, and treat the next tier as a concrete infrastructure project once usage justifies the cost.

---

## Running the load test

```bash
# Install k6: https://k6.io/docs/get-started/installation
k6 run loadtest/coach-journey.js \
  -e BASE_URL=https://your-staging-url/api \
  -e TEST_EMAIL=loadtest-coach@test.coachme.internal \
  -e TEST_PASSWORD=YourTestPassword123
```

**Before running against anything real:**
- Use a staging environment or a dedicated test account - the check-in flow writes real rows.
- Never point this at production with real client data without a specific reason and a way to clean up afterward.
- Start with the default staged ramp (5 -> 20 -> 20 -> 0 VUs over ~4 minutes) before trying anything more aggressive - this is intentionally conservative, matching the concurrency target above, not a stress test to find a breaking point.

## What this specific script does and doesn't cover

**Covers:** login, dashboard load, client list, check-in submission - the core, highest-traffic coach flows.

**Deliberately excludes:** AI endpoints (cost + not representative of steady load), Razorpay/payment flows (real money, shouldn't be load-tested against a live payment gateway), admin/gym-management endpoints (lower traffic, lower priority for a first pass). Extending this script to cover more flows is straightforward - same pattern, new `group()` blocks - once this first pass has actually run and the baseline numbers above have been checked against reality.
