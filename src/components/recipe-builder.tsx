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
import { useEffect, useRef, useState } from "react";

import { MasteryBar } from "@/components/mastery-bar";

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
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
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
      className={`touch-none rounded-full border px-3 py-1.5 text-sm ${
        disabled
          ? "border-violet-900 bg-violet-950/40 text-violet-400/50"
          : "cursor-grab border-violet-400/60 bg-violet-900/60 hover:bg-violet-800"
      } ${isDragging ? "z-10 opacity-80 shadow-lg" : ""}`}
    >
      {item}
    </button>
  );
}

function Plate({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "plate" });
  return (
    <div
      ref={setNodeRef}
      aria-label="Plate"
      className={`min-h-48 rounded-lg border-2 border-dashed p-3 ${
        isOver ? "border-emerald-300 bg-emerald-900/20" : "border-violet-400/50 bg-violet-950/40"
      }`}
    >
      {empty ? <p className="py-10 text-center text-sm text-violet-300">Drag ingredients here, in order.</p> : children}
    </div>
  );
}

export function RecipeBuilder({ recipe, options, backHref, nextHref }: RecipeBuilderProps) {
  const [phase, setPhase] = useState<"study" | "build" | "result">("study");
  const [placed, setPlaced] = useState<string[]>([]);
  const [seconds, setSeconds] = useState(0);
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
    setSeconds(0);
    setError(null);
    setResult(null);
    setPhase("build");
  }

  function add(item: string) {
    if (phase !== "build" || placed.includes(item)) return;
    events.current.push({ type: "add", item, atMs: Math.round(performance.now() - startedAt.current) });
    setPlaced((current) => [...current, item]);
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
        <section className="rounded-lg border border-violet-400/40 bg-violet-950/40 p-5">
          <h2 className="text-lg font-semibold">Study the recipe</h2>
          <p className="mt-1 text-sm text-violet-200">
            Learn the ingredients and their order. Next you will build this {stationLabel} from memory against a{" "}
            {recipe.targetSeconds}-second target.
          </p>
          <ol className="mt-4 list-decimal space-y-1 pl-6">
            {recipe.ingredients.map(({ item, quantity }) => (
              <li key={item}>
                {item}
                {quantity && <span className="text-violet-300"> ({quantity})</span>}
              </li>
            ))}
          </ol>
          <button type="button" onClick={startBuild} className="mt-5 rounded bg-violet-500 px-4 py-2 font-semibold text-white">
            I am ready, start building
          </button>
        </section>
      )}

      {phase === "build" && (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex items-center justify-between text-sm">
            <span>
              Time: <strong>{seconds}s</strong> / target {recipe.targetSeconds}s
            </span>
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
              <Plate empty={placed.length === 0}>
                <ol className="space-y-2">
                  {placed.map((item, index) => (
                    <li key={item} className="flex items-center justify-between rounded bg-violet-800/60 px-3 py-1.5">
                      <span>
                        {index + 1}. {item}
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
                className="mt-4 rounded bg-emerald-500 px-4 py-2 font-semibold text-black disabled:opacity-50"
              >
                {submitting ? "Judging..." : `Serve the ${stationLabel}`}
              </button>
            </section>
          </div>
        </DndContext>
      )}

      {phase === "result" && result && (
        <section className="rounded-lg border border-violet-400/40 bg-violet-950/40 p-5" aria-live="polite">
          <h2 className="text-2xl font-bold">
            {Math.round(result.score * 100)}% on {recipe.name}
          </h2>
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
              <p className="mt-2 text-sm text-emerald-300">Certified! You can now be scheduled on this station.</p>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => setPhase("study")} className="rounded border border-violet-400/50 px-4 py-2">
              Try again
            </button>
            {nextHref && (
              <Link href={nextHref} className="rounded bg-violet-500 px-4 py-2 font-semibold text-white">
                Next recipe
              </Link>
            )}
            <Link href={backHref} className="rounded border border-violet-400/50 px-4 py-2">
              Back to recipes
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
