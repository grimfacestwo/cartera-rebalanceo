<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Commands

```bash
npm run dev        # dev server
npm run lint       # eslint (next/core-web-vitals + typescript)
npm run typecheck  # tsc --noEmit
npm test           # vitest run (no config, picks up lib/*.test.ts)
```

**Verify before committing**: `npm run lint && npm run typecheck && npm test` (matches CI order).

## Repo architecture

- **Next.js 16.3.1 App Router**, React 19, TypeScript strict, Vercel Postgres (`@vercel/postgres`).
- **`proxy.ts` is the middleware** (Next 16 renamed `middleware` → `proxy`). Auth: `SITE_PASSWORD` env var → sha256 stored in cookie `site_auth`. If env var is unset, no auth. Matcher skips `/api`, static, `/login`. API routes do their own auth check via `expectedToken`/`safeEqual` from `@/lib/auth`. `.env*` is gitignored — never commit credentials.
- **Route handlers use async params** (Next 15+/16 convention): `{ params }: { params: Promise<{ slug: string }> }` — must `await params`.
- **Persistence**: tables are created at runtime with `CREATE TABLE IF NOT EXISTS` inside route code. `portfolio_state` (Finanzas) in `app/api/state/route.ts`; `section_state` (key-value: `id` text, `data` jsonb) in `lib/db.ts` via `ensureSectionTable()`. `db/schema.sql` documents the real schema but the route code is the source of truth if they ever diverge again. All UI/app state lives in Postgres — no `localStorage`/`sessionStorage` for app data (`section_state` slug `ui-prefs` holds sidebar/dark-mode prefs).
  - **camelCase columns gotcha**: Postgres folds unquoted identifiers to lowercase, so `fixedExpenses`/`catRules`/`planTargets`/`rowOrder` are actually stored (and returned by an unaliased `SELECT`) as `fixedexpenses`/`catrules`/`plantargets`/`roworder`. `app/api/state/route.ts`'s `SELECT` must alias each one back to camelCase (`planTargets AS "planTargets"`) or `parseState` silently reads `undefined` and resets that field to its default on every load — this exact bug existed undetected for these three fields until 2026-08-29. Any new camelCase field needs the same aliasing.
  - **Optimistic concurrency (`version` column)**: `page.tsx` (Finanzas) and `hogar-manager.tsx` (Hogar) both independently load and autosave the *entire* `portfolio_state` blob — two tabs/pages saving around the same time used to silently clobber each other ("last write wins"), which caused real data loss/corruption in practice (2026-08-30). Every GET now returns a `version` integer; every PUT must send back the `expectedVersion` it last saw (via `lib/persist.ts`'s `putState`) and the row only updates `WHERE version = expectedVersion`, incrementing it by 1. If the versions don't match, the server returns 409 with its current state and the client adopts it instead of overwriting (see the `"conflict"` `SaveStatus` in both pages). Any new page/component that autosaves `/api/state` must go through `putState`, not a raw `fetch`, or it reintroduces the race. A plain integer is used instead of comparing `updated_at` because Postgres `timestamptz` has microsecond precision that gets truncated to milliseconds going through JSON, so a round-tripped timestamp almost never compares equal.
- **Cron emails**: both `app/api/cron/*/route.ts` routes share `isCronAuthed` (`@/lib/auth`) for the `Authorization: Bearer <CRON_SECRET>` check Vercel adds automatically to its own cron requests, and `sendEmail` (`@/lib/email`) for the actual Resend call. Requires three env vars in Vercel (not committed): `CRON_SECRET`, `RESEND_API_KEY`, and `BACKUP_EMAIL_TO`. `BACKUP_EMAIL_FROM` is optional (defaults to Resend's sandbox sender, which only works if `BACKUP_EMAIL_TO` is the Resend account's own verified address — a real domain needs verifying in Resend for other recipients).
  - **Weekly backup** (`vercel.json`, `0 7 * * 1`, Mondays 07:00 UTC): `app/api/cron/backup/route.ts` reads `portfolio_state` and emails the same JSON the "Exportar" button produces.
  - **Disponible negativo** (`vercel.json`, `0 8 * * *`, daily 08:00 UTC): `app/api/cron/disponible-alert/route.ts` computes `computeDisponible` (`@/lib/state`) for the current month and emails once per negative "episode" — tracked via a `disponible-alert` row in `section_state` (`{ alerted: boolean }`, reset back to `false` the next time it checks and finds a non-negative value) so it doesn't repeat every day while it stays negative, but fires again if it dips negative a second time later. This is a second, independent path to the same alert the browser-only `Notification` in `hogar-manager.tsx` already gives when the tab is open.
- **Security headers**: `next.config.ts` sets `poweredByHeader: false` (hides `X-Powered-By: Next.js`) and a `Content-Security-Policy` alongside the existing frame/HSTS/etc. headers. The CSP allows `'unsafe-inline'` for `script-src`/`style-src` (Next App Router injects an inline RSC hydration `<script>` without a nonce, and the app uses `style={{...}}` inline extensively) but locks `connect-src`/`img-src`/`default-src` to `'self'` — safe because no page loads external scripts, fonts, or images (`next/font/google` self-hosts at build time). Verified with `next start` plus a browser console check across Hogar/Finanzas/dark mode/Ajustes for violations before landing this.

## State pattern (`lib/state.ts`)

All persisted state uses **defensive parsers** (`parseState`, `parseExpenses`, `parseBanks`…) that sanitize unknown DB JSON and fall back to defaults — never trust raw DB data. New persisted data must follow this pattern. Values are stored as **strings**, not numbers. Types: `PortfolioState`, `MonthData`, `Expense`, `BankId`.

## Sections

Pages live under `app/(app)/`. Simple sections (`coches`, `lectura`, `planificacion`) are just `export default function X() { return <NoteSection slug="..." /> }`. `NoteSection` (`app/(app)/note-section.tsx`) is a client component that autosaves `{note: string}` JSON to `/api/section/[slug]` with 500ms debounce. Slug regex: `^[a-z0-9-]+$`.

## Tests

- Pure unit tests live in `lib/*.test.ts` — colocated, **use relative imports** (not `@/`), no DB required.
- Component tests live in `app/**/*.test.tsx` (e.g. `page.test.tsx`, `hogar-manager.test.tsx`), using `vitest.config.ts` (jsdom env, `vitest.setup.ts` loads `@testing-library/jest-dom`). They render the real component with `@testing-library/react`, `vi.mock` the component's own `*.module.css` (a `Proxy` returning the prop name, so class names stay readable in `screen.debug()`), and mock `global.fetch` with a single `vi.fn().mockResolvedValue(...)` covering every GET/PUT the component makes — `parseState`/`parseHogarUiPrefs` are defensive enough to tolerate a mismatched shape on the calls that don't care about it (e.g. a `hogar-manager.tsx` test's blanket mock also answers the `/api/section/hogar-ui-prefs` calls).
- Route handlers (`app/api/**/route.ts`) have no tests yet.

## Style

- Dark theme, inline styles + CSS modules.
- UI text and commit messages **in Spanish**.
- `@/*` path alias maps to repo root (tsconfig).
