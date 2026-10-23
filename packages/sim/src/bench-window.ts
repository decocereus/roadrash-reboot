export interface TickWindow {
  readonly from: number;
  readonly to: number;
}

export const benchWindows = {
  reference: { from: 1727, to: 2327 },
  stress: { from: 2165, to: 2765 },
} as const satisfies Readonly<Record<"reference" | "stress", TickWindow>>;
