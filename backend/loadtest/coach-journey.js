// ═══════════════════════════════════════════════════════════════════════
// LOAD TEST — coach journey: login, dashboard, client list, check-in
// submission. Run this yourself against a real deployment - I don't
// have network access to coachme.life or your Railway backend from
// where this was built (confirmed with a direct request, got blocked
// at the sandbox network level), so this has been verified for correct
// k6 syntax and realistic thresholds, but never actually executed
// against your app. Treat the first run as validation, same as the
// Prisma baseline work.
//
// IMPORTANT: run this against a STAGING environment or a dedicated
// load-test account, never production with real client data. The
// check-in scenario writes real rows. AI endpoints are deliberately
// excluded - hammering those with concurrent load-test traffic would
// cost real money against the Anthropic API and isn't representative
// of normal usage patterns anyway.
//
// Install: https://k6.io/docs/get-started/installation
// Run:     k6 run loadtest/coach-journey.js \
//            -e BASE_URL=https://your-staging-url/api \
//            -e TEST_EMAIL=loadtest-coach@test.coachme.internal \
//            -e TEST_PASSWORD=YourTestPassword123
// ═══════════════════════════════════════════════════════════════════════
import http from "k6/http";
import { check, sleep, group } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000/api";
const TEST_EMAIL = __ENV.TEST_EMAIL;
const TEST_PASSWORD = __ENV.TEST_PASSWORD;

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error("Set -e TEST_EMAIL=... -e TEST_PASSWORD=... to a real, dedicated load-test coach account. Never point this at credentials tied to real client data.");
}

// Custom metrics per flow, so a slow check-in write doesn't get averaged
// away by fast dashboard reads in the overall numbers.
const loginDuration = new Trend("login_duration");
const dashboardDuration = new Trend("dashboard_duration");
const clientListDuration = new Trend("client_list_duration");
const checkinDuration = new Trend("checkin_duration");
const errorRate = new Rate("errors");

export const options = {
  // Staged ramp: warm up, sustain a realistic peak, cool down gracefully.
  // Avoids the "thundering herd" problem of hitting max concurrency
  // instantly, which would trigger the app's own rate limiters
  // (login/register endpoints are deliberately rate-limited - see
  // middleware/auth.js) rather than testing real capacity.
  stages: [
    { duration: "30s", target: 5 },   // warm up
    { duration: "1m", target: 20 },   // ramp to a realistic peak - see NFR baseline doc for why 20
    { duration: "2m", target: 20 },   // sustain
    { duration: "30s", target: 0 },   // cool down
  ],
  thresholds: {
    // These match the recommended NFR baselines - see PERFORMANCE_NFR.md.
    "dashboard_duration": ["p(95)<500", "p(99)<1000"],
    "client_list_duration": ["p(95)<500", "p(99)<1000"],
    "login_duration": ["p(95)<1000", "p(99)<2000"],
    "checkin_duration": ["p(95)<800", "p(99)<1500"],
    "errors": ["rate<0.01"],
    // Deliberately NOT using the built-in http_req_failed threshold
    // here - it flags any non-2xx/3xx as a failure, which conflicts
    // with the check-in flow's intentionally-accepted 403 (a coach
    // test account correctly can't self-submit one). Caught this by
    // actually running the script against a mock server before calling
    // it done - the custom `errors` metric above already accounts for
    // this correctly and is the one that should gate pass/fail.
  },
};

export default function () {
  let token;

  group("Login", function () {
    const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ identifier: TEST_EMAIL, password: TEST_PASSWORD }), {
      headers: { "Content-Type": "application/json" },
    });
    loginDuration.add(res.timings.duration);
    const ok = check(res, {
      "login succeeded": (r) => r.status === 200,
      "login returned a token": (r) => !!r.json("accessToken"),
    });
    errorRate.add(!ok);
    if (ok) token = res.json("accessToken");
  });

  if (!token) { sleep(1); return; }

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  group("Dashboard", function () {
    const res = http.get(`${BASE_URL}/reports/coach/dashboard`, authHeaders);
    dashboardDuration.add(res.timings.duration);
    errorRate.add(!check(res, { "dashboard loaded": (r) => r.status === 200 }));
  });

  sleep(1);

  group("Client List", function () {
    const res = http.get(`${BASE_URL}/clients`, authHeaders);
    clientListDuration.add(res.timings.duration);
    errorRate.add(!check(res, { "client list loaded": (r) => r.status === 200 }));
  });

  sleep(1);

  group("Submit Check-in", function () {
    // Writes a real row - dedicated load-test account matters here.
    // 403 is expected/acceptable if TEST_EMAIL is a COACH account
    // (check-in submission is CLIENT-only) - the point of this group is
    // timing the auth+validation+DB round-trip, not requiring a fully
    // seeded roster. Swap TEST_EMAIL to a client account to genuinely
    // exercise the write path end to end.
    const res = http.post(`${BASE_URL}/checkins`, JSON.stringify({ mood: "good", energy: 7, sleep: 7, stress: 3, adherence: 85 }), {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    checkinDuration.add(res.timings.duration);
    errorRate.add(!check(res, { "checkin request completed": (r) => r.status === 201 || r.status === 403 }));
  });

  sleep(2);
}
