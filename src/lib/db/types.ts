export type Station = "food" | "drink" | "cs";
export type ShiftSlot = "open" | "mid" | "close";
export type AssignmentRole = "anchor" | "shadow";

export type RecipeIngredient = { item: string; quantity?: string };
export type RecipeIngredients = RecipeIngredient[];
export type StationRequirements = Record<Station, number>;

export type TranscriptTurn = {
  speaker: "employee" | "customer" | "system";
  text: string;
  timestamp?: number;
};

export type RubricDimension = { score: number; justification: string };
export type CustomerServiceRubric = {
  greeting_and_warmth: RubricDimension;
  order_accuracy: RubricDimension;
  deescalation_and_empathy: RubricDimension;
  problem_resolution: RubricDimension;
  professional_tone: RubricDimension;
  upsell_or_suggestion: RubricDimension;
  score: number;
};
