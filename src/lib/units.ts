// Duniya bhar me istemal hone wale units — category (sub-group) ke saath
export const UNIT_GROUPS: { group: string; units: string[] }[] = [
  { group: "Count / Pieces", units: ["piece", "pcs", "nos", "unit", "item", "each", "pair", "set", "dozen", "half dozen", "gross", "score", "hundred", "thousand", "ream", "sheet"] },
  { group: "Weight (Metric)", units: ["mg", "g", "kg", "quintal", "ton (metric)", "carat"] },
  { group: "Weight (Imperial / Local)", units: ["oz", "lb", "stone", "ton (short)", "ton (long)", "grain", "tola", "masha", "ratti", "seer", "maund", "pao", "chatank"] },
  { group: "Volume (Metric)", units: ["ml", "cl", "dl", "litre", "kilolitre", "cc", "cubic meter", "cubic cm"] },
  { group: "Volume (Imperial / US)", units: ["tsp", "tbsp", "fl oz", "cup", "pint", "quart", "gallon (US)", "gallon (UK)", "barrel", "cubic foot", "cubic inch"] },
  { group: "Length", units: ["mm", "cm", "m", "km", "inch", "foot", "yard", "mile", "gaz", "running foot", "running meter"] },
  { group: "Area", units: ["sq mm", "sq cm", "sq m", "sq inch", "sq foot", "sq yard", "acre", "hectare", "marla", "kanal"] },
  { group: "Packaging", units: ["pack", "packet", "box", "carton", "case", "bag", "sack", "bundle", "roll", "coil", "bottle", "can", "tin", "jar", "drum", "jerrycan", "canister", "tube", "pouch", "sachet", "strip", "blister", "tray", "crate", "pallet", "container", "cylinder", "bucket", "tub", "bale", "reel", "vial", "ampoule"] },
  { group: "Pharma / Medical", units: ["tablet", "capsule", "dose", "injection", "drop", "IU", "mcg"] },
  { group: "Time / Service", units: ["second", "minute", "hour", "day", "week", "month", "year", "service", "job", "visit"] },
  { group: "Energy / Other", units: ["kWh", "watt", "kW", "HP", "BTU", "calorie", "joule", "lot", "batch"] },
];
export const ALL_UNITS = UNIT_GROUPS.flatMap((g) => g.units);
export const unitGroupOf = (u: string) => UNIT_GROUPS.find((g) => g.units.includes(u))?.group ?? "";
