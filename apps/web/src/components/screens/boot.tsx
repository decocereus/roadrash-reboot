import { Screen } from "@racer/ui/components/screen";
import { Stencil } from "@racer/ui/components/stencil";

import { TAGLINE, WORDMARK } from "../../career/copy.ts";

export const BootScreen = () => (
  <Screen className="bg-ink flex flex-col items-center justify-center gap-3">
    <Stencil>{WORDMARK}</Stencil>
    <p className="font-display text-quote text-paper/60 font-bold tracking-wide uppercase">
      {TAGLINE}
    </p>
  </Screen>
);
