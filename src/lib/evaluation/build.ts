/**
 * Employee evaluation report, built only from stored scores (pure functions, no database, no LLM).
 * Every number and every claim here comes from attempts and mastery; the AI summary on top of it
 * (narrative.ts) can only rephrase these facts.
 */

export type EvalStation = "food" | "drink" | "cs";

export const EVAL_STATIONS: EvalStation[] = ["food", "drink", "cs"];
export const STATION_LABEL: Record<EvalStation, string> = { food: "Food", drink: "Drinks", cs: "Customer Service" };

const DIMENSIONS: Record<string, string> = {
  greeting_and_warmth: "greeting and warmth",
  order_accuracy: "order accuracy",
  deescalation_and_empathy: "de-escalation and empathy",
  problem_resolution: "problem solving",
  professional_tone: "professional tone",
  upsell_or_suggestion: "suggesting extras",
};

export type EvalAttempt = {
  station: EvalStation;
  recipeId: string | null;
  score: number;
  createdAt: string;
  feedback: Record<string, unknown>;
};

export type EvalInput = {
  name: string;
  isNew: boolean;
  mastery: { station: EvalStation; score: number; attempts: number; lastTrainedAt: string | null }[];
  attempts: EvalAttempt[];
  recipes: { id: string; name: string; station: "food" | "drink"; difficulty: number }[];
  upcomingShiftCount: number;
  retestStations: EvalStation[];
  certThreshold?: number;
};

export type StationSummary = {
  station: EvalStation;
  label: string;
  /** null = not started */
  score: number | null;
  certified: boolean;
  attempts: number;
  trend: "up" | "down" | "steady" | null;
  retestDue: boolean;
};

export type NeedsImprovement = { station: EvalStation; label: string; score: number; gapToCertify: number; suggestion: string };
export type CanStart = { station: EvalStation; label: string; role: "anchor" | "shadow"; text: string };

export type Evaluation = {
  name: string;
  headline: string;
  schedulingStatus: string;
  stations: StationSummary[];
  strengths: string[];
  weaknesses: string[];
  needsImprovement: NeedsImprovement[];
  notStarted: { station: EvalStation; label: string }[];
  canStartNow: CanStart[];
  nextSteps: string[];
  hasData: boolean;
};

