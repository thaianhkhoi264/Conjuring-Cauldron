# Runbook: getting everything running again

Use this after a restart, a new day, or a new laptop. Four things have to be running or set correctly for the live customer service call to work. If only the app is running, everything works **except** that a live call's finished transcript never arrives (you see "The final transcript has not arrived yet" and then "An employee transcript is required before evaluation").

| # | Piece | Where it runs | Survives a restart? |
|---|---|---|---|
| 1 | The app | a terminal on this laptop, port 3000 | No, start it each time |
| 2 | The tunnel (cloudflared) | a second terminal | No, start it each time, and **its address changes every time** |
| 3 | Vapi's server URL | Vapi's dashboard | Saved, but must be edited to the **new tunnel address** every time |
| 4 | Keys in `.env.local` | a file in the project folder | Yes |

Why the tunnel: when a call ends, Vapi's servers send the finished transcript to our app. Vapi cannot reach `localhost`, so cloudflared gives the laptop a temporary public web address, and Vapi is told to send the transcript there. A new cloudflared run gets a new address, so Vapi must be told again.

## The quick version (about 3 minutes)

1. **Terminal 1, the app.** In the project folder:
   ```bash
   npm run dev
   ```
   (For the real demo use `npm run build` then `npm start` instead; it is faster and what was rehearsed.) Wait until it says it is ready on `http://localhost:3000`.
2. **Terminal 2, the tunnel:**
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
   Leave this window open. Do not close it while using the app.
3. **Find the new address.** It prints a line like `https://something-random-words.trycloudflare.com`. If you missed it, ask the running tunnel:
   ```bash
   curl http://127.0.0.1:20241/quicktunnel
   ```
4. **Check the tunnel reaches the app:**
   ```bash
   curl -X POST https://<that address>/api/voice/webhook
   ```
   A reply containing `Unauthorized webhook` (HTTP 401) is **good**: it means the request got through and the app is protecting itself. Anything else (a timeout, a Cloudflare error page) means the tunnel or the app is not up.
5. **Tell Vapi the new address.** Vapi dashboard, Assistants, open `Mirella - cold cider`, find **Server URL** (usually under the Advanced settings) and set it to
   `https://<that address>/api/voice/webhook`
   Keep the server messages on **end-of-call-report** only. Save.
6. **Test with one call.** Sign in as Finch, Customer Service, scenario "Cold Dragon's Breath Cider", Start practice call, say one sentence, End call. Within a few seconds the transcript should appear with "Misheard?" links. Then Get feedback.

## One-time things (only on a new laptop)

- Install Node 22 and run `npm install`.
- Install cloudflared: `winget install --id Cloudflare.cloudflared`
- Create `.env.local` from `.env.example` and fill in the keys: `GEMINI_API_KEY` (+ model ids), `NEXT_PUBLIC_VAPI_PUBLIC_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_WEBHOOK_SECRET`. (`NEXT_PUBLIC_APP_URL` is not used by the code.) The assistant ID and the webhook secret must be **different** values. Never commit or paste these keys anywhere.
- `npm run db:setup` to create the database with the demo data. After pulling newer code you do **not** need it again: the app upgrades an existing database by itself. Use it (or the **Reset demo** button) only to get back to the starting demo state.
- Recreate the Vapi assistant, its Bearer Token credential and the voice following the appendix at the bottom of [DEMO.md](DEMO.md).

## When something is wrong

| What you see | Cause | Fix |
|---|---|---|
| "The final transcript has not arrived yet", then "An employee transcript is required before evaluation" | The transcript never reached the app | The tunnel is not running, its address changed, or Vapi's Server URL still has the old address. Redo steps 2 to 5. Calls made while it was down cannot be recovered; just make a new call. |
| `curl` to the webhook gives a timeout or a Cloudflare error | Tunnel not running, or the app is not on port 3000 | Start the app (step 1), then the tunnel (step 2). |
| `curl` gives 401 but calls still never arrive | Vapi's Server URL is wrong or the secret does not match | Re-check the URL in step 5. In Vapi the credential must be **Bearer Token**, header name `x-conjuring-voice-secret`, token equal to `VAPI_WEBHOOK_SECRET`, and **Include Bearer Prefix switched OFF**. |
| `EADDRINUSE :::3000` when starting the app | An older copy is still running | Close the old terminal window (Ctrl+C), or find it with `Get-NetTCPConnection -LocalPort 3000` in PowerShell and stop that process. |
| "The voice call failed", or the witch does not speak | Keys missing or wrong, or the microphone is blocked | Check the three Vapi values in `.env.local`, restart the app after editing, allow the microphone for the page, use a headset, switch off any VPN. |
| `no such table` or `no such column` | Database made by an older version | Pull the latest code and restart (it upgrades itself). If still stuck, `npm run db:setup` (this resets the demo data). |
| Feedback says the AI grader is unavailable | Gemini was busy | Press Get feedback again. A real call is never scored by the fallback. |
| The live call just will not work on the day | Network or venue | Use **Play fallback call** on the same screen (the recorded sample) and say it is a recording. |

## Rules of thumb

- **Order matters:** app first, then tunnel, then update Vapi. A tunnel with no app behind it gives errors.
- **Changed `.env.local`?** Restart the app (and rebuild if you use `npm start`).
- **Restarted cloudflared for any reason?** Repeat steps 3 to 5.
- **Before presenting:** do the go/no-go check in [DEMO.md](DEMO.md) on the laptop and network you will use.
