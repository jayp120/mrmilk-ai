import { withBrandFooter } from "../utils/promptBuilder.js";

const festivalSpecifics = (freshness) => {
  const festivalName = freshness.festival?.name || freshness.season;
  if (festivalName === "Gudi Padwa") return "New subscriptions and household pantry planning should feel premium and ritual-led.";
  if (festivalName === "Ganesh Chaturthi") return "Use prasad, modak, and uninterrupted household planning as the core message.";
  if (festivalName === "Diwali") return "Lead with premium ghee gifting, festive cooking confidence, and own-farm trust.";
  return "Keep the message seasonal, premium-safe, and rooted in farm credibility.";
};

export const CAMPAIGN_TEMPLATES = [
  {
    id: "festival",
    icon: "🎉",
    name: "Festival Campaign",
    description: "Season-led creative for the nearest demand moment in Pune.",
    tag: "SEASONAL",
    buildPrompt: (freshness) => withBrandFooter(`Create a ${freshness.festival?.name || freshness.season} campaign for Mr. Milk.
Include the brand DNA, today's date (${freshness.today}), festival opportunity (${freshness.festivalOpportunity || "seasonal push"}), and target area (${freshness.targetArea}).
Use ${festivalSpecifics(freshness)}
Format: Instagram 1080x1080 + Facebook cover + 3-4 line caption.`)
  },
  {
    id: "subscription",
    icon: "🥛",
    name: "Weekly Subscription Push",
    description: "Fresh weekly subscription creative tailored to one Pune locality.",
    tag: "WEEKLY",
    buildPrompt: (freshness) => withBrandFooter(`Subscription drive for ${freshness.targetArea}. Hero: ${freshness.productHero}.
Punchline: ${freshness.punchline}
CTA: First delivery tomorrow if they subscribe today.
Format: Instagram post + caption.`)
  },
  {
    id: "winback",
    icon: "🚨",
    name: "Win-Back Campaign",
    description: "Warm reactivation creative for lapsed households without price cuts.",
    tag: "URGENT",
    buildPrompt: (freshness) => withBrandFooter(`Win-back campaign for lapsed customers in ${freshness.targetArea}.
Offer frame: preferred restart date, premium reassurance, and delivery continuity support. No discounts, no cashback, no wallet bonus.
Tone: warm and personal.
Format: WhatsApp card + Instagram post.`)
  },
  {
    id: "farmstory",
    icon: "🌿",
    name: "Farm Story",
    description: "Brand storytelling about the farm, cows, and untouched process.",
    tag: "EVERGREEN",
    buildPrompt: (freshness) => withBrandFooter(`Create a farm story about Gir + Sahiwal cows, automated milking, and zero human touch.
Show Mr. Milk as one of India's most tech-advanced desi cow farms. Farm visit always open.
Season: ${freshness.season}.
Visual direction: golden fields, desi cows, sunrise.
Format: Instagram carousel.`)
  },
  {
    id: "awards",
    icon: "🏆",
    name: "Award Showcase",
    description: "Trust-building creative around your award credibility.",
    tag: "EVERGREEN",
    buildPrompt: () => withBrandFooter(`Create an award showcase campaign for Mr. Milk.
Highlight Times Power Brands and Lokmat Global Industry Award 2024.
Tone: proud, confident, and premium.
Format: Instagram post + story.`)
  },
  {
    id: "ghee",
    icon: "🧈",
    name: "Bilona Ghee Spotlight",
    description: "Premium ghee creative for high-value localities.",
    tag: "SEASONAL",
    buildPrompt: (freshness) => withBrandFooter(`Spotlight Mr. Milk Desi Cow Ghee.
Focus: Vedic hand-churned Bilona method, no machines, own Gir + Sahiwal cows.
Season: ${freshness.season}.
Target areas: Koregaon Park, Aundh, Baner.
Format: Instagram post + story.`)
  },
  {
    id: "differentiation",
    icon: "⚔️",
    name: "Why Mr. Milk",
    description: "Clear premium differentiation without naming competitors.",
    tag: "URGENT",
    buildPrompt: () => withBrandFooter(`Create a "Why Mr. Milk" campaign.
Core points: own farm, no third-party milk, Gir + Sahiwal only, 12 hours farm to door, milk never touched directly by human hands.
Never name competitors.
Format: Instagram infographic.`)
  },
  {
    id: "arealunch",
    icon: "🎯",
    name: "Area Launch",
    description: "Hyperlocal launch creative for a new delivery corridor.",
    tag: "SEASONAL",
    buildPrompt: (freshness) => withBrandFooter(`Create an area launch campaign for ${freshness.targetArea}.
Use the only allowed acquisition frame if relevant: first-time 7L trial pack where the customer pays for 6L and receives 1L extra.
Keep the creative premium, local, and trust-led.
Format: Instagram + WhatsApp broadcast.`)
  },
  {
    id: "wallet",
    icon: "💰",
    name: "Wallet Top-Up Drive",
    description: "Continuity-led wallet reminder without bonus language.",
    tag: "WEEKLY",
    buildPrompt: (freshness) => withBrandFooter(`Create a wallet top-up drive for this week.
Frame it as uninterrupted delivery planning, premium service continuity, and peace of mind. No bonus, cashback, or top-up credit language.
CTA: Top up in the Mr. Milk app.
Target area: ${freshness.targetArea}.
Format: Instagram + story.`)
  },
  {
    id: "morning",
    icon: "🌞",
    name: "Morning Ritual",
    description: "Early-morning milk creative for working families.",
    tag: "EVERGREEN",
    buildPrompt: (freshness) => withBrandFooter(`Create a morning ritual campaign for Mr. Milk.
Focus: A2 milk delivered before 7am, untouched by human hands, built for family mornings.
Season: ${freshness.season}.
Target: IT professionals in Hinjewadi, Kharadi, and Hadapsar.
Format: Instagram reel thumbnail + caption.`)
  },
  {
    id: "a2education",
    icon: "🐄",
    name: "A2 vs A1 Education",
    description: "Educational carousel on desi cow A2 milk.",
    tag: "EVERGREEN",
    buildPrompt: () => withBrandFooter(`Create an educational campaign on A2 from desi cows (Gir, Sahiwal) versus A1 from foreign breeds.
Mr. Milk is 100% A2, with no mixing.
Tone: informative and calm, not fear-based.
Format: Instagram carousel, 3 slides.`)
  },
  {
    id: "plans",
    icon: "📦",
    name: "Subscription Plans",
    description: "Simple subscription explainer with flexible plan sizes.",
    tag: "WEEKLY",
    buildPrompt: (freshness) => withBrandFooter(`Create a subscription plans campaign.
Show daily plan sizes: 500ml, 1L, 1.5L. Highlight pause/resume flexibility and the wallet system without commitment pressure.
Target area: ${freshness.targetArea}.
Format: Instagram post + story.`)
  }
];
