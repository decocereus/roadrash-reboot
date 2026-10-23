import { bikePitches } from "@racer/career/lines";
import {
  buyBike,
  canBuy,
  canSell,
  sellBike,
  shopStock,
  spendingPower,
} from "@racer/career/shop";
import type { ShopRow } from "@racer/career/shop";
import type { CareerState } from "@racer/career/state";
import { tradeInOf } from "@racer/career/tables";
import { bikes } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import { Confirm } from "@racer/ui/components/confirm";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { formatMoney } from "@racer/ui/components/money";
import { Screen } from "@racer/ui/components/screen";
import { useState } from "react";

import { garagePlates } from "../../assets/clubhouse-art.ts";
import { bikeStats } from "../../career/bike-stats.ts";
import {
  bikeClasses,
  BOUGHT,
  classNames,
  classNotes,
  IN_DEBT_AT_THE_GARAGE,
  NOBODY_WANTS_THE_PUP,
  SOLD,
} from "../../career/copy.ts";
import { bikeName } from "../../career/format.ts";
import { BarHeader, BarNav } from "./bar-chrome.tsx";
import { BikeStand } from "./bike-stand.tsx";
import { SpeechSticker } from "./clubhouse-bar.tsx";
import { Plate, place, Stage, stagePx } from "./clubhouse-stage.tsx";
import { RuledSheet } from "./clubhouse-wall.tsx";
import { useEscape } from "./shared.tsx";

const BACKDROP = { h: 941, w: 1672, x: 0, y: 0 } as const;
const SHEET = { h: 691, w: 470, x: 36, y: 110 } as const;
const SHEET_TITLE = { h: 56, w: 400, x: 70, y: 146 } as const;
const SHEET_ROWS = { h: 407, w: 404, x: 84, y: 264 } as const;
const CLASS_NOTE = { h: 90, w: 372, x: 104, y: 682 } as const;
const NAME = { h: 96, w: 470, x: 520, y: 106 } as const;
const STATS = { h: 196, w: 470, x: 520, y: 206 } as const;
const STAND = { h: 494, w: 760, x: 520, y: 360 } as const;
const MECHANIC = { h: 726, w: 484, x: 1180, y: 128 } as const;
const MECHANIC_SPEECH = { x: 1000, y: 120 } as const;

const PERCENT = 100;
const MECHANIC_NAME = "The mechanic";

const showroomPaint = {
  "brack-anvil-1100": 14,
  "brack-stoker-800": 9,
  "gutter-pup-250": 5,
  "halden-kite-500": 8,
  "halden-meridian-900": 6,
  "halden-wren-400": 0,
  "ostra-nera-1000": 1,
  "ostra-sesta-600": 2,
  "ostra-sette-750": 7,
} as const satisfies Record<BikeId, number>;

type Asking = "nothing" | "buy" | "sell";

const refusalText = (row: ShopRow): string => {
  if (row.refusal === "owned") {
    return "Yours.";
  }
  if (row.refusal === "locked") {
    return `Arrives at level ${row.arrivesAt}.`;
  }
  if (row.refusal === "inDebt") {
    return IN_DEBT_AT_THE_GARAGE;
  }
  if (row.refusal === "short") {
    return `Short by ${formatMoney(-row.leftAfter)}.`;
  }
  return row.refusal === "closed" ? "The garage is shut." : "";
};

const tagOf = (row: ShopRow): string => {
  if (row.owned) {
    return "Yours";
  }
  return row.refusal === "locked"
    ? `Level ${row.arrivesAt}`
    : formatMoney(row.price);
};

