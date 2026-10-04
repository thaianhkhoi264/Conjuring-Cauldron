"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { MasteryBar } from "@/components/mastery-bar";
import { ingredientIcon } from "@/lib/training/icons";
import { Spinner } from "@/components/ui";

type Ingredient = { item: string; quantity?: string };
type BuildEvent = { type: "add" | "remove"; item: string; atMs: number };

export type RecipeBuilderProps = {
  recipe: { id: string; name: string; station: "food" | "drink"; targetSeconds: number; ingredients: Ingredient[] };
  options: string[];
  backHref: string;
  nextHref?: string;
};

type Result = {
  score: number;
  accuracy: number;
  speed: number;
  mistakes: string[];
  coaching: string;
  judgedBy: "gemini" | "fallback";
  mastery: { score: number; certified: boolean };
};

function Chip({ item, disabled, onPick }: { item: string; disabled: boolean; onPick: (item: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item, disabled });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(4deg) scale(1.08)` }
    : undefined;
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  // The drag library swallows the first `click` after any drag, so a click straight after dragging an
  // item did nothing. Pointer events are not suppressed: a press and release that barely moves is a click.
  // `click` is kept only for keyboard activation (detail 0), so nothing is added twice.
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      disabled={disabled}
      {...attributes}
      {...listeners}
      onPointerDown={(event) => {
        pressedAt.current = { x: event.clientX, y: event.clientY };
        listeners?.onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        const start = pressedAt.current;
        pressedAt.current = null;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) onPick(item);
      }}
      onClick={(event) => {
        if (event.detail === 0) onPick(item);
      }}
      className={`chip touch-none rounded-full border px-3 py-1.5 text-sm ${
        disabled
          ? "scale-90 border-violet-900 bg-violet-950/30 text-violet-400/40 opacity-50"
          : "cursor-grab border-violet-400/60 bg-violet-900/60 hover:border-emerald-300/60 hover:bg-violet-800 hover:shadow-[0_0_14px_-3px_rgba(52,211,153,0.6)]"
      } ${isDragging ? "z-10 cursor-grabbing opacity-90 shadow-[0_8px_24px_-6px_rgba(52,211,153,0.7)]" : ""}`}
    >
      <span aria-hidden="true" className="mr-1.5">
        {ingredientIcon(item)}
      </span>
      {item}
    </button>
  );
}

/** Drops that fly up when something lands in the pot; the group is remounted (new key) for every ingredient. */
const SPLASH = Array.from({ length: 9 }, (_, index) => ({
  x: (index - 4) * 14 + (index % 2 ? 5 : -5),
  rise: 38 + ((index * 37) % 40),
  size: 5 + ((index * 5) % 7),
  delay: (index % 3) * 40,
}));

function Plate({
  children,
  empty,
  station,
  pulse,
}: {
  children: React.ReactNode;
  empty: boolean;
  station: "food" | "drink";
  pulse: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "plate" });
  return (
    <div
      ref={setNodeRef}
      aria-label="Plate"
      className={`pot ${station === "drink" ? "pot-cauldron" : "pot-plate"} ${isOver ? "pot-over" : ""}`}
    >
      <div className={`pot-glow ${pulse > 0 ? "pot-flash" : ""}`} key={`glow-${pulse}`} aria-hidden="true" />
      {pulse > 0 && (
        <div className="pot-splash" key={`splash-${pulse}`} aria-hidden="true">
          {SPLASH.map((drop, index) => (
            <span
              key={index}
              className="pot-drop"
              style={
                {
                  "--dx": `${drop.x}px`,
                  "--rise": `${drop.rise}px`,
                  width: drop.size,
                  height: drop.size,
                  animationDelay: `${drop.delay}ms`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      <div className="relative z-10">
        {empty ? (
          <p className="py-8 text-center text-sm text-violet-200">
            <span aria-hidden="true" className="pot-hint block pb-1 text-3xl">
              {station === "drink" ? "🫕" : "🍽️"}
            </span>
            Drag ingredients here, in order.
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** Time against the target: calm green, amber as the target nears, rose once it is passed. */
function TimerRing({ seconds, target }: { seconds: number; target: number }) {
  const fraction = Math.min(1, seconds / Math.max(1, target));
  const over = seconds > target;
  const colour = over ? "#fb7185" : fraction > 0.75 ? "#fbbf24" : "#34d399";
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="flex items-center gap-3">
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r={radius} fill="none" stroke="rgba(167,139,250,0.25)" strokeWidth="5" />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform="rotate(-90 26 26)"
          style={{ transition: "stroke-dashoffset 0.3s linear, stroke 0.4s ease", filter: `drop-shadow(0 0 4px ${colour})` }}
        />
        <text x="26" y="30" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">
          {seconds}
        </text>
      </svg>
      <span className="text-sm">
        Time: <strong>{seconds}s</strong> / target {target}s
        {over && <span className="ml-2 text-rose-300">over target</span>}
      </span>
    </div>
  );
}

/** Counts up to the score, unless the person prefers reduced motion. */
function useCountUp(target: number, ms = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

function Sparkles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden="true">
      {Array.from({ length: 14 }, (_, index) => (
        <span
          key={index}
          className="sparkle"
          style={{ left: `${6 + ((index * 53) % 88)}%`, top: `${10 + ((index * 29) % 70)}%`, animationDelay: `${(index % 7) * 110}ms` }}
        >
          ✦
        </span>
      ))}
    </div>
  );
}

function ResultScore({ score, name }: { score: number; name: string }) {
  const shown = useCountUp(Math.round(score * 100));
  return (
    <h2 className="text-3xl font-bold">
      <span className="sr-only">{Math.round(score * 100)}%</span>
      <span aria-hidden="true" className="title-glow">
        {shown}%
      </span>{" "}
      on {name}
    </h2>
  );
}

export function RecipeBuilder({ recipe, options, backHref, nextHref }: RecipeBuilderProps) {
  const [phase, setPhase] = useState<"study" | "build" | "result">("study");
  const [placed, setPlaced] = useState<string[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const events = useRef<BuildEvent[]>([]);
  const startedAt = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    if (phase !== "build") return;
    const timer = setInterval(() => setSeconds(Math.floor((performance.now() - startedAt.current) / 1000)), 250);
    return () => clearInterval(timer);
  }, [phase]);

  function startBuild() {
    events.current = [];
    startedAt.current = performance.now();
    setPlaced([]);
    setPulse(0);
    setSeconds(0);
    setError(null);
    setResult(null);
    setPhase("build");
  }

  function add(item: string) {
    if (phase !== "build" || placed.includes(item)) return;
    events.current.push({ type: "add", item, atMs: Math.round(performance.now() - startedAt.current) });
    setPlaced((current) => [...current, item]);
    setPulse((count) => count + 1);
  }

  function remove(item: string) {
    if (phase !== "build") return;
    events.current.push({ type: "remove", item, atMs: Math.round(performance.now() - startedAt.current) });
    setPlaced((current) => current.filter((entry) => entry !== item));
  }

  function onDragEnd(event: DragEndEvent) {
    if (event.over?.id === "plate") add(String(event.active.id));
  }

  async function serve() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/training/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipeId: recipe.id,
          events: events.current,
          elapsedMs: Math.round(performance.now() - startedAt.current),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not score that build.");
      setResult(body as Result);
      setPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not score that build.");
    } finally {
      setSubmitting(false);
    }
  }

  const stationLabel = recipe.station === "drink" ? "drink" : "dish";

  return (
    <div className="flex flex-col gap-6">
      {phase === "study" && (
        <section className="spellbook rounded-xl border border-amber-200/25 bg-violet-950/50 p-6">
          <h2 className="text-xl font-semibold">
            <span aria-hidden="true">📖 </span>Study the recipe
          </h2>
          <p className="mt-1 text-sm text-violet-200">
            Learn the ingredients and their order. Next you will build this {stationLabel} from memory against a{" "}
            {recipe.targetSeconds}-second target.
          </p>
          <ol className="mt-4 space-y-2">
            {recipe.ingredients.map(({ item, quantity }, index) => (
              <li
                key={item}
                className="study-line flex items-center gap-3 rounded-lg bg-violet-900/40 px-3 py-2"
                style={{ animationDelay: `${index * 110}ms` }}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-xs font-bold text-emerald-200">
                  {index + 1}
                </span>
                <span aria-hidden="true">{ingredientIcon(item)}</span>
                <span>
                  {item}
                  {quantity && <span className="text-violet-300"> ({quantity})</span>}
                </span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={startBuild}
            className="ready-button mt-6 rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-5 py-2.5 font-semibold text-emerald-950"
          >
            I am ready, start building
          </button>
        </section>
      )}

      {phase === "build" && (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex items-center justify-between text-sm">
            <TimerRing seconds={seconds} target={recipe.targetSeconds} />
            <span>{placed.length} placed</span>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <section>
              <h2 className="mb-2 font-semibold">Ingredients</h2>
              <div className="flex flex-wrap gap-2">
                {options.map((item) => (
                  <Chip key={item} item={item} disabled={placed.includes(item)} onPick={add} />
                ))}
              </div>
              <p className="mt-3 text-xs text-violet-300">Drag onto the plate, or click an ingredient to add it.</p>
            </section>
            <section>
              <h2 className="mb-2 font-semibold">Your {recipe.name}</h2>
              <Plate empty={placed.length === 0} station={recipe.station} pulse={pulse}>
                <ol className="space-y-2">
                  {placed.map((item, index) => (
                    <li key={item} className="placed-item flex items-center justify-between rounded-lg bg-violet-800/60 px-3 py-1.5">
                      <span>
                        {index + 1}. <span aria-hidden="true">{ingredientIcon(item)}</span> {item}
                      </span>
                      <button type="button" aria-label={`Remove ${item}`} onClick={() => remove(item)} className="px-2 text-violet-200">
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
              </Plate>
              {error && (
                <p role="alert" className="mt-2 text-sm text-red-300">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={serve}
                disabled={submitting || placed.length === 0}
                className="serve-button mt-4 rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-5 py-2.5 font-semibold text-emerald-950 disabled:opacity-50"
              >
                {submitting ? (<><Spinner />Judging...</>) : `Serve the ${stationLabel}`}
              </button>
            </section>
          </div>
        </DndContext>
      )}

      {phase === "result" && result && (
        <section className="relative rounded-xl border border-violet-400/40 bg-violet-950/40 p-6" aria-live="polite">
          {result.score >= 0.8 && <Sparkles />}
          <ResultScore score={result.score} name={recipe.name} />
          <p className="mt-1 text-sm text-violet-200">
            Accuracy {Math.round(result.accuracy * 100)}% · Speed {Math.round(result.speed * 100)}% ·{" "}
            {result.judgedBy === "gemini" ? "judged by your AI trainer" : "scored from the build log"}
          </p>
          <p className="mt-3">{result.coaching}</p>
          {result.mistakes.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
              {result.mistakes.map((mistake) => (
                <li key={mistake}>{mistake}</li>
              ))}
            </ul>
          )}
          <div className="mt-5">
            <MasteryBar score={result.mastery.score} label={`${recipe.station === "drink" ? "Drinks" : "Food"} mastery`} />
            {result.mastery.certified && (
              <p className="mt-2 text-sm text-amber-200">✦ Certified! You can now be scheduled on this station.</p>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/employee/evaluation" className="rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-500 px-4 py-2 font-semibold text-emerald-950">
              View my evaluation
            </Link>
            <button type="button" onClick={() => setPhase("study")} className="rounded-lg border border-violet-400/50 px-4 py-2">
              Try again
            </button>
            {nextHref && (
              <Link href={nextHref} className="rounded-lg border border-violet-400/50 px-4 py-2">
                Next recipe
              </Link>
            )}
            <Link href={backHref} className="rounded-lg border border-violet-400/50 px-4 py-2">
              Back to recipes
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
