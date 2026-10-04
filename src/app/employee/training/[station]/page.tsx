import Link from "next/link";
import { notFound } from "next/navigation";

import { MasteryBar } from "@/components/mastery-bar";
import { requireEmployee } from "@/lib/require-user";
import { getMastery, getRecipeProgress, isTrainingStation, listRecipes, STATION_LABELS } from "@/lib/training/data";

export const dynamic = "force-dynamic";

export default async function ChapterPage({ params }: { params: Promise<{ station: string }> }) {
  const { station } = await params;
  if (!isTrainingStation(station)) notFound();
  const user = await requireEmployee();

  const recipes = listRecipes(station).sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name));
  const progress = getRecipeProgress(user.id, station);
  const mastery = getMastery(user.id)[station];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header>
        <Link href="/employee/training" className="text-sm text-violet-300">
          ← All chapters
        </Link>
        <h1 className="mb-4 mt-2 text-2xl font-bold">{STATION_LABELS[station]} chapter</h1>
        <MasteryBar score={mastery?.score ?? null} label="Chapter mastery" />
      </header>

      <ul className="grid gap-3">
        {recipes.map((recipe) => {
          const entry = progress.get(recipe.id);
          return (
            <li key={recipe.id}>
              <Link
                href={`/employee/training/${station}/${recipe.id}`}
                className="lift-card flex items-center justify-between gap-3 rounded-xl border border-violet-400/40 bg-violet-950/40 p-4 hover:bg-violet-900/40"
              >
                <span>
                  <span className="font-semibold">{recipe.name}</span>
                  <span className="ml-3 whitespace-nowrap text-sm" role="img" aria-label={`Difficulty ${recipe.difficulty} of 3`}>
                    {[1, 2, 3].map((level) => (
                      <span key={level} className={level <= recipe.difficulty ? "" : "opacity-20 grayscale"}>
                        🧪
                      </span>
                    ))}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-sm text-violet-200">
                  {entry && entry.best >= 0.8 && (
                    <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-xs font-semibold text-amber-200">✦ Certified</span>
                  )}
                  {entry ? `Best ${Math.round(entry.best * 100)}% · ${entry.count} tries` : "Not tried"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
