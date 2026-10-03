export type VoiceScenario = {
  id: "routine-order" | "wrong-order" | "allergy" | "delivery-rush";
  title: string;
  customerName: string;
  firstMessage: string;
  goal: string;
  guardrails: string[];
  fallbackTranscript: { speaker: "customer" | "employee"; text: string }[];
};

export const restaurantContext = `
Conjuring Cauldron is a friendly witch-themed fast-casual restaurant. Customers
include witches, covens, and familiars. Menu highlights: Cauldron Burger
(bat-wing patty, swamp lettuce, toadstool slices, goblin cheese), Mandrake Mac
(mandrake pasta, moonlight cheese sauce, crispy breadcrumbs), Love Potion Latte
(espresso, steamed milk, rose syrup, heart foam), and Dragon's Breath Cider
(hot apple cider, cinnamon, chili rim, orange peel).

House policy: remake an incorrect or cold item at no charge; a manager may comp
one item for a substantial service failure; do not promise a refund for a cursed
item; never guess about allergens. Mandrake Mac contains dairy from moonlight
cheese sauce. Stay warm, whimsical, and concise, but do not break character.
`;

export const voiceScenarios: VoiceScenario[] = [
  {
    id: "routine-order",
    title: "A friendly first order",
    customerName: "Aster",
    firstMessage: "Hello! I am Aster of the Juniper Coven. Could I order a Cauldron Burger and a Love Potion Latte?",
    goal: "Give a warm greeting, clarify any questions, repeat the complete order, and make a gentle suggestion.",
    guardrails: ["Ask whether the guest needs any changes before confirming.", "Do not invent menu ingredients."],
    fallbackTranscript: [
      { speaker: "customer", text: "Could I get a Cauldron Burger and a Love Potion Latte?" },
      { speaker: "employee", text: "Welcome to Conjuring Cauldron! I can do that. The burger has bat-wing patty, swamp lettuce, toadstools, and goblin cheese. Would you like fries with it?" },
      { speaker: "customer", text: "No fries today." },
      { speaker: "employee", text: "Of course. I have one Cauldron Burger and one Love Potion Latte, no fries. We will have that brewing shortly." },
    ],
  },
  {
    id: "wrong-order",
    title: "Cold Dragon's Breath Cider",
    customerName: "Mirella",
    firstMessage: "My Dragon's Breath Cider is cold. Cold! I flew through a thunderstorm for that drink.",
    goal: "De-escalate, acknowledge the frustration, apologize, and offer the policy-approved remake.",
    guardrails: ["Do not blame the guest or another employee.", "Offer a remake; a comp requires a substantial service failure or manager approval."],
    fallbackTranscript: [
      { speaker: "customer", text: "My Dragon's Breath Cider is cold. This is unacceptable." },
      { speaker: "employee", text: "I am sorry we served it that way, especially after your flight. I will remake the cider hot at no charge right away." },
      { speaker: "customer", text: "How long will that take?" },
      { speaker: "employee", text: "Just a few minutes. I will personally check that it is hot before bringing it out." },
    ],
  },
  {
    id: "allergy",
    title: "Coven dairy question",
    customerName: "Rowan",
    firstMessage: "A member of my coven cannot have dairy. Is the Mandrake Mac safe for her?",
    goal: "Answer honestly about dairy, demonstrate care, and suggest a safe next step without guessing.",
    guardrails: ["Mandrake Mac contains dairy.", "Do not guarantee a dish is allergen-free without checking."],
    fallbackTranscript: [
      { speaker: "customer", text: "Is the Mandrake Mac safe for someone who cannot have dairy?" },
      { speaker: "employee", text: "I am glad you asked. It contains moonlight cheese sauce, so it has dairy and would not be a safe choice. I can help you look at another option and check ingredients with the kitchen." },
      { speaker: "customer", text: "Thank you for telling me." },
    ],
  },
  {
    id: "delivery-rush",
    title: "Impatient broomstick delivery",
    customerName: "Pip",
    firstMessage: "I have three deliveries before the moon crosses the chimney. Is my order ready or not?",
    goal: "Stay composed through interruptions, confirm the order status, and give a clear next step.",
    guardrails: ["Do not promise an unsupported wait time.", "Keep the response direct and professional."],
    fallbackTranscript: [
      { speaker: "customer", text: "Is my order ready or not? I am late!" },
      { speaker: "employee", text: "I understand you are in a rush. Let me confirm your order status now so I can give you an accurate update." },
      { speaker: "customer", text: "Please hurry." },
      { speaker: "employee", text: "Absolutely. I will check with the kitchen and return with the next step right away." },
    ],
  },
];

export function getVoiceScenario(id: string) {
  return voiceScenarios.find((scenario) => scenario.id === id);
}

export function buildVoiceSystemPrompt(scenario: VoiceScenario) {
  return `${restaurantContext}\nYou are ${scenario.customerName}, a witch customer in a training call. ${scenario.goal}\nScenario behavior: ${scenario.guardrails.join(" ")} Start with: \"${scenario.firstMessage}\". Respond naturally, give the trainee opportunities to demonstrate the goal, and end the call once a reasonable resolution is reached. Never reveal that this is a rubric or training simulation.`;
}
