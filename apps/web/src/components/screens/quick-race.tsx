import { publicRoomRule } from "@racer/career/room-race";
import { bikes } from "@racer/sim/bikes";
import { MOST_SEATS } from "@racer/sim/room";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { Screen } from "@racer/ui/components/screen";
import { Stencil } from "@racer/ui/components/stencil";

import { RuleLine } from "./room-lobby.tsx";

const QUEUE_SECONDS = 30;

export const QueueScreen = ({
  refused,
  riders,
  onBack,
}: {
  readonly refused: boolean;
  readonly riders: number;
  readonly onBack: () => void;
}) => (
  <Screen className="bg-ink">
    <div className="grid flex-1 grid-cols-1 gap-8 p-8 md:grid-cols-[minmax(0,1fr)_28rem]">
      <div className="flex min-h-0 flex-col justify-center gap-4">
        <Stencil>Finding riders</Stencil>
        <p aria-live="polite" className="font-display text-quote text-paper">
          {refused
            ? "The game has updated. Reload to join."
            : `${riders} of ${MOST_SEATS}`}
        </p>
        <p className="font-display text-paper/60">
          The race leaves with whoever is here after {QUEUE_SECONDS} s. AI
          riders fill the grid to 10 and are labelled AI.
        </p>
        <MenuList
          autoFocus
          defaultValue={refused ? "reload" : "back"}
          key={String(refused)}
          label="Queue"
          onSelect={(id) => {
            if (id === "reload") {
              globalThis.location.reload();
            } else {
              onBack();
            }
          }}
        >
          {refused && <MenuItem value="reload">Reload</MenuItem>}
          <MenuItem value="back">Leave the queue</MenuItem>
        </MenuList>
      </div>
      <div className="border-paper/30 flex flex-col gap-4 border-2 p-6">
        <p className="font-display text-quote text-paper">Public rules</p>
        <div className="flex flex-col gap-2">
          <RuleLine label="Road" value="The server picks it" />
          <RuleLine label="Tier" value={String(publicRoomRule.tier)} />
          <RuleLine
            label="Bike"
            value={`${bikes[publicRoomRule.bikeId].name}, same for all`}
          />
          <RuleLine label="Catch-up" value="None, for humans or AI" />
          <RuleLine label="Rank" value="Doesn't count" />
        </div>
      </div>
    </div>
  </Screen>
);
