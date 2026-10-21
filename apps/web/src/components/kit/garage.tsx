import { Heading } from "@racer/ui/components/heading";
import {
  MenuItem,
  MenuList,
  MenuStepper,
} from "@racer/ui/components/menu-list";
import { Panel } from "@racer/ui/components/panel";
import { useState } from "react";

import { Section } from "./section.tsx";

const garageMenu = [
  { label: "Gutter Pup 250", mark: undefined, value: "pup" },
  { label: "Halden Wren 400", mark: "●", value: "wren" },
  { label: "Halden Kite 500", mark: undefined, value: "kite" },
  { label: "Ostra Sesta 600", mark: undefined, value: "sesta" },
  { label: "Halden Meridian 900", mark: "🔒", value: "meridian" },
] as const;

const sampleBikes = ["Halden Wren 400", "Halden Kite 500", "Ostra Sesta 600"];
const LAST_LEVEL = 5;

export const Garage = () => {
  const [level, setLevel] = useState(2);
  const [bike, setBike] = useState(0);
  return (
    <Section title="MenuList small, MenuStepper">
      <div className="flex flex-wrap items-start gap-8">
        <Panel className="w-96 max-w-full">
          <MenuList defaultValue="level" label="Single race" size="sm">
            <MenuStepper
              label="Level"
              onStep={(step) => {
                setLevel(Math.min(LAST_LEVEL, Math.max(1, level + step)));
              }}
              value="level"
            >
              {level}
            </MenuStepper>
            <MenuStepper
              label="Bike"
              onStep={(step) => {
                setBike(
                  (bike + step + sampleBikes.length) % sampleBikes.length
                );
              }}
              value="bike"
            >
              {sampleBikes[bike]}
            </MenuStepper>
            <MenuItem value="race">Race</MenuItem>
            <MenuItem value="back">Back</MenuItem>
          </MenuList>
        </Panel>
        <Panel className="w-80 max-w-full">
          <Heading as="h3" className="mb-2" size="sm" tone="muted">
            Featherweight
          </Heading>
          <MenuList defaultValue="kite" label="Catalogue" size="sm">
            {garageMenu.map((entry) => (
              <MenuItem
                className="w-full"
                key={entry.value}
                trailing={entry.mark}
                value={entry.value}
              >
                {entry.label}
              </MenuItem>
            ))}
          </MenuList>
        </Panel>
      </div>
    </Section>
  );
};