const PriceList = ({
  stock,
  bikeId,
  onPick,
  onBuy,
}: {
  readonly stock: readonly ShopRow[];
  readonly bikeId: BikeId;
  readonly onPick: (row: ShopRow) => void;
  readonly onBuy: (row: ShopRow) => void;
}) => {
  const pickOf = (value: string): ShopRow | undefined =>
    stock.find((each) => each.bikeId === value);
  return (
    <section aria-label="For sale">
      <RuledSheet box={SHEET} scale={0.75} />
      <h2
        className="font-display text-ink flex -rotate-6 items-center justify-center leading-none font-black uppercase"
        style={{ ...place(SHEET_TITLE), fontSize: stagePx(38) }}
      >
        For sale
      </h2>
      <MenuList
        autoFocus
        className="grid -rotate-[0.4deg] content-start items-end gap-0"
        label="Catalogue"
        onSelect={(value) => {
          const wanted = pickOf(value);
          if (wanted) {
            onBuy(wanted);
          }
        }}
        onValueChange={(value) => {
          const next = pickOf(value);
          if (next) {
            onPick(next);
          }
        }}
        size="sm"
        style={{
          ...place(SHEET_ROWS),
          fontSize: stagePx(22),
          gridAutoRows: stagePx(33.9),
        }}
        value={bikeId}
      >
        {bikeClasses.map((bikeClass) => (
          <div className="contents" key={bikeClass}>
            <p className="font-display text-ink/55 flex items-end pl-[1.6em] text-[0.7em] leading-[0.8] font-bold tracking-wide uppercase">
              {classNames[bikeClass]}
            </p>
            {stock
              .filter((each) => each.bikeClass === bikeClass)
              .map((each) => (
                <MenuItem
                  className="text-ink data-selected:text-ink data-selected:bg-neon-yellow/85 [&_[data-slot=menu-trailing]]:text-ink/60 w-full items-end rounded-none py-0 !text-[1em] leading-[0.8] tracking-normal"
                  key={each.bikeId}
                  trailing={tagOf(each)}
                  value={each.bikeId}
                >
                  {each.name}
                </MenuItem>
              ))}
          </div>
        ))}
      </MenuList>
    </section>
  );
};

const SpecBoard = ({
  row,
  career,
}: {
  readonly row: ShopRow;
  readonly career: CareerState;
}) => {
  const stats = bikeStats(bikes[row.bikeId], bikes[career.bikeId]);
  return (
    <>
      <div
        className="font-display flex flex-col justify-end leading-none font-bold uppercase"
        style={place(NAME)}
      >
        <h2
          className="font-stencil text-paper drop-shadow-[0_0.06em_0_rgb(0_0_0/60%)]"
          style={{ fontSize: stagePx(50) }}
        >
          {row.name}
        </h2>
        <p
          className="text-neon-yellow mt-[0.3em] tracking-wide"
          style={{ fontSize: stagePx(22) }}
        >
          {classNames[row.bikeClass]} · {formatMoney(row.price)}
        </p>
      </div>
      <dl
        className="bg-ink/85 font-display text-paper flex flex-col justify-center gap-[0.45em] border-y border-white/10 px-[0.9em] font-bold uppercase"
        style={{ ...place(STATS), fontSize: stagePx(17) }}
      >
        {stats.map((stat) => (
          <div
            className="grid grid-cols-[6.2em_1fr_4.8em] items-center gap-x-[0.7em]"
            key={stat.label}
          >
            <dt className="text-paper/70 tracking-wide">{stat.label}</dt>
            <dd className="relative h-[0.5em] bg-white/15">
              <span
                className="bg-neon-yellow absolute inset-y-0 left-0"
                style={{ width: `${Math.min(stat.value, 1) * PERCENT}%` }}
              />
              {stat.baseline !== undefined && (
                <span
                  aria-label="Your bike"
                  className="bg-neon-cyan absolute -inset-y-[0.25em] w-[0.15em]"
                  style={{ left: `${Math.min(stat.baseline, 1) * PERCENT}%` }}
                />
              )}
            </dd>
            <dd className="numeric text-right">{stat.reading ?? ""}</dd>
          </div>
        ))}
        <p className="text-paper/55 mt-[0.2em] text-[0.8em] tracking-wide">
          A wreck at level {career.level} costs {formatMoney(row.repair)} on
          this bike
        </p>
      </dl>
    </>
  );
};

const Totals = ({
  row,
  career,
}: {
  readonly row: ShopRow;
  readonly career: CareerState;
}) => {
  const refusal = refusalText(row);
  return (
    <p
      className="flex items-baseline gap-[1.2em] whitespace-nowrap"
      style={{ fontSize: stagePx(22) }}
    >
      {refusal !== "" && row.refusal !== "owned" ? (
        <span
          className={
            row.refusal === "locked" ? "text-paper/60" : "text-neon-red"
          }
        >
          {refusal}
        </span>
      ) : (
        <span className="text-paper/60">
          Price{" "}
          <span className="text-paper numeric">{formatMoney(row.price)}</span>
        </span>
      )}
      <span className="text-paper/60">
        With trade-in{" "}
        <span className="text-paper numeric">
          {formatMoney(spendingPower(career))}
        </span>
      </span>
      {!row.owned && row.leftAfter >= 0 && (
        <span className="text-paper/60">
          Left after{" "}
          <span className="text-neon-yellow numeric">
            {formatMoney(row.leftAfter)}
          </span>
        </span>
      )}
    </p>
  );
};

