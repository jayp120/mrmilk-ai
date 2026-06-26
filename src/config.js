const currentHost =
  typeof window !== "undefined" && window.location?.hostname
    ? window.location.hostname
    : "localhost";

export const CONFIG = {
  BRIDGE_URL: `http://${currentHost}:3456`,
  POMELLI_URL: "https://labs.google.com/pomelli",
  APP_URL:
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost:5173",
  BRAND: {
    name: "Mr. Milk",
    company: "Mittal Dairy Farms",
    website: "https://www.mittaldairyfarms.com",
    phone: "9922-67-6455",
    portal: "mrmilk.milkmaster.co",
    tagline: "Milk is never touched directly by human hands",
    awards: ["Times Power Brands", "Lokmat Global Industry Award 2024"],
    colors: {
      primary: "#1a3a16",
      accent: "#c8841a",
      bg: "#faf5ec",
      text: "#2c1a0e"
    }
  }
};
