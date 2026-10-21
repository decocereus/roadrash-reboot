import { AdSlot } from "@racer/ui/components/ad-slot";
import { Bar, Pips } from "@racer/ui/components/bar";
import { BikeCard } from "@racer/ui/components/bike-card";
import type { BikeStat } from "@racer/ui/components/bike-card";
import { Confirm } from "@racer/ui/components/confirm";
import { CorkBoard, CorkNote } from "@racer/ui/components/cork-note";
import { Heading } from "@racer/ui/components/heading";
import { Invoice } from "@racer/ui/components/invoice";
import { Ledger, LedgerRow, LedgerTotal } from "@racer/ui/components/ledger";
import {
  MenuItem,
  MenuList,
  MenuStepper,
} from "@racer/ui/components/menu-list";
import { Money } from "@racer/ui/components/money";
import { Notice, Toast } from "@racer/ui/components/notice";
import { Panel } from "@racer/ui/components/panel";
import { Postcard } from "@racer/ui/components/postcard";
import { RegionScene } from "@racer/ui/components/region-scene";
import type { SceneRegion } from "@racer/ui/components/region-scene";
import {
  RiderCard,
  RiderRow,
  RiderRows,
} from "@racer/ui/components/rider-card";
import type { RiderColours } from "@racer/ui/components/rider-card";
import { Screen, ScreenBody, ScreenStrip } from "@racer/ui/components/screen";
import { Stat } from "@racer/ui/components/stat";
import { Stencil } from "@racer/ui/components/stencil";
import { Ticket } from "@racer/ui/components/ticket";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

const interfaceSwatches = [
  { name: "ink", swatch: "bg-ink" },
  { name: "panel", swatch: "bg-panel" },
  { name: "raised", swatch: "bg-raised" },
  { name: "line", swatch: "bg-line" },
  { name: "text", swatch: "bg-text" },
  { name: "muted", swatch: "bg-muted" },
  { name: "orange", swatch: "bg-orange" },
  { name: "yellow", swatch: "bg-yellow" },
  { name: "red", swatch: "bg-red" },
  { name: "green", swatch: "bg-green" },
  { name: "blue", swatch: "bg-blue" },
  { name: "cork", swatch: "bg-cork" },
  { name: "paper", swatch: "bg-paper" },
  { name: "polaroid", swatch: "bg-polaroid" },
  { name: "asphalt", swatch: "bg-asphalt" },
  { name: "road-worn", swatch: "bg-road-worn" },
  { name: "road-centre", swatch: "bg-road-centre" },
  { name: "road-edge", swatch: "bg-road-edge" },
  { name: "road-shoulder", swatch: "bg-road-shoulder" },
  { name: "road-verge", swatch: "bg-road-verge" },
] as const;

const roads: readonly {
  readonly region: SceneRegion;
  readonly road: string;
  readonly regionName: string;
  readonly tilt: number;
  readonly qualified: string;
  readonly swatches: readonly string[];
}[] = [
  {
    qualified: "2nd",
    region: "salt-coast",
    regionName: "Salt Coast",
    road: "Breakwater Run",
    swatches: [
      "bg-salt-coast-zenith",
      "bg-salt-coast-horizon",
      "bg-salt-coast-far",
      "bg-salt-coast-ground",
      "bg-salt-coast-verge",
      "bg-salt-coast-asphalt",
    ],
    tilt: -3,
  },
  {
    qualified: "",
    region: "cinder-flats",
    regionName: "Cinder Flats",
    road: "Cinder Wash",
    swatches: [
      "bg-cinder-flats-zenith",
      "bg-cinder-flats-horizon",
      "bg-cinder-flats-far",
      "bg-cinder-flats-ground",
      "bg-cinder-flats-verge",
      "bg-cinder-flats-asphalt",
    ],
    tilt: 2,
  },
  {
    qualified: "1st",
    region: "kettle-woods",
    regionName: "Kettle Woods",
    road: "Hollow Pine Road",
    swatches: [
      "bg-kettle-woods-zenith",
      "bg-kettle-woods-horizon",
      "bg-kettle-woods-far",
      "bg-kettle-woods-ground",
      "bg-kettle-woods-verge",
      "bg-kettle-woods-asphalt",
    ],
    tilt: -1.5,
  },
  {
    qualified: "",
    region: "lowtown",
    regionName: "Lowtown",
    road: "Slag Row",
    swatches: [
      "bg-lowtown-zenith",
      "bg-lowtown-horizon",
      "bg-lowtown-far",
      "bg-lowtown-ground",
      "bg-lowtown-verge",
      "bg-lowtown-asphalt",
    ],
    tilt: 3,
  },
  {
    qualified: "",
    region: "stonepeak",
    regionName: "Stonepeak",
    road: "Ridge Road",
    swatches: [
      "bg-stonepeak-zenith",
      "bg-stonepeak-horizon",
      "bg-stonepeak-far",
      "bg-stonepeak-ground",
      "bg-stonepeak-verge",
      "bg-stonepeak-asphalt",
    ],
    tilt: -2,
  },
];

