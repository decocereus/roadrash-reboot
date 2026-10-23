export const parts = [
  "sim",
  "other",
  "riders",
  "fleet",
  "camera",
  "world",
  "matrices",
  "normal",
  "shadow",
  "main",
  "line",
  "bloom",
  "grade",
] as const;

export type Part = (typeof parts)[number];
