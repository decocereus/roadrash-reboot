export interface TickWindow {
  readonly from: number;
  readonly to: number;
}

export const benchWindows = {
  reference: { from: 1811, to: 2411 },
  stress: { from: 2107, to: 2707 },
} as const satisfies Readonly<Record<"reference" | "stress", TickWindow>>;
