import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { gateRules } from "./gate.ts";
import type { Gate } from "./gate.ts";

export const gateLimiter = (gate: Gate) => {
  const { binding, limit, namespaceId, period } = gateRules[gate];
  return Cloudflare.RateLimit(binding, {
    namespaceId,
    simple: { limit, period },
  });
};

export const passes = (limiter: Cloudflare.RateLimitClient, client: string) =>
  limiter.limit({ key: client }).pipe(
    Effect.map(({ success }) => success),
    Effect.catchTag("RateLimitError", () => Effect.succeed(true))
  );
