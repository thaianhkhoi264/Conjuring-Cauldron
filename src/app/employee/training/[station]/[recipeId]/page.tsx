import Link from "next/link";
import { notFound } from "next/navigation";

import { RecipeBuilder } from "@/components/recipe-builder";
import { requireEmployee } from "@/lib/require-user";
import { getBuildOptions, getRecipe, isTrainingStation, listRecipes, shuffled } from "@/lib/training/data";

export const dynamic = "force-dynamic";

export default async function RecipeTrainingPage({
  params,
}: {
  params: Promise<{ station: string; recipeId: string }>;
}) {
  const { station, recipeId } = await params;
  if (!isTrainingStation(station)) notFound();
  await requireEmployee();

  const recipe = getRecipe(recipeId);
  if (!recipe || recipe.station !== station) notFound();

  const ordered = listRecipes(station).sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name));
  const index = ordered.findIndex((r) => r.id === recipe.id);
  const next = ordered[(index + 1) % ordered.length];
  const backHref = `/employee/training/${station}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <header>
        <Link href={backHref} className="text-sm text-violet-300">
          ← All recipes
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{recipe.name}</h1>
      </header>
      <RecipeBuilder
        key={recipe.id}
        recipe={{
          id: recipe.id,
          name: recipe.name,
          station: recipe.station,
          targetSeconds: recipe.targetSeconds,
          ingredients: recipe.ingredients,
        }}
        options={shuffled(getBuildOptions(recipe))}
        backHref={backHref}
        nextHref={next && next.id !== recipe.id ? `${backHref}/${next.id}` : undefined}
      />
    </main>
  );
}
