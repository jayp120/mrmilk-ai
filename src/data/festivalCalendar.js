import { differenceInCalendarDays, format, parseISO } from "date-fns";

export const FESTIVALS = [
  { name: "Gudi Padwa", date: "2026-04-18", type: "major", product: "Mr. Milk Desi Cow Ghee", offer: "Ghee gifting + new subscription" },
  { name: "Akshaya Tritiya", date: "2026-05-01", type: "major", product: "Mr. Milk Desi Cow Ghee", offer: "Auspicious gifting" },
  { name: "Makar Sankranti", date: "2026-01-14", type: "major", product: "Mr. Milk Desi Cow Milk (A2)", offer: "Warm milk + Ghee for sweets" },
  { name: "Holi", date: "2026-03-25", type: "major", product: "Mr. Milk A2 Plain Butter Milk", offer: "Thandai + Buttermilk" },
  { name: "Ram Navami", date: "2026-03-28", type: "medium", product: "Mr. Milk Desi Cow Milk (A2)", offer: "Prasad - pure A2 milk" },
  { name: "Ganesh Chaturthi", monthApprox: 8, type: "major", product: "Mr. Milk Desi Cow Ghee", offer: "3x demand - Modak Ghee push" },
  { name: "Diwali", monthApprox: 10, type: "major", product: "Mr. Milk Desi Cow Ghee", offer: "Premium Ghee hampers, gifting" },
  { name: "Christmas", date: "2026-12-25", type: "medium", product: "Mr. Milk Desi Cow Paneer", offer: "Premium milk + Paneer gifting" },
  { name: "New Year", date: "2027-01-01", type: "medium", product: "Mr. Milk Desi Cow Milk (A2)", offer: "Health resolution - switch to A2" },
  { name: "IPL Season", startMonth: 2, endMonth: 4, type: "seasonal", product: "Mr. Milk Desi Cow Dahi", offer: "Evening snacks - Paneer, Dahi, Buttermilk" }
];

export const resolveFestivalDate = (festival, referenceYear = 2026) => {
  if (festival.date) return festival.date;
  if (festival.monthApprox != null) {
    const day = festival.name === "Ganesh Chaturthi" ? 25 : 20;
    return `${referenceYear}-${String(festival.monthApprox + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (festival.startMonth != null) {
    return `${referenceYear}-${String(festival.startMonth + 1).padStart(2, "0")}-01`;
  }
  return `${referenceYear}-01-01`;
};

const getSeasonState = (date) => {
  const month = date.getMonth();
  const isITTransferSeason = month === 3 || month === 4;
  const isGaneshSeason = month === 7 || month === 8;

  if (isGaneshSeason || month === 9 || month === 10) {
    return { currentSeason: "Festival Season", seasonalProduct: "Mr. Milk Desi Cow Ghee" };
  }
  if (month === 3 || month === 4) {
    return { currentSeason: "Mango Season", seasonalProduct: "Mr. Milk A2 Plain Butter Milk" };
  }
  if (month >= 2 && month <= 5) {
    return { currentSeason: "Summer", seasonalProduct: "Mr. Milk Desi Cow Dahi" };
  }
  if (month >= 6 && month <= 8) {
    return { currentSeason: "Monsoon", seasonalProduct: "Mr. Milk Desi Cow Milk (A2)" };
  }
  return { currentSeason: "Winter", seasonalProduct: "Mr. Milk Desi Cow Ghee" };
};

export const getTodayContext = (inputDate = new Date()) => {
  const today = inputDate instanceof Date ? inputDate : parseISO(String(inputDate));
  const todayFormatted = format(today, "EEEE, d MMMM yyyy");
  const referenceYear = today.getFullYear();
  const nearestFestival = FESTIVALS
    .filter((festival) => festival.type !== "seasonal")
    .map((festival) => {
      const resolvedDate = resolveFestivalDate(festival, referenceYear);
      return {
        ...festival,
        resolvedDate,
        daysAway: differenceInCalendarDays(parseISO(resolvedDate), today)
      };
    })
    .filter((festival) => festival.daysAway >= 0 && festival.daysAway <= 14)
    .sort((a, b) => a.daysAway - b.daysAway)[0] || null;

  const seasonState = getSeasonState(today);
  return {
    todayFormatted,
    upcomingFestival: nearestFestival,
    currentSeason: seasonState.currentSeason,
    seasonalProduct: seasonState.seasonalProduct,
    isITTransferSeason: today.getMonth() === 3 || today.getMonth() === 4,
    isGaneshSeason: today.getMonth() === 7 || today.getMonth() === 8
  };
};