export const GarageScreen = ({
  career,
  onTrade,
  onBack,
}: {
  readonly career: CareerState;
  readonly onTrade: (career: CareerState) => void;
  readonly onBack: () => void;
}) => {
  const [bikeId, setBikeId] = useState<BikeId>(career.bikeId);
  const [asking, setAsking] = useState<Asking>("nothing");
  const [said, setSaid] = useState("");
  const stock = shopStock(career);
  const row = stock.find((each) => each.bikeId === bikeId) ?? stock[0];
  useEscape(onBack, asking === "nothing");
  if (!row) {
    return null;
  }
  const sellable = canSell(career);
  const pick = (next: ShopRow) => {
    setBikeId(next.bikeId);
    setSaid("");
  };
  const tryBuy = (wanted: ShopRow) => {
    pick(wanted);
    if (canBuy(career, wanted.bikeId)) {
      setAsking("buy");
    }
  };
  const trySell = () => {
    if (sellable) {
      setAsking("sell");
    } else {
      setSaid(NOBODY_WANTS_THE_PUP);
    }
  };
  return (
    <Screen className="bg-ink flex" enter="fade">
      <Stage inert={asking === "nothing" ? undefined : true}>
        <Plate
          box={BACKDROP}
          className="object-cover"
          src={garagePlates.backdrop}
        />
        <BikeStand paint={showroomPaint[row.bikeId]} style={place(STAND)} />
        <Plate box={MECHANIC} src={garagePlates.mechanic} />
        <SpeechSticker
          at={MECHANIC_SPEECH}
          flip
          speech={{
            line: said === "" ? bikePitches[row.bikeId] : said,
            name: MECHANIC_NAME,
            tag: undefined,
          }}
        />
        <BarHeader career={career} />
        <PriceList
          bikeId={row.bikeId}
          onBuy={tryBuy}
          onPick={pick}
          stock={stock}
        />
        <p
          className="font-display text-ink/75 -rotate-2 leading-tight font-bold normal-case"
          style={{ ...place(CLASS_NOTE), fontSize: stagePx(18) }}
        >
          {classNotes[row.bikeClass]}
        </p>
        <SpecBoard career={career} row={row} />
        <BarNav
          actions={[
            {
              disabled: row.refusal !== null,
              id: "buy",
              label: "Buy",
              run: () => {
                tryBuy(row);
              },
            },
            {
              disabled: !sellable,
              id: "sell",
              label: "Sell",
              run: trySell,
            },
            { id: "back", label: "Back", run: onBack },
          ]}
          autoFocus={false}
          label="Garage"
          primary="buy"
        >
          <Totals career={career} row={row} />
        </BarNav>
      </Stage>
      {asking === "buy" && (
        <Confirm
          defaultValue="yes"
          label="Buy"
          onDismiss={() => {
            setAsking("nothing");
          }}
          onSelect={(value) => {
            setAsking("nothing");
            if (value === "yes") {
              onTrade(buyBike(career, row.bikeId));
              setSaid(BOUGHT);
            }
          }}
          options={[
            { label: "Not yet", value: "no" },
            { label: "Do it", value: "yes" },
          ]}
        >
          Trade your {bikeName(career.bikeId)} for the {row.name}? You'll have{" "}
          {formatMoney(row.leftAfter)} left.
        </Confirm>
      )}
      {asking === "sell" && (
        <Confirm
          defaultValue="no"
          label="Sell"
          onDismiss={() => {
            setAsking("nothing");
          }}
          onSelect={(value) => {
            setAsking("nothing");
            if (value === "yes") {
              onTrade(sellBike(career));
              setSaid(SOLD);
            }
          }}
          options={[
            { label: "Keep it", value: "no" },
            { label: "Sell it", value: "yes" },
          ]}
        >
          Sell the {bikeName(career.bikeId)} for{" "}
          {formatMoney(tradeInOf(career.bikeId))}? You'll ride the Gutter Pup
          and have {formatMoney(spendingPower(career))}.
        </Confirm>
      )}
    </Screen>
  );
};
