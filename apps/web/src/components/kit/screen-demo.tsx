import { Heading } from "@racer/ui/components/heading";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { Money } from "@racer/ui/components/money";
import { RegionScene } from "@racer/ui/components/region-scene";
import { Screen, ScreenBody, ScreenStrip } from "@racer/ui/components/screen";
import { Stat } from "@racer/ui/components/stat";
import { Stencil } from "@racer/ui/components/stencil";
import { useState } from "react";

import { Section } from "./section.tsx";

const titleMenu = [
  {
    detail: "Level 2 · $3,200 · Halden Kite 500",
    label: "Continue career",
    value: "continue",
  },
  { detail: undefined, label: "New career", value: "new" },
  { detail: undefined, label: "Single race", value: "single" },
  { detail: undefined, label: "Multiplayer", value: "multiplayer" },
  { detail: undefined, label: "Back room", value: "back-room" },
] as const;

export const ScreenDemo = () => {
  const [chosen, setChosen] = useState("nothing yet");
  return (
    <Section title="Screen, MenuList, Stat">
      <div className="border-line h-[34rem] border-2">
        <Screen
          fit="parent"
          scene={<RegionScene region="stonepeak" />}
          scrim="soft"
        >
          <ScreenStrip>
            <Heading as="p">The Lowside</Heading>
            <div className="flex flex-wrap gap-x-10 gap-y-2">
              <Stat label="Level 2" value="The Envelope" />
              <Stat label="Roads" value="3 / 5 qualified" />
              <Stat
                align="right"
                label="Cash"
                tone="green"
                value={<Money amount={3200} />}
              />
            </div>
          </ScreenStrip>
          <ScreenBody className="flex flex-col justify-end">
            <Stencil size="lg" tone="text">
              Rushline
            </Stencil>
            <p className="mb-6 font-semibold">Race. Fight. Pay for it.</p>
            <MenuList
              defaultValue="continue"
              label="Title menu"
              onSelect={setChosen}
            >
              {titleMenu.map((entry) => (
                <MenuItem
                  detail={entry.detail}
                  key={entry.value}
                  value={entry.value}
                >
                  {entry.label}
                </MenuItem>
              ))}
            </MenuList>
          </ScreenBody>
          <ScreenStrip edge="bottom">
            <MenuList
              defaultValue="route-board"
              label="Clubhouse navigation"
              onSelect={setChosen}
              orientation="horizontal"
              size="sm"
            >
              <MenuItem value="route-board">Route board</MenuItem>
              <MenuItem value="garage">Garage</MenuItem>
              <MenuItem value="back-room">Back room</MenuItem>
              <MenuItem disabled value="multiplayer">
                Multiplayer
              </MenuItem>
            </MenuList>
            <p className="text-label text-muted font-semibold uppercase">
              Enter chose: <span className="text-text">{chosen}</span>
            </p>
          </ScreenStrip>
        </Screen>
      </div>
    </Section>
  );
};
