export interface TickWindow {
  readonly from: number;
  readonly to: number;
}

export const benchWindows = {
  reference: { from: 5679, to: 6279 },
  stress: { from: 3017, to: 3617 },
} as const satisfies Readonly<Record<"reference" | "stress", TickWindow>>;
