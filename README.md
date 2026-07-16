# FIT:OS NEXUS v6 — Production SaaS Platform

## Full-Stack AI Fitness Platform with PostgreSQL, RBAC, and Coach/Client Marketplace

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FIT:OS NEXUS v6                           │
├──────────────┬──────────────────┬───────────────────────────┤
│   Frontend   │   Backend API    │     Data Layer            │
│   React/Vite │   Express.js     │   PostgreSQL + Redis      │
│              │                  │                           │
│ • Coach UI   │ • JWT Auth       │ • 17 tables (Prisma)      │
│ • Client UI  │ • RBAC Middleware│ • Encrypted medical data  │
│ • Admin UI   │ • Rate Limiting  │ • Session management      │
│ • Reports    │ • Input Sanitize │ • Audit logging           │
│ • AI Coach   │ • Audit Logging  │ • Redis cache + sessions  │
│ • Camera     │ • AI Proxy       │ • Full-text search        │
└──────┬───────┴────────┬─────────┴───────────┬───────────────┘
       │                │                     │
       ▼                ▼                     ▼
   Browser         Anthropic API         PostgreSQL 16
   TF.js MoveNet   (via backend proxy)   Redis 7
```

## Quick Start

```bash
# 1. Clone & configure
cp .env.example .env
# Edit .env — change ALL "CHANGE_ME" values!

# 2. Start infrastructure
docker-compose up -d postgres redis

# 3. Backend setup
cd backend
npm install
npx prisma db push      # Create tables
node prisma/seed.js      # Seed demo data
npm run dev              # Start API on :4000

# 4. Frontend setup (new terminal)
cd frontend
npm install
npm run dev              # Start UI on :5173

# 5. Open http://localhost:5173
```

## Demo Accounts (after seeding)

| Role    | Email                     | Password    |
|---------|---------------------------|-------------|
| Admin   | admin@fitos-nexus.com     | Admin123!   |
| Coach   | coach@fitos-nexus.com     | Coach123!   |
| Client  | client@fitos-nexus.com    | Client123!  |

---

## Database Schema (PostgreSQL + Prisma)

### 17 Tables

| Table            | Purpose                                      |
|------------------|----------------------------------------------|
| User             | Auth, email, password hash, role, 2FA         |
| Session          | JWT tokens, refresh rotation, device tracking |
| CoachProfile     | Name, specs, certs, pricing, ratings          |
| ClientProfile    | Demographics, goals, fitness level            |
| ClientCoach      | Many-to-many coach↔client relationships       |
| MedicalData      | AES-256 encrypted conditions/medications      |
| Subscription     | Tier (Free/Starter/Pro/Elite), Stripe IDs     |
| WorkoutPlan      | Coach-created or AI-generated plans           |
| WorkoutSession   | Individual completed workouts with metrics    |
| Booking          | Scheduled sessions with status tracking       |
| Lead             | AI-scored potential clients for coaches        |
| Review           | Client→Coach reviews with ratings             |
| Report           | Generated analytics (weekly/monthly/quarterly)|
| Message          | Coach↔Client messaging                        |
| Notification     | System notifications with read tracking       |
| AuditLog         | Security audit trail for all actions          |

### Key Relationships
- User → CoachProfile (1:1) or ClientProfile (1:1)
- CoachProfile ↔ ClientProfile via ClientCoach (many:many)
- ClientProfile → MedicalData (1:1, encrypted)
- CoachProfile → WorkoutPlan → WorkoutSession
- CoachProfile → Lead (AI-scored)
- All actions → AuditLog

---

## Security Architecture

### Authentication
- **bcrypt** password hashing (cost factor 12)
- **JWT** access tokens (15min) + refresh tokens (7 days)
- Refresh token **rotation** on each use
- Token **blacklisting** via Redis on logout
- **Account lockout** after 5 failed attempts (15 min)
- Session stored in DB with device fingerprint

### RBAC (Role-Based Access Control)

```
ADMIN  → Full platform access, user management, analytics
COACH  → Own clients, plans, leads, bookings, reports
CLIENT → Own profile, workouts, coach search, bookings
```

Every API route uses middleware chain:
```javascript
router.get("/clients",
  authenticate,           // Verify JWT
  authorize("COACH"),     // Check role
  checkClientLimit,       // Check subscription tier
  ownsResource("coach"),  // Verify data ownership
  handler
);
```

### Input Security
- **Zod** schema validation on all inputs
- **XSS sanitization** on all string fields
- **SQL injection** prevented by Prisma parameterized queries
- **Rate limiting**: 100 req/15min global, 5 login/15min, 10 AI/min
- **CSRF** protection via tokens
- **Helmet** security headers (CSP, HSTS, X-Frame-Options)

### Data Encryption
- TLS 1.3 in transit
- Medical data: AES-256-GCM encrypted at application level
- API keys: environment variables only (never in code)
- Passwords: bcrypt with cost factor 12

---

## Package / Feature Gating

### Coach Packages

| Feature              | Starter (Free) | Pro ($49/mo) | Elite ($149/mo) |
|----------------------|:-:|:-:|:-:|
| Max Clients          | 5  | 50  | Unlimited |
| AI Coaching          | ❌ | ✅  | ✅ |
| Lead Scoring         | ❌ | ✅  | ✅ |
| Camera Form Analysis | ❌ | ✅  | ✅ |
| Bulk Client Upload   | ❌ | ✅  | ✅ |
| Advanced Analytics   | ❌ | ✅  | ✅ |
| White-Label App      | ❌ | ❌  | ✅ |
| API Access           | ❌ | ❌  | ✅ |

Enforced at middleware level:
```javascript
router.get("/leads", authenticate, authorize("COACH"), requireFeature("leadScoring"), handler);
```

### Client Packages

| Feature              | Free     | Premium ($19/mo) |
|----------------------|:--------:|:----------------:|
| Coach connections    | 1        | Unlimited        |
| AI form analysis     | ❌       | ✅               |
| Camera tracking      | ❌       | ✅               |
| Advanced progress    | ❌       | ✅               |

---

## API Endpoints

### Auth
| Method | Path               | Auth | Roles    | Description           |
|--------|--------------------|----- |----------|-----------------------|
| POST   | /api/auth/register | No   | —        | Create account        |
| POST   | /api/auth/login    | No   | —        | Login (rate limited)  |
| POST   | /api/auth/logout   | Yes  | Any      | Logout + blacklist    |
| POST   | /api/auth/refresh  | No   | —        | Refresh JWT tokens    |
| GET    | /api/auth/me       | Yes  | Any      | Get current user      |

### Coaches
| Method | Path                  | Auth | Roles        | Description          |
|--------|-----------------------|------|--------------|----------------------|
| GET    | /api/coaches          | No   | —            | Search (cached)      |
| GET    | /api/coaches/:id      | No   | —            | Public profile       |
| PUT    | /api/coaches/profile  | Yes  | Coach        | Update own profile   |

### Clients
| Method | Path                | Auth | Roles        | Description          |
|--------|---------------------|------|--------------|----------------------|
| GET    | /api/clients        | Yes  | Coach, Admin | List own clients     |
| POST   | /api/clients        | Yes  | Coach        | Add client (limit)   |
| POST   | /api/clients/bulk   | Yes  | Coach (Pro+) | Bulk upload CSV      |
| DELETE | /api/clients/:id    | Yes  | Coach, Admin | Remove client link   |

### Reports & Analytics
| Method | Path                        | Auth | Roles        | Feature Gate      |
|--------|-----------------------------|------|--------------|-------------------|
| GET    | /api/reports/coach/dashboard | Yes  | Coach, Admin | —                 |
| GET    | /api/reports/coach/revenue   | Yes  | Coach, Admin | advancedAnalytics |
| GET    | /api/reports/coach/clients   | Yes  | Coach, Admin | —                 |
| GET    | /api/reports/coach/workouts  | Yes  | Coach, Admin | advancedAnalytics |
| GET    | /api/reports/admin/platform  | Yes  | Admin        | —                 |

### AI (Proxied — hides API key)
| Method | Path              | Auth | Rate Limit  | Description        |
|--------|-------------------|------|-------------|--------------------|
| POST   | /api/ai/chat      | Yes  | 10/min      | AI coaching chat   |
| POST   | /api/ai/match     | Yes  | 10/min      | Coach matching     |
| POST   | /api/ai/leads     | Yes  | 10/min      | Lead scoring       |

---

## Reporting Dashboard

### Coach Reports
1. **Dashboard Overview** — clients, bookings, revenue, leads, ratings (all real-time)
2. **Revenue Report** — monthly breakdown, growth %, projected revenue
3. **Client Analytics** — activity scores (active/at-risk/inactive), retention rate
4. **Workout Analytics** — sessions by exercise, form scores, camera usage rate, weekly trends

### Admin Reports
1. **Platform Overview** — total users, coaches, clients, active in 30d
2. **Subscription Distribution** — users per tier
3. **Revenue Totals** — platform-wide completed booking revenue
4. **Audit Logs** — every action tracked with user, IP, timestamp

---

## Deployment Options

### 1. Docker (Recommended)
```bash
docker-compose up -d
# Includes: PostgreSQL 16, Redis 7, Backend, Frontend
```

### 2. Vercel + Supabase
```bash
# Frontend → Vercel
cd frontend && vercel

