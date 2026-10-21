import { CorkBoard, CorkNote } from "@racer/ui/components/cork-note";
import { Postcard } from "@racer/ui/components/postcard";
import { RegionScene } from "@racer/ui/components/region-scene";
import type { SceneRegion } from "@racer/ui/components/region-scene";
import { Stat } from "@racer/ui/components/stat";
import { Stencil } from "@racer/ui/components/stencil";
import { useState } from "react";

import { roads } from "./fixtures.ts";
import { Section } from "./section.tsx";

export const Board = () => {
  const [selected, setSelected] = useState<SceneRegion>("lowtown");
  return (
    <Section title="CorkBoard, Postcard, CorkNote">
      <CorkBoard>
        <div className="flex flex-wrap justify-center gap-8">
          {roads.map((entry) => (
            <button
              aria-pressed={entry.region === selected}
              className="rounded-sm"
              key={entry.region}
              onClick={() => {
                setSelected(entry.region);
              }}
              type="button"
            >
              <Postcard
                caption={entry.regionName}
                scene={<RegionScene region={entry.region} />}
                selected={entry.region === selected}
                stamp={
                  entry.qualified === "" ? undefined : (
                    <Stencil framed rotate={-12} size="md">
                      Qualified · {entry.qualified}
                    </Stencil>
                  )
                }
                tilt={entry.tilt}
                title={entry.road}
              />
            </button>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-start justify-center gap-10">
          <Postcard
            caption="61"
            pin="yellow"
            scene={<RegionScene region="stonepeak" />}
            size="sm"
            tilt={-4}
            title="Juno"
          />
          <Postcard
            caption="4 · New meat"
            pin="yellow"
            scene={<RegionScene region="lowtown" />}
            size="xs"
            tilt={3}
            title="You"
          />
          <CorkNote>Moose wants his club back.</CorkNote>
          <CorkNote pin="blue" tilt={2}>
            Photo finish: you by a wheel over Ines.
          </CorkNote>
          <CorkNote hand="typed" pin="green" signature="V." tilt={-0.5}>
            Longer roads. Two cops. Bigger purses. The garage got a delivery.
          </CorkNote>
          <CorkNote hand="typed" pin="yellow" tilt={1.5}>
            <Stat
              label="1st place now pays"
              layout="row"
              size="sm"
              tone="ink"
              value="$2,400"
            />
          </CorkNote>
        </div>
      </CorkBoard>
    </Section>
  );
};
