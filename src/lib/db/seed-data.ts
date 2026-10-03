import type { DemoSeed } from "./seed";
import type { RecipeIngredients, ShiftSlot, Station, StationRequirements } from "./types";
import { SLOT_TIMES } from "../slots";

/**
 * Deterministic demo content for Conjuring Cauldron: recipes, staff, skills,
 * availability and next week's open shifts. Fixed ids and dates so Reset Demo
 * always reproduces the same state.
 */

export const DEMO_NOW = "2026-10-03T09:00:00.000Z"; // Saturday
const FIRST_SHIFT_DATE = "2026-10-04"; // Sunday; day_of_week 0

type RecipeDef = {
  id: string;
  name: string;
  station: "food" | "drink";
  targetSeconds: number;
  difficulty: number;
  ingredients: RecipeIngredients;
};

const recipeDefs: RecipeDef[] = [
  {
    id: "cauldron-burger", name: "Cauldron Burger", station: "food", targetSeconds: 45, difficulty: 2,
    ingredients: [
      { item: "Bottom bun" }, { item: "Bat-wing patty" }, { item: "Goblin cheese", quantity: "1 slice" },
      { item: "Swamp lettuce" }, { item: "Toadstool slices", quantity: "3" }, { item: "Top bun" },
    ],
  },
  {
    id: "broomstick-fries", name: "Broomstick Fries", station: "food", targetSeconds: 30, difficulty: 1,
    ingredients: [
      { item: "Fry basket" }, { item: "Potato sticks", quantity: "1 scoop" }, { item: "Fry in cauldron oil" },
      { item: "Salt" }, { item: "Spice dust" },
    ],
  },
  {
    id: "eye-of-newt-tacos", name: "Eye of Newt Tacos", station: "food", targetSeconds: 50, difficulty: 2,
    ingredients: [
      { item: "Tortilla" }, { item: "Spiced beans" }, { item: "Newt-eye salsa" },
      { item: "Shredded lettuce" }, { item: "Crema" },
    ],
  },
  {
    id: "raven-wrap", name: "Raven Wrap", station: "food", targetSeconds: 55, difficulty: 3,
    ingredients: [
      { item: "Wrap" }, { item: "Pumpkin spread" }, { item: "Grilled raven strips", quantity: "4" },
      { item: "Greens" }, { item: "Fold and seal" },
    ],
  },
  {
    id: "gingerbread-hut-sundae", name: "Gingerbread Hut Sundae", station: "food", targetSeconds: 40, difficulty: 1,
    ingredients: [
      { item: "Sundae cup" }, { item: "Vanilla cream", quantity: "2 scoops" }, { item: "Gingerbread crumble" },
      { item: "Caramel drizzle" }, { item: "Cherry" },
    ],
  },
  {
    id: "mandrake-mac", name: "Mandrake Mac", station: "food", targetSeconds: 60, difficulty: 3,
    ingredients: [
      { item: "Bowl" }, { item: "Mandrake pasta" }, { item: "Moonlight cheese sauce" }, { item: "Crispy breadcrumbs" },
    ],
  },
  {
    id: "love-potion-latte", name: "Love Potion Latte", station: "drink", targetSeconds: 50, difficulty: 3,
    ingredients: [
      { item: "Cup" }, { item: "Rose syrup", quantity: "1 pump" }, { item: "Espresso", quantity: "2 shots" },
      { item: "Steamed milk" }, { item: "Heart foam" },
    ],
  },
  {
    id: "dragons-breath-cider", name: "Dragon's Breath Cider", station: "drink", targetSeconds: 40, difficulty: 2,
    ingredients: [
      { item: "Chili-rimmed cup" }, { item: "Hot apple cider" }, { item: "Cinnamon stick" }, { item: "Orange peel" },
    ],
  },
  {
    id: "moonwater-fizz", name: "Moonwater Fizz", station: "drink", targetSeconds: 30, difficulty: 1,
    ingredients: [
      { item: "Cup" }, { item: "Ice" }, { item: "Blueberry syrup" }, { item: "Sparkling water" }, { item: "Silver sprinkles" },
    ],
  },
  {
    id: "polyjuice-smoothie", name: "Polyjuice Smoothie", station: "drink", targetSeconds: 55, difficulty: 3,
    ingredients: [
      { item: "Blender jar" }, { item: "Green apple" }, { item: "Spinach" }, { item: "Banana" }, { item: "Ice" }, { item: "Blend" },
    ],
  },
  {
    id: "witchs-brew-cold-brew", name: "Witch's Brew Cold Brew", station: "drink", targetSeconds: 35, difficulty: 2,
    ingredients: [
      { item: "Cup" }, { item: "Ice" }, { item: "Cold brew" }, { item: "Black cat vanilla" }, { item: "Cream swirl" },
    ],
  },
  {
    id: "elixir-of-calm-tea", name: "Elixir of Calm Tea", station: "drink", targetSeconds: 35, difficulty: 1,
    ingredients: [
      { item: "Mug" }, { item: "Chamomile tea bag" }, { item: "Hot water" }, { item: "Honey" }, { item: "Lemon slice" },
    ],
  },
];

