export interface TickWindow {
  readonly from: number;
  readonly to: number;
}

export const benchWindow: TickWindow = { from: 2880, to: 3480 };
