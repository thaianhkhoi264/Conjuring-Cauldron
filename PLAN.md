# Conjuring Cauldron: Hackathon Plan

AI that **trains, evaluates and schedules** food service employees. The demo restaurant is **Conjuring Cauldron**, a witch-themed fast-casual spot whose customers are witches.

**The pitch:** most tools do training *or* scheduling. Ours is a closed loop. Training produces verified per-station skill scores, and the scheduler staffs shifts from those scores. Call-offs are re-routed by skill and re-checked automatically.

- Team: 2 people, each driving 1 AI coding agent
- Time budget: 24 hours
- Chosen layout: **chapters** (Food, Drinks, Customer Service), Aleks-style

---

## 1. Decisions (locked)

| Topic | Decision |
|---|---|
| Scope | Full scope is feasible in 24h with 2 agents. Stretch items are only cut if behind schedule. |
| Training chapters | Food, Drinks, Customer Service. Same chapter layout everywhere. |
| Food/Drinks training | Drag-and-drop build of a recipe. The employee assembles it step by step, and the LLM judges correctness and speed. |
| Customer Service training | Live voice call with a witch customer. The LLM scores the transcript with a fixed rubric. |
| Certification | A station is **certified at mastery >= 0.8**. Only certified stations are schedulable (plus shadow slots, see 5). |
| Retraining | Every 3 days, in 10 to 30 minute sessions. The demo has a **Skip Ahead** button (advance the demo clock by 3 days). |
| Scheduling | Deterministic constraint engine plus an LLM agent that calls tools, explains and adjusts. The LLM never outputs an unvalidated schedule. |
| New-hire coverage | A shift with new or uncertified employees must include a certified "anchor" for each station. The engine balances this using the hour cap, availability and skill spread. |
| Call-offs | Employee calls off, then the AI ranks replacements, the manager approves in one click, and the replacement is notified. If they decline, fall back to the next candidate. |
| Voice | In-browser voice call first. A real phone number is a stretch goal. |

## 2. Stack (defaults, change if you prefer)

- **App:** Next.js (App Router) + TypeScript + Tailwind
- **DB:** SQLite via Drizzle or Prisma (single file, zero setup, seeded)
- **Drag and drop:** `@dnd-kit/core`
- **LLM:** Google Cloud, **Gemini via Vertex AI** (or the Gemini API with an API key if Vertex setup takes too long). Use the `@google/genai` SDK. All scoring uses structured output (`responseMimeType: "application/json"` + `responseSchema`) and function calling for the scheduler agent and chatbot. Wrap calls in one helper, `src/lib/llm.ts` (`generateJson(schema, prompt)` and `runAgent(tools, prompt)`), so Agent A and Agent B share the same client and credentials. Use a fast Gemini Flash-class model for judging and chat, and a stronger Pro-class model for the scheduler agent if latency allows; check the current model IDs in the Google docs.
- **Voice:** Vapi Web SDK (browser call, transcript webhook, can attach a phone number later), with **Gemini configured as Vapi's LLM** so everything stays on Google. Alternative if Vapi is a problem: Gemini Live API directly in the browser (more custom work). Agent A makes this call in hour 1-2.
- **Scheduling engine:** plain TypeScript, greedy + local search (no external solver)
- **Auth:** fake login. Pick a seeded user from a dropdown, with a role (`employee` or `manager`). No real auth needed.
- **Notifications:** in-app inbox only (mock SMS to replacement shown in a toast)

## 3. Two-agent split

Agents work in parallel against a **shared contract**: the DB schema and API shapes in section 4. **Agent A creates the schema and seed file in the first hour** and pushes it. Agent B pulls and builds against it. Use separate directories to avoid merge conflicts. Commit small and often to `main`, rebasing before each push.

### Agent A: Call Logic and Customer Service Chapter
Owns everything about the voice call.
- `src/voice/` and `src/app/api/voice/*`
- Witch customer persona(s) and complaint scenarios (section 7)
- Vapi assistant configuration (system prompt, voice, first message, end-of-call behavior)
- Call session lifecycle: create the session, start the browser call, receive the transcript webhook, store the transcript
- **CS evaluator:** transcript to rubric scores as structured JSON, then update `mastery` for station `cs`
- Customer Service chapter UI (call screen with live transcript, post-call feedback card)
- Stretch: attach a real phone number to the same assistant
- **Fallback asset:** record a sample call and its transcript for the demo if the live call fails