type Window = { days: number[]; start: string; end: string };
const ALL = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

type StaffDef = {
  id: string;
  name: string;
  role: "employee" | "manager";
  isNew: boolean;
  cap: number;
  avatar: string;
  skills: Partial<Record<Station, number>>;
  windows: Window[];
};

// Day of week: 0 = Sunday ... 6 = Saturday.
const staff: StaffDef[] = [
  { id: "morgana", name: "Morgana", role: "manager", isNew: false, cap: 40, avatar: "🔮", skills: {}, windows: [] },
  { id: "elowen", name: "Elowen", role: "employee", isNew: false, cap: 40, avatar: "🧙‍♀️", skills: { food: 0.92, drink: 0.85, cs: 0.7 }, windows: [{ days: ALL, start: "07:00", end: "21:00" }] },
  { id: "rook", name: "Rook", role: "employee", isNew: false, cap: 30, avatar: "🐦‍⬛", skills: { food: 0.88, drink: 0.4, cs: 0.55 }, windows: [{ days: WEEKDAYS, start: "07:00", end: "21:00" }] },
  { id: "bram", name: "Bram", role: "employee", isNew: false, cap: 24, avatar: "🧪", skills: { food: 0.35, drink: 0.9, cs: 0.5 }, windows: [{ days: ALL, start: "15:00", end: "21:00" }] },
  { id: "selene", name: "Selene", role: "employee", isNew: false, cap: 20, avatar: "🌙", skills: { food: 0.3, drink: 0.86, cs: 0.45 }, windows: [{ days: WEEKEND, start: "07:00", end: "21:00" }, { days: [5], start: "15:00", end: "21:00" }] },
  { id: "tamsin", name: "Tamsin", role: "employee", isNew: false, cap: 24, avatar: "🍵", skills: { food: 0.45, drink: 0.82, cs: 0.6 }, windows: [{ days: ALL, start: "07:00", end: "15:00" }] },
  { id: "hazel", name: "Hazel", role: "employee", isNew: false, cap: 32, avatar: "🎃", skills: { food: 0.5, drink: 0.55, cs: 0.91 }, windows: [{ days: [2, 3, 4, 5, 6], start: "07:00", end: "21:00" }] },
  { id: "odette", name: "Odette", role: "employee", isNew: false, cap: 36, avatar: "🦉", skills: { food: 0.84, drink: 0.8, cs: 0.82 }, windows: [{ days: ALL, start: "07:00", end: "21:00" }] },
  { id: "isolde", name: "Isolde", role: "employee", isNew: false, cap: 28, avatar: "🕯️", skills: { food: 0.83, drink: 0.5, cs: 0.81 }, windows: [{ days: [3, 4, 5, 6, 0], start: "07:00", end: "21:00" }] },
  { id: "juniper", name: "Juniper", role: "employee", isNew: false, cap: 24, avatar: "🌿", skills: { food: 0.55, drink: 0.84, cs: 0.52 }, windows: [{ days: WEEKDAYS, start: "07:00", end: "21:00" }] },
  { id: "corvin", name: "Corvin", role: "employee", isNew: false, cap: 28, avatar: "🪄", skills: { food: 0.81, drink: 0.45, cs: 0.84 }, windows: [{ days: [6, 0, 1, 2], start: "07:00", end: "21:00" }] },
  { id: "sorrel", name: "Sorrel", role: "employee", isNew: false, cap: 24, avatar: "🍄", skills: { food: 0.86, drink: 0.82, cs: 0.55 }, windows: [{ days: [1, 2, 3, 4, 5], start: "15:00", end: "21:00" }, { days: [6, 0], start: "07:00", end: "21:00" }] },
  { id: "briar", name: "Briar", role: "employee", isNew: false, cap: 24, avatar: "🌹", skills: { food: 0.55, drink: 0.81, cs: 0.83 }, windows: [{ days: [2, 3, 4, 5, 6], start: "07:00", end: "21:00" }] },
  { id: "quill", name: "Quill", role: "employee", isNew: false, cap: 24, avatar: "🪶", skills: { food: 0.84, drink: 0.5, cs: 0.82 }, windows: [{ days: [4, 5, 6, 0, 1], start: "07:00", end: "21:00" }] },
  { id: "finch", name: "Finch", role: "employee", isNew: true, cap: 20, avatar: "🐣", skills: {}, windows: [{ days: ALL, start: "07:00", end: "21:00" }] },
  { id: "wren", name: "Wren", role: "employee", isNew: true, cap: 16, avatar: "🪶", skills: { food: 0.6 }, windows: [{ days: WEEKEND, start: "07:00", end: "21:00" }, { days: [1, 3, 5], start: "15:00", end: "21:00" }] },
];