const moose: RiderColours = {
  bike: "#C2521F",
  helmet: "#2B2E33",
  jacket: "#5B4632",
};

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

const garageMenu = [
  { label: "Gutter Pup 250", mark: undefined, value: "pup" },
  { label: "Halden Wren 400", mark: "●", value: "wren" },
  { label: "Halden Kite 500", mark: undefined, value: "kite" },
  { label: "Ostra Sesta 600", mark: undefined, value: "sesta" },
  { label: "Halden Meridian 900", mark: "🔒", value: "meridian" },
] as const;

const Section = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <section className="border-line border-t-2 py-10">
    <Heading as="h2" className="mb-6" size="md" tone="muted">
      {title}
    </Heading>
    {children}
  </section>
);

const Swatch = ({
  name,
  swatch,
}: {
  readonly name: string;
  readonly swatch: string;
}) => (
  <li className="flex items-center gap-3">
    <span className={`border-line size-8 shrink-0 border-2 ${swatch}`} />
    <span className="font-body text-label text-muted font-semibold uppercase">
      {name}
    </span>
  </li>
);

const Tokens = () => (
  <Section title="Palette and type">
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      {interfaceSwatches.map((entry) => (
        <Swatch key={entry.name} name={entry.name} swatch={entry.swatch} />
      ))}
    </ul>
    <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {roads.map((entry) => (
        <li key={entry.region}>
          <p className="font-body text-label text-muted font-semibold uppercase">
            {entry.regionName}
          </p>
          <div className="border-line mt-2 flex h-8 border-2">
            {entry.swatches.map((swatch) => (
              <span className={`flex-1 ${swatch}`} key={swatch} />
            ))}
          </div>
        </li>
      ))}
    </ul>
    <div className="mt-10 grid gap-8 lg:grid-cols-3">
      <div>
        <p className="font-display tracking-display text-heading font-extrabold uppercase">
          Saira 800
        </p>
        <p className="font-display tracking-display text-name font-bold uppercase">
          Saira Extra Condensed 700 · 0123456789
        </p>
      </div>
      <div>
        <p className="font-body text-body">
          Inter 400. Two lanes and a lot of nothing, then a right angle.
        </p>
        <p className="font-body text-quote mt-2 font-semibold">
          “Inter 600. Stay out of my lane.”
        </p>
        <p className="font-body text-label text-muted mt-2 font-semibold uppercase">
          Label · 13 px capitals
        </p>
      </div>
      <div>
        <p className="font-stencil tracking-display text-heading font-extrabold uppercase">
          Stencil 800
        </p>
      </div>
    </div>
  </Section>
);

