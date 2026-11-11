import { Screen } from "@racer/ui/components/screen";
import { SkewButton } from "@racer/ui/components/skew-button";
import { Stencil } from "@racer/ui/components/stencil";

import { CAREER_ELSEWHERE, TAGLINE, WORDMARK } from "../../career/copy.ts";

export const BootScreen = () => (
  <Screen className="bg-ink flex flex-col items-center justify-center gap-3">
    <Stencil>{WORDMARK}</Stencil>
    <p className="font-display text-quote text-paper/60 font-bold tracking-wide uppercase">
      {TAGLINE}
    </p>
  </Screen>
);

export const ElsewhereScreen = () => (
  <Screen className="bg-ink">
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <Stencil>{WORDMARK}</Stencil>
      <p className="font-display text-neon-red normal-case" role="alert">
        {CAREER_ELSEWHERE}
      </p>
      <div className="w-64">
        <SkewButton
          autoFocus
          onClick={() => {
            globalThis.location.reload();
          }}
          title="Try again"
          tone="primary"
        />
      </div>
    </div>
  </Screen>
);
