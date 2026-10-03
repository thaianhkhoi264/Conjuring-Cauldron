import { NextResponse } from "next/server";

import { recordAttempt } from "@/lib/mastery";
import { forbidden, getSessionUser, unauthorized } from "@/lib/session";
import { getIngredientPool, getRecipe } from "@/lib/training/data";
import { judgeAttempt } from "@/lib/training/judge";
import { computeFacts, type BuildEvent } from "@/lib/training/scoring";

const MAX_EVENTS = 80;
const MAX_ELAPSED_MS = 10 * 60 * 1000;

type SubmitBody = { recipeId?: unknown; events?: unknown; elapsedMs?: unknown };

function parseEvents(raw: unknown, pool: Set<string>): BuildEvent[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_EVENTS) return null;
  const events: BuildEvent[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const { type, item, atMs } = entry as Record<string, unknown>;
    if ((type !== "add" && type !== "remove") || typeof item !== "string" || !pool.has(item)) return null;
    if (typeof atMs !== "number" || !Number.isFinite(atMs) || atMs < 0) return null;
    events.push({ type, item, atMs: Math.min(atMs, MAX_ELAPSED_MS) });
  }
  return events;
}

export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (!user) return unauthorized();
  if (user.role !== "employee") return forbidden();

  const body = (await request.json().catch(() => ({}))) as SubmitBody;
  const recipe = typeof body.recipeId === "string" ? getRecipe(body.recipeId) : undefined;
  if (!recipe) return NextResponse.json({ error: "Unknown recipe." }, { status: 404 });

  const events = parseEvents(body.events, new Set(getIngredientPool(recipe.station)));
  if (!events) return NextResponse.json({ error: "Invalid build log." }, { status: 400 });

  const lastEventMs = events.reduce((max, event) => Math.max(max, event.atMs), 0);
  const reported = typeof body.elapsedMs === "number" && Number.isFinite(body.elapsedMs) ? body.elapsedMs : lastEventMs;
  const elapsedMs = Math.min(MAX_ELAPSED_MS, Math.max(reported, lastEventMs));

  const facts = computeFacts(recipe.ingredients.map((i) => i.item), events, elapsedMs, recipe.targetSeconds);
  const judged = await judgeAttempt({ recipeName: recipe.name, station: recipe.station, facts, events });

  const result = recordAttempt({
    employeeId: user.id,
    station: recipe.station,
    recipeId: recipe.id,
    score: judged.score,
    durationSeconds: facts.elapsedSeconds,
    feedback: {
      source: judged.source,
      accuracy: judged.accuracy,
      speed: judged.speed,
      mistakes: judged.mistakes,
      coaching: judged.coaching,
      facts: {
        missing: facts.missing,
        extra: facts.extra,
        outOfOrder: facts.outOfOrder,
        elapsedSeconds: facts.elapsedSeconds,
        targetSeconds: facts.targetSeconds,
      },
    },
  });

  return NextResponse.json({
    score: judged.score,
    accuracy: judged.accuracy,
    speed: judged.speed,
    mistakes: judged.mistakes,
    coaching: judged.coaching,
    judgedBy: judged.source,
    mastery: { score: result.score, certified: result.certified },
  });
}
