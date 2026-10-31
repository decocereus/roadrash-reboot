import manifest from "./art.json" with { type: "json" };

export type ArtName = keyof typeof manifest;

export const artUrl = (name: ArtName): string => `/art/${manifest[name]}`;
