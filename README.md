# Conjuring Cauldron

AI that trains, evaluates and schedules employees for food service locations. The demo restaurant is **Conjuring Cauldron**, a witch-themed fast-casual spot.

- **Train:** food and drink chapters (drag-and-drop recipe builds) and a customer service chapter (voice call with a witch customer).
- **Evaluate:** per-station mastery scores; a station is certified at 0.8 or higher.
- **Schedule:** shifts are staffed from certified skills, call-offs are re-routed to the best replacement.

The full design, ownership rules and progress log are in [PLAN.md](PLAN.md). Read sections 12 to 14 before you start work.

## Setup

Requires Node 22 and npm.

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run db:setup             # creates .data/conjuring-cauldron.db and loads the demo data
npm run dev                  # http://localhost:3000
```

Open `/login` and pick a demo account:

| Account | What it shows |
|---|---|
| Morgana | manager view |
| Finch | brand new hire with no training |
| Wren | new hire part way through the Food chapter |
| Elowen, Odette, others | experienced employees with a mix of skills |

### Environment (`.env.local`)

Never commit this file or paste keys into chat, issues or PRs.

| Variable | Needed for |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_FAST_MODEL`, `GEMINI_PRO_MODEL` | all AI scoring, chat and scheduling (or use Vertex AI, see `.env.example`) |
| `SESSION_SECRET` | signing the demo login cookie when the app is reachable by anyone else |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY`, `VAPI_ASSISTANT_ID`, `NEXT_PUBLIC_APP_URL`, `VAPI_WEBHOOK_SECRET` | live voice calls; without them the app uses the recorded fallback call |
| `DATABASE_URL` | optional path to a different SQLite file |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | run, build and serve the app |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:setup` | create tables and load the demo data (first time) |
| `npm run db:seed` | reset all demo data to the seeded state |
| `npm run db:push` | apply schema changes to the local database |
| `npm run db:generate` | generate a migration after editing `src/lib/db/schema.ts` |
| `npm run verify:training`, `verify:scheduler`, `verify:calloffs`, `verify:clock` | feature checks on pure logic or a throwaway database; safe to run any time |
| `npm run verify:llm` | checks your Gemini setup end to end (lists available models if the model ids are not set yet) |
| `npm run verify:voice`, `verify:chatbot` | Agent A's feature checks |

> **Warning:** the `verify:*` scripts on `main` may delete data from your local database. Run them with `DATABASE_URL` pointed at a throwaway file until the voice fixes in PLAN.md section 13 are merged.

## Working on the project

- Never push to `main`. Use a branch (`a/<topic>` or `b/<topic>`), open a PR, and have it reviewed.
- Before opening a PR run `npm run typecheck`, `npm run lint` and `npm run build`.
- Use the demo clock (`currentDemoTime()` in `src/lib/mastery.ts`) for every stored timestamp, not `new Date()`.
- API routes get the signed-in user from `getSessionUser(request)` in `src/lib/session.ts`; never trust an `employeeId` sent by the client.

## Layout

```
src/app/            pages and API routes (Next.js App Router)
src/components/     shared UI
src/lib/db/         Drizzle schema, seed loader and demo seed data
src/lib/            LLM helper, mastery scoring, session, slots, chatbot
src/voice/          voice call logic and customer service evaluation
scripts/            seed and verification scripts
drizzle/            generated migrations
```