/** SQL timestamps ("2026-10-03 09:00:00") and ISO strings both become milliseconds. */
export function toMillis(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? 0 : ms;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;
const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

function numberField(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function topCounts(counts: Map<string, number>, limit = 2) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function buildEvaluation(input: EvalInput): Evaluation {
  const threshold = input.certThreshold ?? 0.8;
  const recipeById = new Map(input.recipes.map((r) => [r.id, r]));
  const sorted = [...input.attempts].sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));

  const stations: StationSummary[] = EVAL_STATIONS.map((station) => {
    const row = input.mastery.find((m) => m.station === station);
    const mine = sorted.filter((a) => a.station === station);
    let trend: StationSummary["trend"] = null;
    if (mine.length >= 2) {
      const delta = mine[mine.length - 1].score - mine[mine.length - 2].score;
      trend = delta > 0.05 ? "up" : delta < -0.05 ? "down" : "steady";
    }
    const score = row && row.attempts > 0 ? row.score : null;
    return {
      station,
      label: STATION_LABEL[station],
      score,
      certified: score !== null && score >= threshold,
      attempts: Math.max(mine.length, row?.attempts ?? 0),
      trend,
      retestDue: input.retestStations.includes(station),
    };
  });

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const s of stations) {
    if (s.certified && s.score !== null) strengths.push(`${s.label}: ${pct(s.score)}, certified.`);
  }

  // Food and drink: recipe results and repeated mistakes, from the structured feedback we stored.
  for (const station of ["food", "drink"] as const) {
    const mine = sorted.filter((a) => a.station === station);
    const best = new Map<string, number>();
    for (const a of mine) if (a.recipeId) best.set(a.recipeId, Math.max(best.get(a.recipeId) ?? 0, a.score));

    const standouts = [...best.entries()]
      .filter(([, score]) => score >= 0.9)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id, score]) => `${recipeById.get(id)?.name ?? "A recipe"} (${pct(score)})`);
    if (standouts.length) strengths.push(`Excellent builds: ${standouts.join(", ")}.`);

    const recent = mine.slice(-6);
    const speeds = recent.map((a) => numberField(a.feedback, "speed")).filter((v): v is number => v !== null);
    const speedAvg = average(speeds);
    if (speedAvg !== null && speeds.length >= 2) {
      if (speedAvg >= 0.9) strengths.push(`${STATION_LABEL[station]}: you finish within the target time.`);
      else if (speedAvg < 0.6) weaknesses.push(`${STATION_LABEL[station]}: builds usually run over the target time (speed ${pct(speedAvg)}).`);
    }

    const missing = new Map<string, number>();
    const wrongOrder = new Map<string, number>();
    const extra = new Map<string, number>();
    for (const a of recent) {
      const facts = (a.feedback.facts ?? {}) as Record<string, unknown>;
      stringList(facts.missing).forEach((item) => bump(missing, item));
      stringList(facts.outOfOrder).forEach((item) => bump(wrongOrder, item));
      stringList(facts.extra).forEach((item) => bump(extra, item));
    }
    const repeats = (map: Map<string, number>) => topCounts(map).filter(([, n]) => n >= 2);
    const forgot = repeats(missing);
    if (forgot.length) weaknesses.push(`${STATION_LABEL[station]}: you keep forgetting ${forgot.map(([item]) => item).join(" and ")}.`);
    const order = repeats(wrongOrder);
    if (order.length) weaknesses.push(`${STATION_LABEL[station]}: order mix-ups with ${order.map(([item]) => item).join(" and ")}.`);
    const added = repeats(extra);
    if (added.length) weaknesses.push(`${STATION_LABEL[station]}: you added ${added.map(([item]) => item).join(" and ")}, which do not belong.`);

    const struggling = [...best.entries()].filter(([, score]) => score < 0.6).sort((a, b) => a[1] - b[1]).slice(0, 2);
    if (struggling.length) {
      weaknesses.push(`Needs practice: ${struggling.map(([id, score]) => `${recipeById.get(id)?.name ?? "a recipe"} (${pct(score)})`).join(", ")}.`);
    }
  }

  // Customer service: rubric dimension averages over the most recent calls.
  const calls = sorted.filter((a) => a.station === "cs").slice(-3);
  const dimensionAverages: [string, number][] = Object.keys(DIMENSIONS).flatMap((key) => {
    const values = calls
      .map((call) => {
        const dim = call.feedback[key];
        return dim && typeof dim === "object" ? numberField(dim as Record<string, unknown>, "score") : null;
      })
      .filter((v): v is number => v !== null);
    const avg = average(values);
    return avg === null ? [] : [[key, avg] as [string, number]];
  });
  const strongDims = dimensionAverages.filter(([key, avg]) => avg >= 4 && key !== "upsell_or_suggestion").sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (strongDims.length) strengths.push(`Customer service: strong ${strongDims.map(([key]) => DIMENSIONS[key]).join(" and ")}.`);
  const weakDims = dimensionAverages.filter(([key, avg]) => avg < 3.5 && key !== "upsell_or_suggestion").sort((a, b) => a[1] - b[1]).slice(0, 2);
  for (const [key, avg] of weakDims) weaknesses.push(`Customer service: work on ${DIMENSIONS[key]} (${avg.toFixed(1)} out of 5).`);

  // What to practise next, by station.
  const needsImprovement: NeedsImprovement[] = [];
  const notStarted: Evaluation["notStarted"] = [];
  for (const s of stations) {
    if (s.score === null) {
      notStarted.push({ station: s.station, label: s.label });
      continue;
    }
    if (s.certified) continue;
    let suggestion: string;
    if (s.station === "cs") {
      suggestion = weakDims.length ? `Run another call and focus on ${DIMENSIONS[weakDims[0][0]]}.` : "Run another practice call.";
    } else {
      const options = input.recipes.filter((r) => r.station === s.station);
      const bests = new Map<string, number>();
      for (const a of sorted) if (a.station === s.station && a.recipeId) bests.set(a.recipeId, Math.max(bests.get(a.recipeId) ?? 0, a.score));
      const weakest = options.filter((r) => bests.has(r.id) && bests.get(r.id)! < 0.9).sort((a, b) => bests.get(a.id)! - bests.get(b.id)!)[0];
      const untried = options.filter((r) => !bests.has(r.id)).sort((a, b) => a.difficulty - b.difficulty)[0];
      const pick = weakest ?? untried;
      suggestion = pick ? `Practise ${pick.name}.` : "Repeat your best recipe to raise your score.";
    }
    needsImprovement.push({ station: s.station, label: s.label, score: s.score, gapToCertify: Math.max(0, threshold - s.score), suggestion });
  }
  needsImprovement.sort((a, b) => a.gapToCertify - b.gapToCertify);

  // Where this person can work right now.
  const canStartNow: CanStart[] = [];
  for (const s of stations) {
    if (s.certified) {
      canStartNow.push({ station: s.station, label: s.label, role: "anchor", text: `Work ${s.label} as a certified team member.` });
    } else if (input.isNew && s.score !== null && s.score > 0) {
      canStartNow.push({ station: s.station, label: s.label, role: "shadow", text: `Shadow ${s.label} beside a certified teammate while you train.` });
    }
  }

  const anyCertified = stations.some((s) => s.certified);
  const anyProgress = stations.some((s) => s.score !== null);
  const headline = anyCertified
    ? "You are ready for the schedule."
    : anyProgress
      ? `Keep going: reach ${pct(threshold)} in one chapter to join the schedule.`
      : "Start your first chapter to get evaluated.";
  const schedulingStatus = !anyCertified
    ? "Not yet schedulable: no certified station."
    : input.upcomingShiftCount > 0
      ? `You have ${input.upcomingShiftCount} upcoming shift${input.upcomingShiftCount === 1 ? "" : "s"}.`
      : "Certified and waiting: your manager adds you the next time the schedule is refreshed.";

  const nextSteps: string[] = [];
  for (const s of stations.filter((x) => x.retestDue)) nextSteps.push(`Retest ${s.label}: it has been a few days since you trained it.`);
  if (needsImprovement[0]) nextSteps.push(`${needsImprovement[0].label}: you are ${pct(needsImprovement[0].gapToCertify)} from certified. ${needsImprovement[0].suggestion}`);
  if (notStarted[0] && nextSteps.length < 3) nextSteps.push(`Try ${notStarted[0].label}: you have not started it yet.`);
  if (!nextSteps.length && anyCertified) nextSteps.push("Keep your skills fresh: a short retest every few days keeps your certification.");

  return {
    name: input.name,
    headline,
    schedulingStatus,
    stations,
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    needsImprovement,
    notStarted,
    canStartNow,
    nextSteps: nextSteps.slice(0, 3),
    hasData: anyProgress,
  };
}
