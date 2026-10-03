import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attempts, mastery, recipes } from "@/lib/db/schema";
import type { RecipeIngredients, Station } from "@/lib/db/types";

export type TrainingStation = "food" | "drink";

export const STATION_LABELS: Record<Station, string> = {
  food: "Food",
  drink: "Drinks",
  cs: "Customer Service",
};

export function isTrainingStation(value: string): value is TrainingStation {
  return value === "food" || value === "drink";
}

export type TrainingRecipe = {
  id: string;
  name: string;
  station: TrainingStation;
  targetSeconds: number;
  difficulty: number;
  ingredients: RecipeIngredients;
};

function toRecipe(row: typeof recipes.$inferSelect): TrainingRecipe {
  return {
    id: row.id,
    name: row.name,
    station: row.station,
    targetSeconds: row.targetSeconds,
    difficulty: row.difficulty,
    ingredients: JSON.parse(row.ingredientsJson) as RecipeIngredients,
  };
}

export function getRecipe(id: string): TrainingRecipe | undefined {
  const row = db.select().from(recipes).where(eq(recipes.id, id)).get();
  return row ? toRecipe(row) : undefined;
}

export function listRecipes(station: TrainingStation): TrainingRecipe[] {
  return db.select().from(recipes).where(eq(recipes.station, station)).all().map(toRecipe);
}

/** Every ingredient name that may legitimately appear in a build for this station. */
export function getIngredientPool(station: TrainingStation): string[] {
  const pool = new Set<string>();
  for (const recipe of listRecipes(station)) for (const { item } of recipe.ingredients) pool.add(item);
  return [...pool];
}

function stableHash(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return hash;
}

/**
 * Ingredients shown to the trainee: the recipe's own items plus a few decoys from
 * other recipes at the same station. Decoys are picked deterministically per recipe.
 */
export function getBuildOptions(recipe: TrainingRecipe, decoyCount = 5): string[] {
  const own = new Set(recipe.ingredients.map((i) => i.item));
  const decoys = getIngredientPool(recipe.station)
    .filter((item) => !own.has(item))
    .sort((a, b) => stableHash(recipe.id + a) - stableHash(recipe.id + b))
    .slice(0, decoyCount);
  return [...own, ...decoys];
}

export function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getMastery(employeeId: string): Record<Station, { score: number; attempts: number } | null> {
  const rows = db.select().from(mastery).where(eq(mastery.employeeId, employeeId)).all();
  const result: Record<Station, { score: number; attempts: number } | null> = { food: null, drink: null, cs: null };
  for (const row of rows) result[row.station] = { score: row.score, attempts: row.attempts };
  return result;
}

/** Best and latest score per recipe for this employee. */
export function getRecipeProgress(employeeId: string, station: TrainingStation) {
  const rows = db
    .select({ recipeId: attempts.recipeId, score: attempts.score, createdAt: attempts.createdAt })
    .from(attempts)
    .where(and(eq(attempts.employeeId, employeeId), eq(attempts.station, station)))
    .all();
  const progress = new Map<string, { best: number; count: number }>();
  for (const row of rows) {
    if (!row.recipeId) continue;
    const entry = progress.get(row.recipeId) ?? { best: 0, count: 0 };
    entry.best = Math.max(entry.best, row.score);
    entry.count += 1;
    progress.set(row.recipeId, entry);
  }
  return progress;
}
