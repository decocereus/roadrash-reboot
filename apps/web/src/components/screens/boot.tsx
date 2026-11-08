import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { Screen } from "@racer/ui/components/screen";
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
  <Screen className="bg-ink flex flex-col items-center justify-center gap-6">
    <Stencil>{WORDMARK}</Stencil>
    <p className="font-display text-neon-red normal-case" role="alert">
      {CAREER_ELSEWHERE}
    </p>
    <MenuList
      autoFocus
      defaultValue="retry"
      label="Career"
      onSelect={() => {
        globalThis.location.reload();
      }}
    >
      <MenuItem value="retry">Try again</MenuItem>
    </MenuList>
  </Screen>
);
