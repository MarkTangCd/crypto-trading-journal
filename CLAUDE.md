# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start dev server (Express + Vite HMR) on port 3000

# Build & Production
npm run build        # Vite build + esbuild server bundle → dist/
npm run start        # Run production build

# Type checking & formatting
npm run check        # TypeScript type check (tsc --noEmit)
npm run format       # Prettier format all files

# Tests
npm run test         # Run all tests (vitest)
npx vitest run server/tradingSystem.test.ts  # Run a single test file

# Database
npm run db:push      # Generate + apply migrations (drizzle-kit generate && drizzle-kit migrate)
```

## Architecture

**Stack**: React 19 + Vite (client), Express + tRPC (server), MySQL + Drizzle ORM (database), TypeScript throughout.

**Monorepo layout** (single `package.json`):
- `client/src/` — React frontend; `@/*` path alias maps here
- `server/` — Express backend; `server/_core/index.ts` is the entry point
- `shared/` — Types and constants shared between client and server; `@shared/*` alias
- `drizzle/schema.ts` — Database schema (source of truth for all tables)

**Request flow**: Browser → Express → tRPC router (`server/routers.ts`) → DB functions (`server/db.ts`) → MySQL

**tRPC end-to-end types**: The client (`client/src/lib/trpc.ts`) imports the router type from the server, giving full type safety across the stack. All API calls go through `trpc.<procedure>` — there are no REST endpoints.

**Authentication**: External OAuth server. Sessions stored in a cookie (`app_session_id`, JWT). The tRPC context (`server/_core/context.ts`) extracts the user from the cookie on every request. Protected procedures call `requireUser()`.

**Database layer** (`server/db.ts`): All queries are plain functions (not a class/repository). All are filtered by `userId` — users only see their own data. Key auto-calculations happen here:
- `getCurrentBalance()` — initialBalance + sum of all `returnAmount`s
- `getConsecutiveLosses()` — count of consecutive losses from most recent trades
- `calculateConfidenceLevel()` — average confidence of selected trading elements

**Frontend routing**: Uses `wouter` (not React Router). Routes are defined in `client/src/App.tsx`.

**UI components**: shadcn/ui ("new-york" style) in `client/src/components/ui/`. Add new components with the shadcn CLI or by copying into that directory.

**Charts**: Recharts for dashboard statistics visualizations.

## Database Schema

Six tables: `users`, `trading_elements`, `trading_systems`, `trading_system_elements` (junction), `transactions`, `transaction_elements` (junction).

Key `transactions` fields: `accountBalance` (balance at time of trade), `direction` (long|short), `outcome` (win|loss|breakeven), `consecutiveLosses`, `riskRewardRatio`, `returnAmount`, `confidenceLevel`, `tvUrl` (TradingView link), `reviewFeedback`, `reviewChartUrl`, `isReviewed`.

Time fields (`startTime`, `endTime`) are stored as milliseconds (bigint).

## Environment Variables

```
DATABASE_URL          # MySQL connection string
JWT_SECRET            # Cookie signing secret
VITE_APP_ID           # OAuth app ID
OAUTH_SERVER_URL      # OAuth server URL (server-side)
VITE_OAUTH_PORTAL_URL # OAuth portal URL (client-side)
OWNER_OPEN_ID         # Admin user's open ID
PORT                  # Server port (default 3000)
```
