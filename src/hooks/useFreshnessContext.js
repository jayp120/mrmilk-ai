import { useMemo } from "react";
import { differenceInCalendarDays, startOfYear } from "date-fns";
import { getTodayContext } from "../data/festivalCalendar.js";

const PUNCHLINES = [
  "Own farm. Gir + Sahiwal cows. Zero middlemen.",
  "Milk is never touched directly by human hands. Farm to door.",
  "Times Power Brands & Lokmat Global Industry Award 2024.",
  "100% A2 desi cow milk. Not A1. Not mixed. Not compromised.",
  "Bilona Ghee - Vedic hand-churned. No machines. No shortcuts.",
  "12 hours from cow to your home. That is Mr. Milk."
];

const PUNE_AREAS = [
  "Hadapsar", "Sinhgad Road", "Kharadi", "Wakad", "Pimple Saudagar",
  "Baner", "Aundh", "Koregaon Park", "Pradhikaran", "Chinchwad",
  "Nigdi", "Hinjewadi", "Magarpatta", "Nanded City", "Katraj"
];

export default function useFreshnessContext() {
  return useMemo(() => {
    const now = new Date();
    const dayOfYear = differenceInCalendarDays(now, startOfYear(now)) + 1;
    const todayContext = getTodayContext(now);
    return {
      today: todayContext.todayFormatted,
      season: todayContext.currentSeason,
      festival: todayContext.upcomingFestival,
      festivalOpportunity: todayContext.upcomingFestival?.offer || null,
      punchline: PUNCHLINES[dayOfYear % PUNCHLINES.length],
      targetArea: PUNE_AREAS[Math.floor(dayOfYear / 3) % PUNE_AREAS.length],
      productHero: todayContext.seasonalProduct,
      whatsappSuffix: "📲 Subscribe: mrmilk.milkmaster.co | 📞 9922-67-6455",
      isITTransferSeason: todayContext.isITTransferSeason,
      isGaneshSeason: todayContext.isGaneshSeason
    };
  }, []);
}
