# Switching to Real Migrations — One-Time Baseline

## Why this matters

Every schema change in this project so far has used `prisma db push` — direct schema sync, no history, no review step, no safe rollback. Fine for early prototyping; a real risk now that there's real user data behind it (some `db push` operations can drop and recreate a column rather than safely transform it, with no warning).

`prisma migrate` fixes this: every schema change becomes a reviewable SQL file, checked into git, with a real audit trail and a rollback path.

## I could not run this myself

This needs Prisma's schema-engine binary, downloaded from `binaries.prisma.sh` at runtime — not reachable from the sandbox this was prepared in (same block hit earlier building the automated test suite). Every command below is verified against Prisma's own current documentation, but none of it has been executed. Run this yourself, ideally first against a copy of production data, not production directly.

## What "baselining" means here

Your database already has all these tables — from years of `db push`. A normal `prisma migrate dev` would try to *create* them again and fail, because they already exist. Baselining tells Prisma "pretend this migration already ran" — it records the history without touching any actual data.

## Steps

**1. Back up production first.** Non-negotiable before touching migration tooling on a database with real data. However you already do backups (Railway snapshot, `pg_dump`, etc.) — do one now.

**2. Create the migrations folder:**
```bash
cd backend
mkdir -p prisma/migrations/0_init
```

**3. Generate the baseline migration** — this produces a SQL file representing your *current* schema, as if creating it from nothing:
```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql
```

**4. Review the generated file.** Skim `prisma/migrations/0_init/migration.sql` — it should contain `CREATE TABLE` statements for every model in your schema. This is the file that becomes your permanent baseline record, so it's worth actually reading through once.

**5. Mark it as applied, locally first:**
```bash
npx prisma migrate resolve --applied 0_init
```

**6. Mark it as applied on production too** — this is a separate step, easy to miss. Point at your real `DATABASE_URL` (Railway's production one) and run:
```bash
npx prisma migrate resolve --applied 0_init
```
This does **not** run the SQL — it only records "this migration is already satisfied" in a new `_prisma_migrations` tracking table. Confirm with:
```bash
npx prisma migrate status
```
Should say the schema is up to date, with no pending migrations.

**7. Commit the migrations folder to git.** From this point on, `prisma/migrations/` is part of your source history, same as any other code.

## Going forward

- **Local schema changes:** `npm run db:migrate` (interactive, generates a new migration file, applies it to your local/dev database)
- **Deploying to production:** `npm run db:deploy` — applies any pending migration files that haven't run yet. This is what your Railway deploy step should call, not `db push`.
- **`db:push` still exists** — keep it for the automated test suite's disposable test database (see `tests/README.md`), where there's no real data and speed matters more than history. Never use it against production again after this.
