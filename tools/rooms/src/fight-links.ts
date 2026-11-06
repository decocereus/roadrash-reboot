export interface Link {
  readonly burstEveryMs: number;
  readonly burstMs: number;
  readonly jitterMs: number;
  readonly lossPercent: number;
  readonly rttMs: number;
  readonly uploadAfterMs: number;
  readonly uploadMs: number;
}

const steady = (rttMs: number, jitterMs: number, lossPercent = 0): Link => ({
  burstEveryMs: 0,
  burstMs: 0,
  jitterMs,
  lossPercent,
  rttMs,
  uploadAfterMs: 0,
  uploadMs: 0,
});

const home = steady(110, 15);
const far = steady(300, 20);

export const NETWORK_NAMES = [
  "direct",
  "home",
  "mobile",
  "far",
  "bursts",
  "upload",
] as const;
export type NetworkName = (typeof NETWORK_NAMES)[number];
export type RunName = NetworkName | "live";

export const linksOf = (name: NetworkName): readonly [Link, Link] => {
  switch (name) {
    case "direct": {
      return [steady(0, 0), steady(0, 0)];
    }
    case "home": {
      return [home, home];
    }
    case "mobile": {
      return [steady(180, 60, 1), steady(180, 60, 1)];
    }
    case "far": {
      return [home, far];
    }
    case "bursts": {
      return [
        home,
        { ...far, burstEveryMs: 10_000, burstMs: 1000, lossPercent: 1 },
      ];
    }
    case "upload": {
      return [home, { ...home, uploadAfterMs: 30_000, uploadMs: 150 }];
    }
    default: {
      return name satisfies never;
    }
  }
};