const ScreenDemo = () => {
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

const Words = () => (
  <Section title="Heading, Stencil, Panel">
    <div className="flex flex-wrap items-end gap-x-12 gap-y-6">
      <Heading size="xl">Garage</Heading>
      <Heading>Route board</Heading>
      <Heading size="md" tone="text">
        Moose Kowalczyk
      </Heading>
      <Heading size="sm" tone="yellow">
        Featherweight
      </Heading>
    </div>
    <div className="mt-10 flex flex-wrap items-center gap-x-14 gap-y-10">
      <Stencil rotate={-4}>Wrecked</Stencil>
      <Stencil rotate={3} tone="police">
        Busted
      </Stencil>
      <Stencil framed rotate={-8} size="lg" tone="yellow">
        Qualified
      </Stencil>
      <Stencil size="lg" tone="text">
        Winner
      </Stencil>
      <Stencil framed rotate={6} size="md" tone="green">
        Finished
      </Stencil>
    </div>
    <div className="mt-10 grid gap-6 md:grid-cols-4">
      <Panel>Panel</Panel>
      <Panel tone="raised">Raised</Panel>
      <Panel selected>Selected</Panel>
      <Panel edge={moose.bike} padding="sm" tone="plate">
        <Heading as="p" size="sm" tone="text">
          Moose
        </Heading>
        <Bar className="mt-2" label="Moose stamina" value={62} />
      </Panel>
    </div>
  </Section>
);

const Meters = () => (
  <Section title="Bar, Stat, Money">
    <div className="grid gap-10 md:grid-cols-3">
      <div className="flex flex-col gap-4">
        <Bar label="Stamina, full" value={88} />
        <Bar label="Stamina, under 50" value={41} />
        <Bar label="Stamina, under 25" value={17} />
        <Bar align="right" label="Rival stamina" value={70} />
      </div>
      <div className="flex flex-col gap-4">
        <Bar label="Bike, sound" size="sm" tone="condition" value={92} />
        <Bar label="Bike, worn" size="sm" tone="condition" value={38} />
        <Bar label="Bike, failing" size="sm" tone="condition" value={12} />
        <Bar label="Top speed" mark={0.58} max={1} tone="plain" value={0.66} />
        <Pips label="Club hits left" max={8} value={5} />
        <Pips label="Pipe hits left" max={3} value={0} />
      </div>
      <div className="flex flex-col gap-4">
        <Stat label="Speed" size="lg" value="187" />
        <Stat label="Top speed" layout="row" size="sm" value="190 km/h" />
        <div className="font-body flex flex-wrap gap-x-6 gap-y-1 font-semibold">
          <Money amount={1600} kind="flow" />
          <Money amount={-900} kind="flow" />
          <Money amount={0} kind="flow" />
          <Money amount={3200} kind="balance" />
          <Money amount={-750} kind="balance" />
          <Money amount={5000} />
        </div>
      </div>
    </div>
  </Section>
);

const Board = () => {
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

const Bills = () => (
  <Section title="Ticket, Invoice, Ledger">
    <div className="flex flex-wrap items-start gap-12">
      <Ticket
        cashAfter={1700}
        confiscated="Also confiscated: one club."
        fine={1500}
        location="Slag Row, km 3.1"
        offence="Racing on a public road. Also, falling off on one."
        serial="04417"
      />
      <Invoice
        amount={450}
        cashAfter={-250}
        detail="Level 2 · Featherweight"
        fullAmount={900}
        item="Repair, Halden Kite 500"
        note="Half, thanks to our sponsor"
        warning="This bill takes the Halden Kite 500."
      />
      <Panel className="w-96 max-w-full">
        <Ledger>
          <LedgerRow amount={1600} label="Prize, 2nd" />
          <LedgerRow amount={-900} label="Repairs" />
          <LedgerRow
            amount={0}
            label="Fines"
            note="Nobody caught you this time."
          />
          <LedgerTotal amount={3200} label="Cash" />
        </Ledger>
      </Panel>
    </div>
  </Section>
);

const Riders = () => (
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

const sampleBikes = ["Halden Wren 400", "Halden Kite 500", "Ostra Sesta 600"];
const LAST_LEVEL = 5;

const Garage = () => {
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

const Asking = () => {
  const [answer, setAnswer] = useState("not asked");
  const [open, setOpen] = useState(true);
  return (
    <Section title="Confirm, Screen enter">
      <div className="border-line relative h-80 border-2">
        <Screen enter="fade" fit="parent">
          <ScreenBody className="flex flex-col justify-end gap-4">
            <p className="text-muted">Answer: {answer}</p>
            <MenuList
              label="Confirm demo"
              onSelect={() => {
                setOpen(true);
              }}
              orientation="horizontal"
              size="sm"
            >
              <MenuItem value="ask">Quit race</MenuItem>
            </MenuList>
          </ScreenBody>
          {open && (
            <Confirm
              defaultValue="keep"
              label="Quit race"
              onDismiss={() => {
                setOpen(false);
                setAnswer("dismissed");
              }}
              onSelect={(value) => {
                setOpen(false);
                setAnswer(value);
              }}
              options={[
                { label: "Keep racing", value: "keep" },
                { label: "Quit and pay", value: "quit" },
              ]}
              warning="This bill takes the Halden Kite 500."
            >
              Quit this race? It counts as a wreck: no prize, and a $900 repair
              bill.
            </Confirm>
          )}
        </Screen>
      </div>
    </Section>
  );
};

const Hud = () => (
  <Section title="HUD utilities">
    <div className="border-line bg-muted relative flex h-40 items-center justify-around border-2">
      <p className="font-display tracking-display hud-ink text-hud font-extrabold uppercase">
        3rd <span className="text-name">/ 8</span>
      </p>
      <p className="font-display tracking-display flash-hold hud-ink text-hud font-extrabold uppercase">
        2nd
      </p>
      <p className="font-display tracking-display cop-blink text-name bg-ink/85 px-4 py-1 font-extrabold uppercase">
        ▲ Cop 40 m ▲
      </p>
    </div>
    <p className="text-muted mt-3 max-w-2xl text-sm">
      hud-ink outlines text over the road. flash-hold shows yellow for half a
      second when it mounts. cop-blink is the one blinking element.
    </p>
  </Section>
);

const Notices = () => (
  <Section title="Notice, Toast, AdSlot">
    <div className="bg-asphalt border-line relative h-56 border-2">
      <Notice>Got the club</Notice>
      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
        <Toast tone="green">Dee joined.</Toast>
        <Toast tone="red">
          Lyle lost connection. The bike rides on autopilot.
        </Toast>
      </div>
    </div>
    <div className="mt-10 flex flex-wrap items-start gap-8">
      <AdSlot />
      <AdSlot format="rectangle" />
    </div>
  </Section>
);

const KitPage = () => (
  <div className="bg-ink text-text font-body text-body px-gutter min-h-screen py-10">
    <Heading as="h1">UI kit</Heading>
    <p className="text-muted mt-2 max-w-2xl">
      Every piece the career screens are built from, once, with sample data.
      This page only exists in development.
    </p>
    <div className="mt-10">
      <Tokens />
      <ScreenDemo />
      <Words />
      <Meters />
      <Board />
      <Bills />
      <Riders />
      <Garage />
      <Asking />
      <Hud />
      <Notices />
    </div>
  </div>
);

export const Route = createFileRoute("/kit")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      notFound({ throw: true });
    }
  },
  component: KitPage,
  head: () => ({
    meta: [
      { title: "Rushline UI kit" },
      { content: "noindex", name: "robots" },
    ],
  }),
});
