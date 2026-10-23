import { Screen } from "@racer/ui/components/screen";
import { Stencil } from "@racer/ui/components/stencil";

import { TAGLINE, WORDMARK } from "../../career/copy.ts";

export const BootScreen = () => (
  <Screen className="bg-ink flex flex-col items-center justify-center gap-3">
    <Stencil tone="text">{WORDMARK}</Stencil>
    <p className="text-quote text-muted font-semibold">{TAGLINE}</p>
  </Screen>
);
