export interface TickWindow {
  readonly from: number;
  readonly to: number;
}

export const benchWindow: TickWindow = { from: 2640, to: 3240 };
