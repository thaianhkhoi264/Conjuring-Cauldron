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

## Live call: set up, then check every time

**Status:** the Vapi assistant, the tunnel and the settings exist, and a live call has been run on the development laptop: it connects, the witch speaks in her custom voice, and the call works inside the app (reported by the team on 2026-10-04). **Not yet confirmed:** grading of a live transcript end to end, and the real 30-second timing. The go/no-go check below covers both; do it on the laptop and network you will present on.

**What has to be true (details to recreate everything are in the appendix at the bottom):**
- The Vapi assistant exists and speaks first with Mirella's cold-cider line.
- The tunnel is running and Vapi's server URL is the **current** tunnel address plus `/api/voice/webhook`. The quick-tunnel address **changes every time cloudflared restarts**, so check it first.
- `.env.local` has `NEXT_PUBLIC_VAPI_PUBLIC_KEY`, `VAPI_ASSISTANT_ID` and `VAPI_WEBHOOK_SECRET`, and the app was rebuilt (`npm run build`) after they were last changed.
- The microphone is allowed for `http://127.0.0.1:3000` in the browser, and you use a headset.
- If you use a VPN, switch it off when testing the call or the tunnel.

**Go/no-go check, 10 minutes before:** sign in as Finch, open the customer service page, choose **Cold Dragon's Breath Cider**, press **Start practice call**, say one sentence, press **End call**, press **Get feedback**. It passes only if (1) the witch speaks first, (2) the feedback appears within about 5 seconds, and (3) the transcript shows *your* sentence as the employee. If any of these fail, use the recorded sample call on the same screen (**Play fallback call**) and present it as a recording. Then press **Reset demo**.

## The 3 minutes

| Time | Where | What you do | What you say |
|---|---|---|---|
| 0:00 | Window B, login page | Show the page. | "Restaurants lose staff constantly, and training, evaluation and scheduling live in three separate tools. Conjuring Cauldron connects them." |
| 0:15 | B: sign in as **Finch** | Click **Go to training**, **Drinks**, **Love Potion Latte**, **I am ready**. Drag **Cup** and **Rose syrup** onto the plate, click **Espresso**, **Steamed milk**, **Heart foam**, then **Serve the drink**. | "Finch is brand new. He builds the recipe from memory against the clock, and an AI trainer judges accuracy and speed." |
| 0:45 | B: customer service bookmark | Under **Practice scenario** choose **Cold Dragon's Breath Cider**, click **Start practice call**. The witch speaks first. Say: *"I'm so sorry about that, especially after your flight! I'll remake it hot right now, no charge."* Click **End call**, then **Get feedback**. | "Customer service is a live voice call with an AI witch customer who is upset. You can watch the transcript appear as we talk, and his words are scored against a rubric: empathy, solving the problem, tone." |
| 1:15 | B: click **View my evaluation** (under the call feedback) | Point at the headline, **Strengths**, **Can start now**. | "Now he is evaluated from real results: what he is good at, what to work on, and where he can work today." |
| 1:35 | A: **Generate schedule** | Click it, point at Finch (Drinks) and Wren's dashed shadow slot. Ask the assistant: **Why is Selene only on weekends?** | "The schedule is built from certified skills, hours and availability, and never breaks the rules. Finch is on it. Wren is a trainee, so he only shadows a certified teammate. The assistant explains choices; the manager approves any change." |
| 2:05 | B: sign out, sign in as **Elowen** | In the Cauldron assistant type: *I'm sick, I need to call off my first close shift.* Press **Confirm call-off**. Then in A press **F5**, show the ranked replacements in **Call-off inbox**, click **Approve**. | "Elowen calls off in plain language. The system ranks who can legally cover her, and why. One click sends the offer." |
| 2:40 | A: **Skip ahead 3 days** | Click it and read the amber line about who lost certification. | "Three days later skills slip and people are asked to retest, so the loop keeps running. People who worked shifts in that time keep their skills fresher, because working is practice." |
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
| The microphone is blocked | Click the padlock next to the address, set Microphone to Allow, and retry. If there is no time, use the recorded sample call. |
| The page says "The voice call failed: ..." | Read the words after the colon. A microphone message: allow the microphone. "Meeting has ended" or "ejection": the assistant's model or voice is not available on the Vapi account, so check the assistant in the Vapi dashboard. A network message: turn the VPN off. Otherwise use the recorded sample call. |
| The tunnel was restarted | Its address changed. Put the new address plus `/api/voice/webhook` into the assistant's server URL in Vapi. |
| Settings in `.env.local` were changed | Rebuild and restart the app (`npm run build`, then `npm start`). |
| First run on a new laptop shows "no such table" | Run `npm run db:setup` once. |
| The live transcript got a word wrong | After **End call**, use **Misheard?** on that line and type what was said, then **Get feedback** (only believable mishearings are applied, at most 3 per call). Fixes cannot be added after scoring. |
| The feedback says the AI grader is unavailable | Gemini hiccup. A real call is never scored by the fallback, so press **Get feedback** again. |
| The state looks wrong or the demo needs repeating | In window A press **Reset demo**, then **Generate schedule**. |
| An employee cannot be found in the dropdown | Press **Reset demo**. |

