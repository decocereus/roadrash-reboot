import { BikeCard } from "@racer/ui/components/bike-card";
import type { BikeStat } from "@racer/ui/components/bike-card";
import { Panel } from "@racer/ui/components/panel";
import {
  RiderCard,
  RiderRow,
  RiderRows,
} from "@racer/ui/components/rider-card";
import type { RiderColours } from "@racer/ui/components/rider-card";

import { moose } from "./fixtures.ts";
import { Section } from "./section.tsx";

const you: RiderColours = {
  bike: "#C82F2F",
  helmet: "#F2C230",
  jacket: "#23262C",
};

const standings = [
  {
    bike: "Sesta 600",
    colour: "#2F9A4E",
    name: "Dee",
    note: undefined,
    prize: 2400,
    result: "2:04.3",
  },
  {
    bike: "Kite 500",
    colour: "#C82F2F",
    name: "You",
    note: undefined,
    prize: 1600,
    result: "2:04.6",
  },
  {
    bike: "Sesta 600",
    colour: "#15171B",
    name: "Juno",
    note: undefined,
    prize: 1120,
    result: "+ 38 m",
  },
  {
    bike: "Kite 500",
    colour: "#22335C",
    name: "Lyle",
    note: undefined,
    prize: 640,
    result: "+ 210 m",
  },
  {
    bike: "Sesta 600",
    colour: "#F2ECDF",
    name: "Ines",
    note: undefined,
    prize: 400,
    result: "+ 260 m",
  },
  {
    bike: "Kite 500",
    colour: "#E0A21B",
    name: "Coach",
    note: undefined,
    prize: 240,
    result: "+ 540 m",
  },
  {
    bike: "Wren 400",
    colour: "#6B6B3A",
    name: "Gus",
    note: undefined,
    prize: 160,
    result: "+ 910 m",
  },
  {
    bike: "Kite 500",
    colour: "#C2521F",
    name: "Moose",
    note: "you knocked Moose down at 3.1 km",
    prize: 0,
    result: "BUSTED",
  },
] as const;

const kiteStats: readonly BikeStat[] = [
  { baseline: 0.58, label: "Top speed", reading: "190 km/h", value: 0.66 },
  { baseline: 0.5, label: "Launch", reading: "3.8 s", value: 0.6 },
  { baseline: 0.86, label: "Steering", value: 0.78 },
  { baseline: 0.9, label: "Bend grip", value: 0.8 },
];

export const Riders = () => (
  <Section title="RiderCard, RiderRow, BikeCard">
    <div className="flex flex-wrap items-start gap-8">
      <RiderCard
        aggression={0.8}
        colours={moose}
        grid={2}
        home="Cinder Flats"
        line="Last time you made me fall down. I've been thinking about it in the bath."
        name="Moose Kowalczyk"
        skill={0.62}
        tag="Holds a grudge"
      />
      <RiderCard
        aggression={0.5}
        colours={you}
        grid={8}
        home="The Lowside"
        name="You"
        skill={0.5}
        you
      />
      <BikeCard
        bikeClass="Featherweight"
        name="Halden Kite 500"
        note="A wreck at Level 2 costs $900 on this bike."
        pitch="The Wren with more lungs. Still turns before you finish deciding to."
        price={5000}
        stats={kiteStats}
      />
      <BikeCard
        bikeClass="Heavyweight"
        locked="Arrives at level 4"
        name="Halden Meridian 900"
        price={18_500}
        stats={kiteStats.map((stat) => ({
          label: stat.label,
          value: 1 - stat.value / 2,
        }))}
      />
    </div>
    <div className="mt-10 grid max-w-3xl grid-cols-2 gap-3">
      <RiderCard
        colours={moose}
        grid={2}
        home="Halden Kite 500 · Club"
        layout="row"
        name="Moose Kowalczyk"
        speaking
        tag="Holds a grudge"
      />
      <RiderCard
        colours={you}
        grid={8}
        home="Halden Wren 400 · Fists"
        layout="row"
        name="You"
        you
      />
    </div>
    <Panel className="mt-10 max-w-3xl">
      <RiderRows>
        {standings.map((row, index) => (
          <RiderRow
            bike={row.bike}
            colour={row.colour}
            key={row.name}
            name={row.name}
            note={row.note}
            place={index + 1}
            prize={row.prize}
            result={row.result}
            you={row.name === "You"}
          />
        ))}
      </RiderRows>
    </Panel>
  </Section>
);
