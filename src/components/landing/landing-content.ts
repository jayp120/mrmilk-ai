export const navigationItems = [
  { label: "Story", target: "story" },
  { label: "System", target: "system" },
  { label: "Start", target: "start" },
] as const;

export const startedThreadSignals = [
  "Open thread",
  "Live context",
] as const;

export const resolvedThreadSignals = [
  "Intent read",
  "Work arranged",
  "Ready to move",
] as const;

export const operatingLayers = [
  {
    label: "Milk Master",
    title: "The started thread.",
    description:
      "Where the request still carries human texture, ambiguity, and live context.",
    points: [
      "Receives the ask before structure hardens too early.",
      "Preserves tone, context, and pressure around the work.",
      "Lets the real task reveal itself before the system acts.",
    ],
  },
  {
    label: "Mr. Milk AI OS",
    title: "The resolved state.",
    description:
      "Where the work becomes ordered enough to move with confidence.",
    points: [
      "Reads the intention behind the request, not only the words.",
      "Arranges tasks, tools, and timing into a usable sequence.",
      "Returns a finished state instead of another open loop.",
    ],
  },
] as const;

export const capabilityCards = [
  {
    label: "Interpretation",
    title: "It understands the ask.",
    description:
      "Not just the request itself, but the pressure, timing, and implied work around it.",
  },
  {
    label: "Arrangement",
    title: "It orders the work.",
    description:
      "What would usually stay messy settles into sequence, clarity, and next action.",
  },
  {
    label: "Completion",
    title: "It returns a usable state.",
    description:
      "The output feels finished enough to move, inspect, and trust.",
  },
] as const;