# Backend → Vercel Serverless or Railway
cd backend && railway up

# Database → Supabase (managed PostgreSQL)
# Redis → Upstash (managed Redis)
```

### 3. Mobile Apps
```bash
# Android + iOS via Capacitor
npm install @capacitor/core @capacitor/cli
npx cap init FitosNexus com.fitos.nexus
npx cap add android
npx cap add ios
npm run build && npx cap sync
npx cap open android  # Opens Android Studio
npx cap open ios      # Opens Xcode

# Or via Expo
npx create-expo-app FitosNexus
eas build --platform android
eas build --platform ios
```

### 4. PWA (Progressive Web App)
Already configured with vite-plugin-pwa. Installable from browser on any device.

---

## File Structure

```
fitos-nexus-prod/
├── docker-compose.yml          # PostgreSQL + Redis + Backend + Frontend
├── .env.example                # Environment variables template
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma       # 17-table PostgreSQL schema
│   │   └── seed.js             # Demo data seeder
│   └── src/
│       ├── server.js           # Express app with security middleware
│       ├── middleware/
│       │   └── auth.js         # JWT, RBAC, feature gates, rate limits, audit
│       └── routes/
│           ├── auth.js         # Register, login, logout, refresh, me
│           ├── coaches.js      # Search, profile, marketplace
│           ├── clients.js      # CRUD, bulk upload, limits
│           ├── workouts.js     # Plans, sessions, logging
│           ├── leads.js        # AI-scored leads
│           ├── bookings.js     # Schedule, confirm, cancel
│           ├── reports.js      # Dashboard, revenue, clients, workouts, admin
│           ├── admin.js        # User management, audit logs
│           └── ai.js           # AI proxy (chat, match, lead scoring)
├── frontend/
│   └── src/App.jsx             # v6 React app (coach/client/admin UI)
└── scripts/
    └── setup.sh                # One-command setup
```