### Agent B: Everything Else
*(This plan is maintained from Agent B's side. Agent B also owns the shared `src/lib/llm.ts` Gemini helper, set up in hour 0-1.)*

- DB schema, migrations and **seed data** (section 7). *Hour 1 priority.*
- Login and role switching, employee and manager shells
- Food and Drinks chapters (drag-and-drop UI plus LLM judge)
- Mastery and certification logic, the evaluation report ("strengths / weaknesses / needs work / can work now")
- Demo clock and Skip Ahead, decay and retest triggers
- Scheduling engine, scheduler agent, manager schedule UI
- Call-off flow and replacement ranking
- Recipe chatbot on the employee interface
- Landing/login page, polish, demo script rehearsal

### Integration points (A to B)
- A writes to `call_sessions` and updates `mastery` through one shared function: `applyScore(employeeId, station, score, source)`. **B owns this function**, A calls it.
- A exposes `POST /api/voice/session` (returns the Vapi config for the browser) and `POST /api/voice/webhook` (end-of-call transcript).
- B's evaluation report reads `mastery` and `call_sessions`, so it needs no extra wiring.

## 4. Data model (Agent A and B share this)

**Source of truth:** `src/lib/db/schema.ts` (Drizzle) and `src/lib/db/types.ts`, added by Agent A. The sketch below is only a summary; if they differ, the code wins.

```
employees(id, name, role[employee|manager], is_new, hours_cap_weekly, avatar, created_at)
availability(employee_id, day_of_week 0-6, start_time, end_time)
recipes(id, name, station[food|drink], ingredients_json[ordered, with qty], target_seconds, difficulty)
mastery(employee_id, station[food|drink|cs], score 0-1, last_trained_at, attempts)
attempts(id, employee_id, station, recipe_id?, call_session_id?, score, feedback_json, duration_s, created_at)
call_sessions(id, employee_id, scenario_id, transcript_json, rubric_json, score, started_at, ended_at)
shifts(id, date, slot[open|mid|close], required_json {food:n, drink:n, cs:n})
assignments(id, shift_id, employee_id, station, role[anchor|shadow], status[scheduled|called_off|covered])
calloffs(id, assignment_id, reason, status[open|resolved], created_at)
calloff_candidates(id, calloff_id, employee_id, rank, rationale, status[proposed|approved|declined|accepted])
demo_clock(now)  -- single row, advanced by Skip Ahead
messages(id, employee_id, kind, body, read, created_at)
```

## 5. Core logic

### 5.1 Mastery and certification
- `mastery.score` per employee per station, range 0 to 1.
- Update after each attempt: `new = 0.6 * attempt_score + 0.4 * old` (first attempt: `new = attempt_score`).
- **Certified when `score >= 0.8`**.
- **Decay:** each demo-day without training in a station reduces its score by 0.02, to a floor of 0.3. When it falls below 0.8, the station is flagged "needs retest". Skip Ahead 3 days therefore decays scores and pushes retests into the employee's queue.
- Session length is capped at 10 to 30 minutes. Each retest is a short mixed set: 2 recipes, or 1 call.
- **Fast path to the schedule:** the new-hire flow offers a choice of chapter first. The first certified station puts them on the schedule. They continue other chapters afterward.

### 5.2 Food and Drink judge (LLM)
Client sends an ordered **event log** of the drag-and-drop build (item, step index, timestamp, any undo). Flow:
1. Server computes **facts**: missing items, extra items, wrong order, elapsed seconds vs `target_seconds`.
2. LLM receives the recipe plus the facts and the event log, and returns structured JSON:
   `{ accuracy: 0-1, speed: 0-1, score: 0-1, mistakes: [...], coaching: "..." }`.
3. Score weighting: accuracy 0.75, speed 0.25. Clamp to 0..1.
4. Pass facts into the prompt so the LLM judgement is grounded, then `applyScore(...)`.

### 5.3 Customer Service rubric (Agent A)
Each dimension 0 to 5, returned as structured JSON with a one-line justification each:
- `greeting_and_warmth`
- `order_accuracy` (repeated back, correct items)
- `deescalation_and_empathy` (for complaint scenarios)
- `problem_resolution` (offers a fix within company policy)
- `professional_tone` (no rudeness, stays in character as an employee)
- `upsell_or_suggestion` (optional, weighted lowest)

Overall `score = weighted average / 5`. Weights: warmth 0.2, accuracy 0.25, deescalation 0.25, resolution 0.2, tone 0.1, upsell 0.0 (bonus only, adds up to +0.05). Store the rubric JSON so the report can show it. Run the evaluator with temperature 0 and a fixed rubric prompt for consistent scoring. Never regenerate a score once stored.

### 5.4 Evaluation report
Built from `mastery`, recent `attempts` and rubric JSON. An LLM writes a short narrative from this data, but the **numbers come only from the DB**:
- Strengths (stations >= 0.8, best rubric dimensions)
- Weaknesses (lowest dimensions)
- Needs improvement (below 0.8, with next recommended session)
- **Can start working now** (certified stations)

### 5.5 Scheduling engine and agent
**Hard rules (engine enforces, nothing can bypass):**
- Employee must be available in that slot.
- Weekly hours <= `hours_cap_weekly`.
- Shift needs per station met (`required_json`).
- A station can only be assigned as `anchor` if the employee is certified (>= 0.8) there.
- **Anchor rule:** every station on every shift needs at least one certified anchor. Uncertified employees may fill additional slots as `shadow` on top of an anchor (this is how new hires get "carried").

**Soft scoring (greedy + local search):**
- Spread skills: penalise stacking more than one employee with the same single certified specialty on one shift (e.g., three drink-only people).
- Prefer a better skill fit per station.
- Fair hours: minimise variance in hours across employees.
- Pair each shadow with a strong anchor in the same shift.
- Respect the days-since-last-shift preference.

**Scheduler agent (LLM with tools):** `get_availability`, `get_skill_matrix`, `get_open_shifts`, `generate_schedule`, `validate_schedule`, `propose_swap`. It runs the engine, reads the validation result, explains tradeoffs to the manager in plain language, and applies manager requests ("give Mira fewer closes"). Every change it makes goes through `validate_schedule`; invalid proposals are rejected and retried.

### 5.6 Call-off routing
1. Employee taps "Call off" (or tells the chatbot), picking the assignment and a reason.
2. Assignment status becomes `called_off`, and a `calloffs` row opens in the manager inbox.
3. Engine builds candidates: available, under the hours cap (and not creating overtime), **certified in the vacated station**. Ranked by skill score, then fairness of hours, then proximity to the shift.
4. LLM writes a one-line rationale for each of the top 3.
5. Manager clicks **Approve** on the top option. Replacement gets a message (toast) and can accept or decline. A decline auto-advances to the next candidate and re-notifies the manager.
6. If no one qualifies, offer the best shadow-plus-anchor combination and flag the shift as understaffed.

### 5.7 Employee chatbot
Recipe book plus the employee's own schedule go into the prompt (no vector DB, the book is small). Capabilities: recipe questions, "what's my schedule", "call off Thursday" (triggers 5.6 via a tool call that asks for confirmation first).

## 6. Interfaces

### Employee interface
- Login chooses a seeded user. The `is_new` flag decides the first screen.
- **New hire:** onboarding with the three chapters. Pick any chapter first. Evaluation report appears after each chapter; once any station reaches 0.8 they are marked "Ready to schedule" and appear on the schedule.
- **Returning employee:** dashboard with the schedule, upcoming retests, a mastery summary, and the chatbot.
- Pages: Dashboard, Training (Food / Drinks / Customer Service chapters), Evaluation, My Schedule (with Call Off), Chatbot.

### Manager interface
- Weekly schedule grid (days by slots, with station and anchor/shadow markers).
- "Generate / Regenerate" with a chat box for the scheduler agent.
- Call-off inbox with ranked replacements and an Approve button.
- Team skill matrix (heat map of mastery per employee per station).
- **Demo controls:** Skip Ahead 3 days, and a Reset Demo button that re-runs the seed.

## 7. Seed and generated content (Agent B builds; Agent A owns the persona)

Generate these with a one-off script (`scripts/seed.ts`) that calls the LLM once and writes the result to JSON files checked into the repo. This keeps the demo deterministic and free of live-generation risk.

### Recipe book (12 recipes)
Each recipe has an ordered ingredient list, a `target_seconds`, and a difficulty.

Food (station `food`):
1. **Cauldron Burger:** bottom bun, bat-wing patty, swamp lettuce, toadstool slices, goblin cheese, top bun
2. **Broomstick Fries:** fry basket, potato sticks, fry, salt, spice dust
3. **Eye of Newt Tacos:** tortilla, spiced beans, newt-eye salsa, shredded lettuce, crema
4. **Raven Wrap:** wrap, grilled raven strips, pumpkin spread, greens
5. **Gingerbread Hut Sundae:** cup, vanilla cream, gingerbread crumble, caramel, cherry
6. **Mandrake Mac:** bowl, mandrake pasta, moonlight cheese sauce, crispy breadcrumbs

Drinks (station `drink`):
1. **Love Potion Latte:** cup, espresso, steamed milk, rose syrup, heart foam
2. **Dragon's Breath Cider:** cup, hot apple cider, cinnamon, chili rim, orange peel
3. **Moonwater Fizz:** cup, ice, sparkling water, blueberry syrup, silver sprinkles
4. **Polyjuice Smoothie:** cup, green apple, spinach, banana, ice, blend
5. **Witch's Brew Cold Brew:** cup, ice, cold brew, black cat vanilla, cream swirl
6. **Elixir of Calm Tea:** cup, hot water, chamomile, honey, lemon slice

### Employees (10, with varied skills for a good demo)
| Name | New? | Food | Drink | CS | Notes |
|---|---|---|---|---|---|
| Morgana (manager) | no | - | - | - | manager login |
| Elowen | no | 0.92 | 0.85 | 0.70 | all-rounder, the "carry" |
| Rook | no | 0.88 | 0.40 | 0.55 | food specialist |
| Bram | no | 0.35 | 0.90 | 0.50 | drink specialist |
| Selene | no | 0.30 | 0.86 | 0.45 | drink specialist (tests the "not three drink-only" rule) |
| Tamsin | no | 0.45 | 0.82 | 0.60 | drink specialist |
| Hazel | no | 0.50 | 0.55 | 0.91 | CS specialist |
| Odette | no | 0.84 | 0.80 | 0.82 | strong all-rounder |
| Finch | yes | 0 | 0 | 0 | new hire, live-demo account |
| Wren | yes | 0.60 | 0 | 0 | partially trained new hire |

Each has availability rows (mixed full-week, weekend-only, evenings-only), hours caps of 20 to 40, and 2 to 3 past attempts so reports aren't empty.

### Shifts
Next 7 demo days, 3 slots per day (`open`, `mid`, `close`). Default requirement: 1 food, 1 drink, 1 CS per slot, with 2 per station on weekend `mid`.

### Witch customer persona (Agent A owns)
A detailed system prompt for the voice assistant. It must cover: who the customers are (witches, covens, familiars), how they speak, what the restaurant sells (inject the recipe book), and house policies (refund/redo rules, no-refund on cursed items, comping rules) so the CS rubric has something to check against. Include 4 scenarios, picked at the start of each call:
1. **Routine order:** friendly witch orders a burger and a latte, asks about ingredients.
2. **Wrong order:** her Dragon's Breath Cider came out cold, she is upset.
3. **Allergic coven member:** needs to know whether the Mandrake Mac contains dairy (tests honesty and care).
4. **Impatient broomstick delivery witch:** in a hurry, interrupts, tests composure.

The persona stays in character and ends the call naturally after resolution or after a time cap (3 to 5 minutes).

## 8. Timeline (24 hours)

| Hour | Agent A (Call logic) | Agent B (Everything else) |
|---|---|---|
| 0 - 1 | Create schema, seed loader, push. Repo scaffold. | Google Cloud setup (project, Vertex AI or Gemini API key, `.env`), `src/lib/llm.ts` helper pushed. Pull schema. Auth shell, layouts, routes. |
| 1 - 4 | Vapi setup, persona prompt, browser call working end to end, webhook stores transcript | Seed script (recipes, employees, shifts). Food/Drink drag-and-drop UI. |
| 4 - 8 | CS rubric evaluator, `applyScore` integration, call UI and feedback card | LLM judge, mastery, certification, evaluation report |
| 8 - 12 | Scenarios 2 to 4, polish, record fallback call, test failure modes | Scheduling engine with hard rules and soft scoring, manager grid |
| 12 - 16 | Support B: end-to-end testing of the new-hire flow, bug fixes | Scheduler agent with tools, call-off routing, manager inbox |
| 16 - 19 | Stretch: real phone number. Else employee chatbot | Skip Ahead, decay, retests, chatbot or polish |
| 19 - 22 | Joint: integration, bug bash, seed reset, UI polish | Same |
| 22 - 24 | Demo rehearsal x3, slide, record backup video | Same |

**Cut order if behind schedule:** real phone number, then chatbot, then decay-based retests (keep Skip Ahead as a simple score refresh), then scenarios 3 and 4.

## 9. Demo script (about 5 minutes)

1. **Problem (30s):** training, evaluation and scheduling live in three disconnected tools.
2. **Finch (new hire) logs in:** takes the Drinks chapter, builds a Love Potion Latte by drag-and-drop, and sees the LLM judge's coaching. Score hits 0.8 and a "Ready to schedule" banner appears.
3. **Customer Service call:** Finch takes the angry-witch call live, then sees the rubric scores and the evaluation report (strengths, weaknesses, can work now).
4. **Manager view:** Morgana opens the schedule. Finch appears as a shadow beside Elowen, an anchor. Point out the engine refused to stack drink-only staff on one shift, and ask the scheduler agent "why is Selene only on weekends?".
5. **Call-off:** Elowen calls off a close shift. The manager inbox shows ranked replacements with rationales; one click on Approve, and the replacement is notified.
6. **Skip Ahead 3 days:** skills decay, retests appear, and the schedule adjusts. Close with the loop: train, evaluate, schedule, repeat.

**Fallback plan:** if the live voice call fails, play the recorded call and show its stored transcript scoring live.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Live voice fails (network or venue noise) | Recorded fallback call. Test the mic early. Use a headset. |
| LLM score inconsistency | Fixed rubric, temperature 0, structured JSON, store once, never regenerate. |
| LLM proposes an invalid schedule | All changes pass `validate_schedule`; the engine is the source of truth. |
| Merge conflicts between agents | Separate directories, a shared schema pushed in hour 1, small commits, rebase before pushing. |
| Google Cloud auth/quota problems | Set up credentials in hour 0-1 and smoke-test one call. Keep a Gemini API key as a fallback to Vertex. Never commit keys (`.env` in `.gitignore`). |
| Slow LLM calls in the demo | Precompute and cache seed data. Show loading states. Keep prompts short. |
| Fairness concerns about skill-based scheduling | Hour-fairness term in the scoring, trainees get shadow slots, and the report is transparent about how scores are computed. Mention it in the pitch. |

## 11. Definition of done
- [ ] New hire can complete one chapter, hit 0.8, and appear on the schedule
- [ ] Food/Drink drag-and-drop is scored by the LLM with accuracy and speed
- [ ] Voice call runs in the browser, and the transcript is scored with the rubric
- [ ] Evaluation report shows strengths, weaknesses, needs improvement and can work now
- [ ] Manager sees a valid generated schedule that respects every hard rule
- [ ] Call-off produces ranked replacements and one-click approval, with decline fallback
- [ ] Skip Ahead advances 3 days, decays skills and triggers retests
- [ ] Seed and Reset Demo reproduce the demo state every time
- [ ] Demo rehearsed 3 times, fallback recording ready