const STATIONS: Station[] = ["food", "drink", "cs"];

function isoDaysAgo(days: number) {
  return new Date(Date.parse(DEMO_NOW) - days * 86_400_000).toISOString();
}

function clamp01(n: number) {
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

function coaching(station: Station, score: number) {
  const area = station === "cs" ? "customer service" : station;
  if (score >= 0.8) return `Strong ${area} work. Keep the pace steady and you are ready for solo shifts.`;
  if (score >= 0.6) return `Solid start on ${area}. Review the recipe order and speed up the final steps.`;
  return `${area} needs more practice. Repeat the training chapter before taking solo shifts.`;
}

function buildShifts() {
  const shifts: DemoSeed["shifts"] = [];
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(Date.parse(`${FIRST_SHIFT_DATE}T00:00:00.000Z`) + offset * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const weekend = offset === 0 || offset === 6; // FIRST_SHIFT_DATE is a Sunday
    const required: Record<ShiftSlot, StationRequirements> = {
      open: { food: 1, drink: 1, cs: 0 }, // prep shift, the register opens at mid
      mid: weekend ? { food: 2, drink: 1, cs: 1 } : { food: 1, drink: 1, cs: 1 },
      close: { food: 1, drink: 1, cs: 1 },
    };
    for (const slot of Object.keys(SLOT_TIMES) as ShiftSlot[]) {
      shifts.push({
        id: `shift-${date}-${slot}`,
        date,
        slot,
        requiredJson: JSON.stringify(required[slot]),
      });
    }
  }
  return shifts;
}

export function buildDemoSeed(): DemoSeed {
  const recipes = recipeDefs.map((r) => ({
    id: r.id,
    name: r.name,
    station: r.station,
    ingredientsJson: JSON.stringify(r.ingredients),
    targetSeconds: r.targetSeconds,
    difficulty: r.difficulty,
  }));

  const employeeRows = staff.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    isNew: s.isNew,
    hoursCapWeekly: s.cap,
    avatar: s.avatar,
    createdAt: isoDaysAgo(s.isNew ? 0 : 60),
  }));

  const availability = staff.flatMap((s) =>
    s.windows.flatMap((w) =>
      w.days.map((day) => ({
        id: `avail-${s.id}-${day}-${w.start.replace(":", "")}`,
        employeeId: s.id,
        dayOfWeek: day,
        startTime: w.start,
        endTime: w.end,
      })),
    ),
  );

  const mastery: DemoSeed["mastery"] = [];
  const attempts: DemoSeed["attempts"] = [];
  staff.forEach((s, index) => {
    for (const station of STATIONS) {
      const score = s.skills[station];
      if (score === undefined) continue;
      const attemptCount = s.isNew ? 1 : 2;
      mastery.push({
        id: `mastery-${s.id}-${station}`,
        employeeId: s.id,
        station,
        score,
        attempts: attemptCount,
        lastTrainedAt: isoDaysAgo(1 + (index % 3)),
      });
      const pool = recipes.filter((r) => r.station === station);
      for (let n = 0; n < attemptCount; n++) {
        const attemptScore = clamp01(score + (n === 0 ? -0.04 : 0.04));
        attempts.push({
          id: `attempt-${s.id}-${station}-${n + 1}`,
          employeeId: s.id,
          station,
          recipeId: pool.length ? pool[(index + n) % pool.length].id : undefined,
          score: attemptScore,
          feedbackJson: JSON.stringify({ source: "seed", coaching: coaching(station, attemptScore) }),
          durationSeconds: station === "cs" ? 240 : 40 + ((index * 7 + n * 5) % 30),
          createdAt: isoDaysAgo(4 - n + (index % 2)),
        });
      }
    }
  });

  const messages: DemoSeed["messages"] = [
    {
      id: "msg-finch-welcome", employeeId: "finch", kind: "welcome", read: false, createdAt: DEMO_NOW,
      body: "Welcome to Conjuring Cauldron! Start with any chapter: Food, Drinks, or Customer Service. Reach 80% in one station and you will be added to the schedule.",
    },
    {
      id: "msg-wren-welcome", employeeId: "wren", kind: "welcome", read: false, createdAt: DEMO_NOW,
      body: "Nice start on Food, Wren! Keep practicing to reach 80%, or begin Drinks or Customer Service.",
    },
  ];

  return {
    employees: employeeRows,
    availability,
    recipes,
    mastery,
    callSessions: [],
    attempts,
    shifts: buildShifts(),
    assignments: [],
    calloffs: [],
    calloffCandidates: [],
    messages,
    demoClock: { id: 1, now: DEMO_NOW },
  };
}
