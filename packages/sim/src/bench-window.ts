export interface TickWindow {
  readonly from: number;
  readonly to: number;
}

export const benchWindows = {
  reference: { from: 3849, to: 4449 },
  stress: { from: 2028, to: 2628 },
} as const satisfies Readonly<Record<"reference" | "stress", TickWindow>>;
