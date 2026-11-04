export interface TickWindow {
  readonly from: number;
  readonly to: number;
}

export const benchWindows = {
  reference: { from: 2243, to: 2843 },
  stress: { from: 1800, to: 2400 },
} as const satisfies Readonly<Record<"reference" | "stress", TickWindow>>;
