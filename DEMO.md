# Demo run-of-show (3 minutes)

Conjuring Cauldron closes the loop for a food service team: **train, evaluate, schedule, repeat**. The demo restaurant is a witch-themed cafe.

The customer service part is shown as a **short live snippet** of a voice call with a witch customer (about 30 seconds), not a full call. If the live call is not working on the day, the same screen plays a recorded sample call instead; say so honestly.

## Before you present (about 10 minutes)

1. `git pull`, `npm install`. Use **Node 22**.
2. `.env.local` has a working `GEMINI_API_KEY` and model ids (copy `.env.example`). Run `npm run verify:llm`; it should print three PASS lines in under 30 seconds.
3. Fresh data: `npm run db:setup`. Then run the production build: `npm run build` and `npm start` (http://localhost:3000). It is faster and steadier than `npm run dev`.
4. **Two windows, two logins.** The login cookie belongs to one address, so use one for each:
   - Window A at `http://localhost:3000` signed in as **Morgana** (manager).
   - Window B at `http://127.0.0.1:3000` for the employees: **Finch** first, then **Elowen** (sign out and pick the next name from the list, about 5 seconds).
5. **One bookmark in window B** (saves back-clicks): `http://127.0.0.1:3000/employee/training/customer-service`.
6. **Warm up Gemini:** in window A ask the schedule assistant anything ("Who is on Sunday open?"). The first AI call after a break can be slow.
7. **Live call go/no-go** (next section). Then press **Reset demo** in window A so the schedule is empty and Finch is untrained.
8. Accounts you will use: Morgana (manager), Finch (brand-new hire), Elowen (experienced), Wren (partly trained). Everyone else is seeded.

## Live call: set up once, check every time

**Set up once (not done yet; tracked in PLAN.md):**
- A Vapi account and one saved assistant: model Google Gemini; the witch persona for the **cold Dragon's Breath Cider** scenario (customer Mirella); the first message *"My Dragon's Breath Cider is cold. Cold! I flew through a thunderstorm for that drink."*; a maximum call length of about 90 seconds; allowed to end the call once the issue is resolved. Pick a gravelly, older-sounding voice; a custom ElevenLabs "Voice Design" witch voice is optional polish.
- The assistant's server URL is `<tunnel>/api/voice/webhook` with the header `x-conjuring-voice-secret` set to `VAPI_WEBHOOK_SECRET`. The tunnel (ngrok or cloudflared) must be running, because Vapi's servers have to reach this laptop.
- In `.env.local`: `NEXT_PUBLIC_VAPI_PUBLIC_KEY`, `VAPI_ASSISTANT_ID`, `NEXT_PUBLIC_APP_URL` (the tunnel address) and `VAPI_WEBHOOK_SECRET`.
- The speaker-labelling bug in `src/voice/transcript.ts` and `src/voice/use-vapi-call.ts` must be fixed first: the AI witch is Vapi's "assistant" and the trainee is its "user", and the code currently has them the other way round, so a live call would grade the witch instead of the trainee.
- Allow the microphone for `http://127.0.0.1:3000` in the browser, and use a headset.

**Go/no-go check, 10 minutes before:** sign in as Finch, open the customer service page, choose **Cold Dragon's Breath Cider**, press **Start practice call**, say one sentence, press **End call**, press **Get feedback**. It passes only if (1) the witch speaks first, (2) the feedback appears within about 5 seconds, and (3) the transcript shows *your* sentence as the employee. If any of these fail, use the recorded sample call on the same screen (**Play fallback call**) and present it as a recording. Then press **Reset demo**.

## The 3 minutes

| Time | Where | What you do | What you say |
|---|---|---|---|
| 0:00 | Window B, login page | Show the page. | "Restaurants lose staff constantly, and training, evaluation and scheduling live in three separate tools. Conjuring Cauldron connects them." |
| 0:15 | B: sign in as **Finch** | Click **Go to training**, **Drinks**, **Love Potion Latte**, **I am ready**. Drag **Cup** and **Rose syrup** onto the plate, click **Espresso**, **Steamed milk**, **Heart foam**, then **Serve the drink**. | "Finch is brand new. He builds the recipe from memory against the clock, and an AI trainer judges accuracy and speed." |
| 0:45 | B: customer service bookmark | Under **Practice scenario** choose **Cold Dragon's Breath Cider**, click **Start practice call**. The witch speaks first. Say: *"I'm so sorry about that, especially after your flight! I'll remake it hot right now, no charge."* Click **End call**, then **Get feedback**. | "Customer service is a live voice call with an AI witch customer who is upset. His words are scored against a rubric: empathy, solving the problem, tone." |
| 1:15 | B: click **View my evaluation** (under the call feedback) | Point at the headline, **Strengths**, **Can start now**. | "Now he is evaluated from real results: what he is good at, what to work on, and where he can work today." |
| 1:35 | A: **Generate schedule** | Click it, point at Finch (Drinks) and Wren's dashed shadow slot. Ask the assistant: **Why is Selene only on weekends?** | "The schedule is built from certified skills, hours and availability, and never breaks the rules. Finch is on it. Wren is a trainee, so he only shadows a certified teammate. The assistant explains choices; the manager approves any change." |
| 2:05 | B: sign out, sign in as **Elowen** | In the Cauldron assistant type: *I'm sick, I need to call off my first close shift.* Press **Confirm call-off**. Then in A press **F5**, show the ranked replacements in **Call-off inbox**, click **Approve**. | "Elowen calls off in plain language. The system ranks who can legally cover her, and why. One click sends the offer." |
| 2:40 | A: **Skip ahead 3 days** | Click it and read the amber line about who lost certification. | "Three days later skills slip and people are asked to retest, so the loop keeps running." |
| 2:55 | A | Stop. | "Train, evaluate, schedule, repeat." |

**If you run long, cut in this order:** the schedule assistant question; then the Approve click; then switch the live call to the recorded sample (saves about 10 seconds); then Skip Ahead.

Practise the Finch build (about 20 seconds), the one spoken sentence, and the employee switch. The clicking is what takes the time.

## If something goes wrong

| Problem | What happens / what to do |
|---|---|
| Gemini is slow or down during training | The trainer waits at most 8 seconds, then scores from the build log and says "scored from the build log". Keep going: "the AI trainer is offline, the rules still run." |
| The assistant or the evaluation summary says it is busy | It shows a friendly message; move on, nothing else depends on it. |
| The live call will not start, or the witch is silent | Stop after about 5 seconds. Press **End call**, choose the same scenario and use **Play fallback call**. Say "here is a recorded sample". |
| The call ends but feedback does not appear | The tunnel or webhook is down. Use the recorded sample call. |
| The microphone is blocked | Use the recorded sample call. |
| The state looks wrong or the demo needs repeating | In window A press **Reset demo**, then **Generate schedule**. |
| An employee cannot be found in the dropdown | Press **Reset demo**. |

## What was checked in rehearsal

Timings on the production build, from one full run: the AI judge takes about 1 second, grading a call about 3 seconds, the evaluation summary about 3.5 seconds, the schedule assistant about 1 second, the chat call-off about 2.5 seconds per step, and generating the schedule, approving a replacement and skipping ahead are instant. The recorded-sample path was rehearsed end to end. **The live voice call has not been tested yet** (the Vapi account and assistant do not exist), so its 30-second slot is an estimate: roughly 3 seconds to connect, 4 seconds for the witch's opening line, 6 seconds for the spoken reply, then 5 seconds to end and grade.
