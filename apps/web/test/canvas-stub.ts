import { afterAll, beforeAll, vi } from "vitest";

const drawsNothing = new Proxy(
  {},
  {
    get: (_target, key) =>
      key === "createLinearGradient" || key === "createRadialGradient"
        ? () => ({ addColorStop: () => null })
        : () => null,
  }
);

export const drawnNowhere = {
  createElement: () => ({ getContext: () => drawsNothing }),
};

export const stubCanvases = (): void => {
  beforeAll(() => {
    vi.stubGlobal("document", drawnNowhere);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });
};
