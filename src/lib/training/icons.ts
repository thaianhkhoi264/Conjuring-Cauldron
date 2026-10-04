/** A small emoji for each ingredient, picked by keyword. Decorative only: the name is always shown beside it. */
const ICONS: [RegExp, string][] = [
  [/bat-wing|patty/i, "🦇"],
  [/raven/i, "🐦‍⬛"],
  [/cheese/i, "🧀"],
  [/bun/i, "🍞"],
  [/tortilla|wrap|fold/i, "🌯"],
  [/pasta/i, "🍝"],
  [/potato|fry|fries/i, "🍟"],
  [/lettuce|greens|spinach/i, "🥬"],
  [/toadstool|mushroom/i, "🍄"],
  [/salsa|chili|spice|spiced/i, "🌶️"],
  [/bean/i, "🫘"],
  [/salt/i, "🧂"],
  [/breadcrumb|crumble|gingerbread/i, "🍪"],
  [/pumpkin/i, "🎃"],
  [/sprinkle|silver|sparkling|glitter/i, "✨"],
  [/ice/i, "🧊"],
  [/espresso|cold brew|crema|coffee/i, "☕"],
  [/tea/i, "🫖"],
  [/milk|cream|foam|vanilla/i, "🥛"],
  [/honey/i, "🍯"],
  [/rose|heart/i, "🌹"],
  [/blueberry/i, "🫐"],
  [/cherry/i, "🍒"],
  [/banana/i, "🍌"],
  [/apple|cider/i, "🍎"],
  [/lemon|orange/i, "🍋"],
  [/cinnamon/i, "🪵"],
  [/caramel|syrup|drizzle/i, "🍮"],
  [/blend/i, "🌀"],
  [/water/i, "💧"],
  [/sundae|cup|mug|jar|bowl|basket/i, "🥣"],
];

export function ingredientIcon(name: string): string {
  return ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? "🔮";
}
