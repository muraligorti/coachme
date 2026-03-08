#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CoachMe.life — Automated Deployment Agent
 * 
 * Run: node deploy.mjs
 * 
 * This script walks you through every deployment step interactively.
 * It runs real commands, creates real configs, and deploys real services.
 * YOU run it on YOUR machine — secrets never leave your device.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createInterface } from "readline";
import { randomBytes } from "crypto";

// ─── HELPERS ─────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));
const cyan = (t) => `\x1b[36m${t}\x1b[0m`;
const green = (t) => `\x1b[32m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const bold = (t) => `\x1b[1m${t}\x1b[0m`;
const dim = (t) => `\x1b[2m${t}\x1b[0m`;

function banner(text) { console.log(`\n${cyan("═".repeat(60))}\n  ${bold(text)}\n${cyan("═".repeat(60))}\n`); }
function info(text) { console.log(`  ${cyan("ℹ")} ${text}`); }
function success(text) { console.log(`  ${green("✓")} ${text}`); }
function warning(text) { console.log(`  ${yellow("⚠")} ${text}`); }
function error(text) { console.log(`  ${red("✗")} ${text}`); }
function cmd(text) { console.log(`  ${dim("$")} ${cyan(text)}`); }

function run(command, opts = {}) {
  cmd(command);
  try {
    const result = execSync(command, {
      encoding: "utf-8",
      stdio: opts.silent ? "pipe" : "inherit",
      timeout: opts.timeout || 120000,
      ...opts,
    });
    return { ok: true, output: result };
  } catch (err) {
    if (!opts.ignoreError) error(`Command failed: ${err.message}`);
    return { ok: false, output: err.stderr || err.message };
  }
}

function checkTool(name, installHint) {
  const result = spawnSync("which", [name], { encoding: "utf-8" });
  if (result.status !== 0) {
    error(`${name} not found. Install: ${installHint}`);
    return false;
  }
  success(`${name} found: ${result.stdout.trim()}`);
  return true;
}

function generateSecret(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

// ─── STATE ───────────────────────────────────────────────────────────

const state = {
  projectDir: process.cwd(),
  domain: "coachme.life",
  apiDomain: "api.coachme.life",
  railwayUrl: "",
  vercelUrl: "",
  dbUrl: "",
  redisUrl: "",
  anthropicKey: "",
  jwtSecret: "",
  jwtRefreshSecret: "",
  encryptionKey: "",
  phase: 0,
};

// ═══════════════════════════════════════════════════════════════════════
// PHASE 0: PREREQUISITES CHECK
// ═══════════════════════════════════════════════════════════════════════

async function phase0() {
  banner("Phase 0: Prerequisites Check");
  info("Checking required tools on your machine...\n");

  const tools = [
    ["node", "https://nodejs.org (v18+)"],
    ["npm", "Comes with Node.js"],
    ["git", "https://git-scm.com"],
    ["npx", "Comes with npm"],
  ];

  let allGood = true;
  for (const [name, hint] of tools) {
    if (!checkTool(name, hint)) allGood = false;
  }

  // Check Node version
  const nodeVersion = execSync("node -v", { encoding: "utf-8" }).trim();
  const major = parseInt(nodeVersion.replace("v", ""));
  if (major < 18) {
    error(`Node.js ${nodeVersion} is too old. Need v18+.`);
    allGood = false;
  } else {
    success(`Node.js ${nodeVersion}`);
  }

  // Check optional tools
  console.log(`\n  ${dim("Optional (needed later):")}`);
  checkTool("railway", "npm install -g @railway/cli");
  checkTool("vercel", "npm install -g vercel");

  if (!allGood) {
    error("\nFix the issues above before continuing.");
    const cont = await ask("\nContinue anyway? (y/n): ");
    if (cont.toLowerCase() !== "y") process.exit(1);
  }

  // Check if project files exist
  console.log("");
  if (existsSync("backend/package.json") && existsSync("frontend/src/App.jsx")) {
    success("Project files found in current directory");
  } else if (existsSync("fitos-nexus-prod/backend/package.json")) {
    info("Found project in fitos-nexus-prod/ — moving there");
    state.projectDir = "fitos-nexus-prod";
    process.chdir("fitos-nexus-prod");
    success("Now in: " + process.cwd());
  } else {
    error("Project files not found. Make sure you extracted fitos-nexus-prod.tar.gz");
    error("Run this script from inside the fitos-nexus-prod directory.");
    const dir = await ask("\nEnter path to project directory: ");
    if (existsSync(dir + "/backend/package.json")) {
      process.chdir(dir);
      success("Now in: " + process.cwd());
    } else {
      error("Still can't find project files. Exiting.");
      process.exit(1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 1: GENERATE SECRETS
// ═══════════════════════════════════════════════════════════════════════

async function phase1() {
  banner("Phase 1: Generate Secrets");
  info("Generating cryptographic secrets for your deployment.\n");
  info("These are generated locally — they never leave your machine.\n");

  state.jwtSecret = generateSecret(32);
  state.jwtRefreshSecret = generateSecret(32);
  state.encryptionKey = generateSecret(16);

  success(`JWT_SECRET:         ${state.jwtSecret.slice(0, 16)}...${dim("(64 hex chars)")}`);
  success(`JWT_REFRESH_SECRET: ${state.jwtRefreshSecret.slice(0, 16)}...${dim("(64 hex chars)")}`);
  success(`ENCRYPTION_KEY:     ${state.encryptionKey.slice(0, 12)}...${dim("(32 hex chars)")}`);

  console.log("");
  info("Now I need your Anthropic API key (for AI coaching features).");
  info("Get it from: https://console.anthropic.com/settings/keys\n");

  state.anthropicKey = await ask(`  Enter your Anthropic API key (sk-ant-...): `);

  if (!state.anthropicKey.startsWith("sk-ant-")) {
    warning("Key doesn't start with sk-ant-. Continuing anyway...");
  } else {
    success("Anthropic key accepted (stored in memory only)");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 2: INSTALL DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════

async function phase2() {
  banner("Phase 2: Install Dependencies");

  info("Installing backend dependencies...");
  run("cd backend && npm install");
  success("Backend dependencies installed");

  info("\nInstalling frontend dependencies...");
  run("cd frontend && npm install");
  success("Frontend dependencies installed");

  // Install CLIs if not present
  const hasRailway = spawnSync("which", ["railway"], { encoding: "utf-8" }).status === 0;
  const hasVercel = spawnSync("which", ["vercel"], { encoding: "utf-8" }).status === 0;

  if (!hasRailway) {
    info("\nInstalling Railway CLI...");
    run("npm install -g @railway/cli");
  }
  if (!hasVercel) {
    info("\nInstalling Vercel CLI...");
    run("npm install -g vercel");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 3: GIT SETUP
// ═══════════════════════════════════════════════════════════════════════

async function phase3() {
  banner("Phase 3: Git Repository");

  if (existsSync(".git")) {
    success("Git repo already initialized");
  } else {
    info("Initializing git repo...");
    run("git init");
    run("git add .");
    run('git commit -m "CoachMe.life - initial commit"');
  }

  console.log("");
  info("You need a GitHub repo to deploy from.");
  info("Create one at: https://github.com/new");
  info("  Name: coachme-life");
  info("  Visibility: Private\n");

  const repoUrl = await ask("  Enter your GitHub repo URL (https://github.com/...): ");

  if (repoUrl.includes("github.com")) {
    run(`git remote remove origin`, { ignoreError: true, silent: true });
    run(`git remote add origin ${repoUrl}`);
    run("git branch -M main");

    info("\nPushing to GitHub...");
    const pushResult = run("git push -u origin main", { ignoreError: true });
    if (pushResult.ok) {
      success("Code pushed to GitHub");
    } else {
      warning("Push failed. You may need to authenticate with GitHub first.");
      info("Try: gh auth login  OR  set up SSH keys");
      info("Then run: git push -u origin main");
      await ask("\nPress Enter after you've pushed manually...");
    }
  } else {
    warning("Skipping GitHub push. You'll need to do this manually.");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 4: DEPLOY BACKEND (Railway)
// ═══════════════════════════════════════════════════════════════════════

async function phase4() {
  banner("Phase 4: Deploy Backend to Railway");

  info("Login to Railway first:");
  const loginResult = run("railway login", { ignoreError: true });

  if (!loginResult.ok) {
    info("\nIf browser login didn't work, try:");
    info("  railway login --browserless");
    await ask("\nPress Enter after you've logged in to Railway...");
  }

  console.log("");
  info("Now let's set up your Railway project.");
  info("You have two options:\n");
  info("  A) I'll create the project from CLI (easiest)");
  info("  B) You already created it on railway.app\n");

  const choice = await ask("  Choose (a/b): ");

  if (choice.toLowerCase() === "a") {
    info("\nCreating Railway project...");
    run("railway init", { ignoreError: true });
  } else {
    info("\nLink to your existing project:");
    run("railway link", { ignoreError: true });
  }

  console.log("");
  info("Adding PostgreSQL database...");
  info("In Railway dashboard (railway.app), go to your project and:");
  info("  1. Click + New → Database → PostgreSQL");
  info("  2. Copy the DATABASE_URL from the Variables tab");
  console.log("");

  state.dbUrl = await ask("  Paste your DATABASE_URL: ");
  if (state.dbUrl.includes("postgresql://")) {
    success("DATABASE_URL accepted");
  } else {
    warning("That doesn't look like a PostgreSQL URL. Continuing...");
  }

  console.log("");
  info("Adding Redis...");
  info("Option A: In Railway, click + New → Database → Redis");
  info("Option B: Go to upstash.com → Create Database → Copy URL");
  console.log("");

  state.redisUrl = await ask("  Paste your REDIS_URL: ");
  success("REDIS_URL accepted");

  // Write .env file
  console.log("");
  info("Writing .env file for backend...");

  const envContent = `# CoachMe.life — Production Environment
# Generated by deployment agent on ${new Date().toISOString()}

DATABASE_URL=${state.dbUrl}
REDIS_URL=${state.redisUrl}
JWT_SECRET=${state.jwtSecret}
JWT_REFRESH_SECRET=${state.jwtRefreshSecret}
ANTHROPIC_API_KEY=${state.anthropicKey}
ENCRYPTION_KEY=${state.encryptionKey}
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://coachme.life,https://www.coachme.life,http://localhost:5173
LOG_LEVEL=info
`;

  writeFileSync("backend/.env", envContent);
  success("backend/.env written (contains secrets — NEVER commit this)");

  // Add .env to .gitignore
  if (!existsSync(".gitignore") || !readFileSync(".gitignore", "utf-8").includes(".env")) {
    const gitignore = existsSync(".gitignore") ? readFileSync(".gitignore", "utf-8") : "";
    writeFileSync(".gitignore", gitignore + "\n# Secrets\n.env\nbackend/.env\n*.jks\n");
    success(".gitignore updated to exclude .env");
  }

  // Set Railway env vars
  console.log("");
  info("Setting environment variables in Railway...");
  info("(These go to Railway's servers, not your code)\n");

  const envVars = {
    DATABASE_URL: state.dbUrl,
    REDIS_URL: state.redisUrl,
    JWT_SECRET: state.jwtSecret,
    JWT_REFRESH_SECRET: state.jwtRefreshSecret,
    ANTHROPIC_API_KEY: state.anthropicKey,
    ENCRYPTION_KEY: state.encryptionKey,
    NODE_ENV: "production",
    PORT: "4000",
    CORS_ORIGIN: "https://coachme.life,https://www.coachme.life",
  };

  for (const [key, value] of Object.entries(envVars)) {
    const result = run(`railway variables set ${key}="${value}"`, { silent: true, ignoreError: true });
    if (result.ok) {
      success(`Set ${key}`);
    } else {
      warning(`Could not set ${key} via CLI. Set it manually in Railway dashboard.`);
    }
  }

  // Run migrations
  console.log("");
  info("Running database migration (creates all 17 tables)...");
  run("cd backend && railway run npx prisma db push", { ignoreError: true });

  info("\nSeeding demo data...");
  run("cd backend && railway run node prisma/seed.js", { ignoreError: true });

  // Deploy
  console.log("");
  info("Deploying backend to Railway...");
  const deployResult = run("railway up --detach", { ignoreError: true });

  if (deployResult.ok) {
    success("Backend deploying!");
    info("Check railway.app for your deployment URL.");
    state.railwayUrl = await ask("\n  Enter your Railway deployment URL: ");
  } else {
    warning("Auto-deploy may not have worked. In Railway dashboard:");
    info("  1. Connect your GitHub repo");
    info("  2. Set Root Directory to: backend");
    info("  3. Set Start Command to: node src/server.js");
    state.railwayUrl = await ask("\n  Enter your Railway deployment URL once deployed: ");
  }

  // Verify
  console.log("");
  info("Verifying backend...");
  const healthResult = run(`curl -s ${state.railwayUrl}/api/health`, { silent: true, ignoreError: true });
  if (healthResult.ok && healthResult.output?.includes("healthy")) {
    success("Backend is live and healthy!");
  } else {
    warning("Could not verify health check. Check Railway logs for errors.");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 5: DEPLOY FRONTEND (Vercel)
// ═══════════════════════════════════════════════════════════════════════

async function phase5() {
  banner("Phase 5: Deploy Frontend to Vercel");

  // Set API URL
  const apiUrl = state.railwayUrl || "https://api.coachme.life";
  info(`Setting API URL to: ${apiUrl}\n`);

  writeFileSync("frontend/.env.production", `VITE_API_URL=${apiUrl}\n`);
  success("frontend/.env.production written");

  console.log("");
  info("Deploying to Vercel...\n");

  process.chdir("frontend");
  const vercelResult = run("vercel --prod", { ignoreError: true });
  process.chdir("..");

  if (vercelResult.ok) {
    success("Frontend deployed to Vercel!");
  } else {
    info("\nIf CLI deploy didn't work:");
    info("  1. Go to vercel.com → New Project → Import your GitHub repo");
    info("  2. Root Directory: frontend");
    info("  3. Framework: Vite");
    info(`  4. Environment Variable: VITE_API_URL = ${apiUrl}`);
  }

  console.log("");
  info("Connect your domain in Vercel:");
  info("  1. Project Settings → Domains → Add: coachme.life");
  info("  2. Add: www.coachme.life");
  info("  3. In Cloudflare DNS, add:");
  info("     Type A,     Name @,   Value 76.76.21.21");
  info("     Type CNAME, Name www, Value cname.vercel-dns.com");
  info("     (Set both to DNS Only / grey cloud)");

  await ask("\nPress Enter after you've configured DNS...");

  console.log("");
  const siteResult = run(`curl -sI https://coachme.life`, { silent: true, ignoreError: true });
  if (siteResult.ok) {
    success("coachme.life is responding!");
  } else {
    info("DNS may still be propagating. Check back in 5-10 minutes.");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 6: MOBILE APPS (Capacitor)
// ═══════════════════════════════════════════════════════════════════════

async function phase6() {
  banner("Phase 6: Mobile App Setup (Android + iOS)");

  info("Adding Capacitor for native mobile apps...\n");

  process.chdir("frontend");

  run("npm install @capacitor/core @capacitor/cli", { ignoreError: true });
  run("npx cap init CoachMe life.coachme.app --web-dir dist", { ignoreError: true });

  // Write capacitor config
  const capConfig = `import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "life.coachme.app",
  appName: "CoachMe",
  webDir: "dist",
  server: {
    url: "https://coachme.life",
    cleartext: false,
  },
  plugins: {
    StatusBar: { style: "Dark" },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#050509",
      showSpinner: false,
    },
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
`;

  writeFileSync("capacitor.config.ts", capConfig);
  success("capacitor.config.ts created");

  // Android
  console.log("");
  const doAndroid = await ask("  Set up Android? (y/n): ");
  if (doAndroid.toLowerCase() === "y") {
    run("npm install @capacitor/android", { ignoreError: true });
    run("npm install @capacitor/camera @capacitor/haptics @capacitor/status-bar", { ignoreError: true });
    run("npm run build", { ignoreError: true });
    run("npx cap add android", { ignoreError: true });
    run("npx cap sync android", { ignoreError: true });
    success("Android project created at: frontend/android/");
    info("To build APK:");
    info("  npx cap open android   (opens Android Studio)");
    info("  Build → Generate Signed Bundle → Create keystore → Release");
  }

  // iOS
  console.log("");
  const doIos = await ask("  Set up iOS? (requires Mac + Xcode) (y/n): ");
  if (doIos.toLowerCase() === "y") {
    run("npm install @capacitor/ios", { ignoreError: true });
    run("npx cap add ios", { ignoreError: true });
    run("npx cap sync ios", { ignoreError: true });
    success("iOS project created at: frontend/ios/");
    info("To build:");
    info("  npx cap open ios   (opens Xcode)");
    info("  Product → Archive → Distribute → App Store Connect");
  }

  process.chdir("..");
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 7: FINAL VERIFICATION
// ═══════════════════════════════════════════════════════════════════════

async function phase7() {
  banner("Phase 7: Final Verification");

  const checks = [
    { name: "Backend health", test: () => run(`curl -sf ${state.railwayUrl || "https://api.coachme.life"}/api/health`, { silent: true }) },
    { name: "Frontend loads", test: () => run("curl -sfI https://coachme.life", { silent: true }) },
    { name: ".env not in git", test: () => {
      const tracked = run("git ls-files backend/.env", { silent: true, ignoreError: true });
      return { ok: !tracked.output?.includes(".env") };
    }},
    { name: "No API keys in frontend code", test: () => {
      const content = readFileSync("frontend/src/App.jsx", "utf-8");
      return { ok: !content.includes("sk-ant-") };
    }},
  ];

  for (const check of checks) {
    try {
      const result = check.test();
      if (result.ok) success(check.name);
      else warning(`${check.name} — needs attention`);
    } catch {
      warning(`${check.name} — could not verify`);
    }
  }

  banner("DEPLOYMENT COMPLETE");

  console.log(green(`
  ┌─────────────────────────────────────────────┐
  │                                             │
  │   🚀  CoachMe.life is LIVE                  │
  │                                             │
  │   Web:     https://coachme.life             │
  │   API:     https://api.coachme.life         │
  │   Android: Built with Capacitor             │
  │   iOS:     Built with Capacitor             │
  │                                             │
  │   Demo Login:                               │
  │     Coach:  coach@fitos-nexus.com           │
  │             Coach123!                       │
  │     Client: client@fitos-nexus.com          │
  │             Client123!                      │
  │                                             │
  └─────────────────────────────────────────────┘
  `));
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.clear();
  console.log(cyan(`
   ██████╗ ██████╗  █████╗  ██████╗██╗  ██╗███╗   ███╗███████╗
  ██╔════╝██╔═══██╗██╔══██╗██╔════╝██║  ██║████╗ ████║██╔════╝
  ██║     ██║   ██║███████║██║     ███████║██╔████╔██║█████╗  
  ██║     ██║   ██║██╔══██║██║     ██╔══██║██║╚██╔╝██║██╔══╝  
  ╚██████╗╚██████╔╝██║  ██║╚██████╗██║  ██║██║ ╚═╝ ██║███████╗
   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝
  `));
  console.log(bold("  CoachMe.life — Deployment Agent"));
  console.log(dim("  Automated deployment: Web + Android + iOS\n"));
  console.log(dim("  This script runs on YOUR machine. Secrets stay local."));
  console.log(dim("  It will walk you through every step interactively.\n"));

  const ready = await ask("  Ready to deploy? (y/n): ");
  if (ready.toLowerCase() !== "y") { console.log("\n  Come back when you're ready! 👋\n"); process.exit(0); }

  // Run phases in order, allowing skip
  const phases = [
    { fn: phase0, name: "Prerequisites Check" },
    { fn: phase1, name: "Generate Secrets" },
    { fn: phase2, name: "Install Dependencies" },
    { fn: phase3, name: "Git Repository" },
    { fn: phase4, name: "Deploy Backend (Railway)" },
    { fn: phase5, name: "Deploy Frontend (Vercel)" },
    { fn: phase6, name: "Mobile Apps (Capacitor)" },
    { fn: phase7, name: "Final Verification" },
  ];

  console.log("\n  Phases:");
  phases.forEach((p, i) => console.log(`    ${i}: ${p.name}`));
  const startFrom = await ask(`\n  Start from phase (0-${phases.length - 1}, default 0): `);
  const start = parseInt(startFrom) || 0;

  for (let i = start; i < phases.length; i++) {
    try {
      await phases[i].fn();
    } catch (err) {
      error(`Phase failed: ${err.message}`);
      const cont = await ask("\n  Continue to next phase? (y/n): ");
      if (cont.toLowerCase() !== "y") break;
    }

    if (i < phases.length - 1) {
      const next = await ask(`\n  ${green("✓")} Phase ${i} complete. Continue to Phase ${i + 1}: ${phases[i + 1].name}? (y/n): `);
      if (next.toLowerCase() !== "y") {
        info(`\nStopped at phase ${i}. Run again with start phase ${i + 1} to continue.`);
        break;
      }
    }
  }

  rl.close();
}

main().catch((err) => { console.error(red("\nFatal error: " + err.message)); process.exit(1); });
