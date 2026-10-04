# Demo run-of-show (3 minutes)

Conjuring Cauldron closes the loop for a food service team: **train, evaluate, schedule, repeat**. The demo restaurant is a witch-themed cafe.

## Before you present (about 10 minutes)

1. `git pull`, `npm install`. Use **Node 22**.
2. `.env.local` has a working `GEMINI_API_KEY` and model ids (copy `.env.example`). Run `npm run verify:llm`; it should print three PASS lines in under 30 seconds.
3. Fresh data: `npm run db:setup`. Then run the production build: `npm run build` and `npm start` (http://localhost:3000). It is faster and steadier than `npm run dev`.
4. **Two windows, two logins.** The login cookie belongs to one address, so use one for each:
   - Window A at `http://localhost:3000` signed in as **Morgana** (manager).
   - Window B at `http://127.0.0.1:3000` for the employees: **Finch** first, then **Elowen** (sign out and pick the next name from the list, about 5 seconds).
5. **Warm up Gemini:** in window A ask the schedule assistant anything ("Who is on Sunday open?"), and press Generate then **Reset demo** if you want a clean state. The first AI call after a break can be slow.
6. Accounts you will use: Morgana (manager), Finch (brand-new hire), Elowen (experienced), Wren (partly trained). Everyone else is seeded.

## The 3 minutes

| Time | Where | What you do | What you say |
|---|---|---|---|
| 0:00 | Window B, login page | Show the page. | "Restaurants lose staff constantly, and training, evaluation and scheduling live in three separate tools. Conjuring Cauldron connects them." |
| 0:20 | B: sign in as **Finch** | Click **Go to training**, Drinks, **Love Potion Latte**, **I am ready**. Drag **Cup** and **Rose syrup** onto the plate, click **Espresso**, **Steamed milk**, **Heart foam**, then **Serve the drink**. | "Finch is brand new. He learns the recipe, then builds it from memory against the clock. An AI trainer judges accuracy and speed." |
| 0:55 | B: result card, then **View my full evaluation** | Point at **Certified**, then at strengths and **Can start now**. | "80% certifies a station. The evaluation says what he is good at, what to work on, and where he can work right now, all from his real results." |
| 1:20 | A: **Generate schedule** | Click it, point at Finch (Drinks) and Wren's dashed shadow slot. Ask the assistant: **Why is Selene only on weekends?** | "The schedule is built from certified skills, hours and availability, and never breaks the rules. Finch is on it already. Wren is a trainee, so he only shadows a certified teammate. The assistant explains any choice and only proposes changes; the manager approves." |
| 1:55 | B: sign out, sign in as **Elowen** | In the Cauldron assistant type: *I'm sick, I need to call off my first close shift.* Press **Confirm call-off**. | "Elowen calls off in plain language." |
| 2:15 | A: scroll to **Call-off inbox** | Show the ranked replacements and their reasons, click **Approve**. | "The system ranks who can legally cover and why. One click sends the offer." |
| 2:35 | A: **Skip ahead 3 days** | Click it, read the banner, click **Regenerate schedule**. | "Three days later, skills slip, people are asked to retest, and the schedule adjusts. The loop keeps running." |
| 2:55 | A | Stop. | "Train, evaluate, schedule, repeat." |

**If you run long, cut in this order:** the schedule assistant question, then the Skip Ahead regenerate, then the call-off approval. The customer service voice call is **not** in the 3 minutes. If you want it, it takes about 20 seconds: Finch, **Customer Service** on the training page, choose a scenario under **Practice scenario**, **Play fallback call**, then **Get feedback**.

## If something goes wrong

| Problem | What happens / what to do |
|---|---|
| Gemini is slow or down during training | The trainer waits at most 8 seconds, then scores from the build log and says "scored from the build log". Keep going: "the AI trainer is offline, the rules still run." |
| The assistant or the evaluation summary says it is busy | It shows a friendly message; move on, nothing else depends on it. |
| The state looks wrong or the demo needs repeating | In window A press **Reset demo**, then **Generate schedule**. |
| The live voice call fails | Use the built-in replay of the sample call; it goes through the same grading. |
| An employee cannot be found in the dropdown | Press **Reset demo**. |

## What was checked in rehearsal

Timings on the production build, from one full run: the AI judge takes about 1 second, grading a call about 3 seconds, the evaluation summary about 3.5 seconds, the schedule assistant about 1 second, the chat call-off about 2.5 seconds per step, and generating the schedule, approving a replacement and skipping ahead are instant. The human clicking is what takes the time, so practise the build (about 20 seconds) and the employee switch.