## What was checked in rehearsal

Timings on the production build, from one full run: the AI judge takes about 1 second, grading a call about 3 seconds, the evaluation summary about 3.5 seconds, the schedule assistant about 1 second, the chat call-off about 2.5 seconds per step, and generating the schedule, approving a replacement and skipping ahead are instant. The recorded-sample path was rehearsed end to end. The live call has been run once on the development laptop (connects, the witch speaks); grading a live transcript and the 30-second timing are still to be confirmed with the go/no-go check on the demo laptop.

## Appendix: recreating the live call on another machine

The Vapi assistant lives in Vapi's dashboard, not in this repository. These notes recreate it. **Never commit or share keys or the secret**; values go only in `.env.local` and in Vapi's dashboard.

**1. Keys and values**
- Vapi dashboard, API Keys: copy the **Public** key into `.env.local` as `NEXT_PUBLIC_VAPI_PUBLIC_KEY`.
- The assistant's ID (a UUID Vapi shows on the assistant's page) goes in `VAPI_ASSISTANT_ID`.
- Make up a webhook secret and use the **same value** in `VAPI_WEBHOOK_SECRET` and in Vapi (step 3). The assistant ID and the secret must be different: the assistant ID is sent to the browser, so it must never be the secret.

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

**2. The assistant** (Vapi, Assistants, Blank Template; name it `Mirella - cold cider`)
- Model: Google Gemini Flash or any fast model (it only plays the witch; our grader scores the trainee).
- First message (the assistant speaks first): `My Dragon's Breath Cider is cold. Cold! I flew through a thunderstorm for that drink.`
- Maximum call length about 120 seconds, End Call enabled, silence timeout about 15 seconds.
- System prompt: the restaurant context and Mirella persona from `src/voice/scenarios.ts` (`getVapiAssistantPrompt` for the `wrong-order` scenario), followed by: *You are the CUSTOMER and the person speaking to you is a trainee employee. Speak in short spoken sentences, one to three at a time. No lists, no emojis, no stage directions. Start upset but fair. If the trainee apologizes sincerely and offers the remake, soften, thank them, say a short goodbye and end the call.*

**3. The webhook**
- Server URL: `https://<tunnel address>/api/voice/webhook`; server messages: only **end-of-call-report**. (The app stores only that report and ignores any other message Vapi sends, so extra ticks are harmless but waste requests.)
- Authentication: a credential of type **Bearer Token** with Header Name `x-conjuring-voice-secret`, Token = the secret, and **Include Bearer Prefix switched OFF** (with it on, the app rejects every message).

**4. The tunnel** (Vapi's servers must reach the laptop)

```bash
winget install --id Cloudflare.cloudflared
```

```bash
cloudflared tunnel --url http://localhost:3000
```

Leave it running. Ask it for its address with `curl http://127.0.0.1:20241/quicktunnel`. If cloudflared reports failed "pre-checks" but also says `Registered tunnel connection`, it is connected; test with `curl -X POST https://<address>/api/voice/webhook` (a 401 means it is reachable and protected).

**5. The witch voice** (optional polish)
- ElevenLabs, ElevenCreative, Voices, My Voices, Add a new voice, Voice Design. Prompt used as a starting point: *A warm but cranky old witch with a raspy, croaky voice, slightly high-pitched and theatrical. She speaks at a natural, brisk conversational pace and every word is clear. She sounds upset but fair, with a hint of a dry cackle when amused.* Save the voice to My Voices.
- Put the ElevenLabs API key under Vapi's Provider Keys (never in this project). If the voice does not appear in the list, paste its Voice ID into the assistant's voice settings by hand. Prefer a fast speech model so she answers without a long pause. A preset voice is the fallback.
