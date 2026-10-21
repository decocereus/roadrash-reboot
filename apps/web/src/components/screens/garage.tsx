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
import { BikeCard } from "@racer/ui/components/bike-card";
import { Confirm } from "@racer/ui/components/confirm";
import { Heading } from "@racer/ui/components/heading";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { formatMoney, Money } from "@racer/ui/components/money";
import { Toast } from "@racer/ui/components/notice";
import { Panel } from "@racer/ui/components/panel";
import { Screen, ScreenBody, ScreenStrip } from "@racer/ui/components/screen";
import { Stat } from "@racer/ui/components/stat";
import { useState } from "react";

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
import { ActionMenu, useEscape } from "./shared.tsx";

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

const markOf = (row: ShopRow): string | undefined => {
  if (row.owned) {
    return "●";
  }
  return row.refusal === "locked" ? "🔒" : undefined;
};

export function GarageScreen({
  career,
  onTrade,
  onBack,
}: {
  readonly career: CareerState;
  readonly onTrade: (career: CareerState) => void;
  readonly onBack: () => void;
}) {
  const [bikeId, setBikeId] = useState<BikeId>(career.bikeId);
  const [asking, setAsking] = useState<Asking>("nothing");
  const [said, setSaid] = useState("");
  const stock = shopStock(career);
  const row = stock.find((each) => each.bikeId === bikeId) ?? stock[0];
  useEscape(onBack, asking === "nothing");
  if (!row) {
    return null;
  }
  const bike = bikes[row.bikeId];
  const owned = bikes[career.bikeId];
  const sellable = canSell(career);
  const tryBuy = (wanted: ShopRow) => {
    setBikeId(wanted.bikeId);
    setSaid("");
    if (canBuy(career, wanted.bikeId)) {
      setAsking("buy");
    }
  };
  const pickOf = (value: string): ShopRow | undefined =>
    stock.find((each) => each.bikeId === value);
  const trySell = () => {
    if (sellable) {
      setAsking("sell");
    } else {
      setSaid(NOBODY_WANTS_THE_PUP);
    }
  };
  const behind = asking === "nothing" ? undefined : true;
  return (
    <Screen enter="fade">
      <ScreenStrip>
        <Heading as="h1">Garage</Heading>
        <div className="flex gap-x-10">
          <Stat
            align="right"
            label={career.cash < 0 ? "Owed" : "Cash"}
            size="sm"
            tone={career.cash < 0 ? "red" : "green"}
            value={formatMoney(Math.abs(career.cash))}
          />
          <Stat
            align="right"
            label="Trade"
            size="sm"
            value={formatMoney(tradeInOf(career.bikeId))}
          />
        </div>
      </ScreenStrip>
      <ScreenBody
        className="grid grid-cols-[minmax(15rem,0.8fr)_1.3fr_1fr] items-start gap-6 overflow-y-auto"
        inert={behind}
      >
        <Panel>
          <MenuList
            autoFocus
            className="w-full"
            label="Catalogue"
            onSelect={(value) => {
              const wanted = pickOf(value);
              if (wanted) {
                tryBuy(wanted);
              }
            }}
            onValueChange={(value) => {
              const next = pickOf(value);
              if (next) {
                setBikeId(next.bikeId);
                setSaid("");
              }
            }}
            size="sm"
            value={row.bikeId}
          >
            {bikeClasses.map((bikeClass) => (
              <div className="contents" key={bikeClass}>
                <Heading
                  as="h2"
                  className="mt-2 first:mt-0"
                  size="sm"
                  tone="muted"
                >
                  {classNames[bikeClass]}
                </Heading>
                {stock
                  .filter((each) => each.bikeClass === bikeClass)
                  .map((each) => (
                    <MenuItem
                      className="w-full"
                      key={each.bikeId}
                      trailing={markOf(each)}
                      value={each.bikeId}
                    >
                      {each.name}
                    </MenuItem>
                  ))}
              </div>
            ))}
          </MenuList>
        </Panel>
        <BikeCard
          bikeClass={classNames[row.bikeClass]}
          className="w-full"
          locked={
            row.refusal === "locked"
              ? `Arrives at level ${row.arrivesAt}`
              : undefined
          }
          name={row.name}
          note={`A wreck at Level ${career.level} costs ${formatMoney(row.repair)} on this bike.`}
          owned={row.owned}
          pitch={bikePitches[row.bikeId]}
          price={row.price}
          stats={bikeStats(bike, owned)}
        />
        <div className="flex flex-col gap-4">
          <Panel className="flex flex-col gap-2">
            <Heading as="h2" size="sm" tone="muted">
              {classNames[row.bikeClass]}
            </Heading>
            <p className="text-pretty">{classNotes[row.bikeClass]}</p>
          </Panel>
          {row.refusal !== null && row.refusal !== "owned" && (
            <p
              className={
                row.refusal === "locked"
                  ? "text-label text-muted font-semibold uppercase"
                  : "text-label text-red font-semibold uppercase"
              }
            >
              {refusalText(row)}
            </p>
          )}
          {said !== "" && <Toast tone="yellow">{said}</Toast>}
        </div>
      </ScreenBody>
      <ScreenStrip edge="bottom" inert={behind}>
        <div className="flex flex-wrap gap-x-10 gap-y-2">
          <Stat label="Price" size="sm" value={formatMoney(row.price)} />
          <Stat
            label="You have with trade-in"
            size="sm"
            value={<Money amount={spendingPower(career)} kind="balance" />}
          />
          {!row.owned && (
            <Stat
              label={row.leftAfter < 0 ? "Short by" : "Left after"}
              size="sm"
              tone={row.leftAfter < 0 ? "red" : "text"}
              value={formatMoney(Math.abs(row.leftAfter))}
            />
          )}
        </div>
        <ActionMenu
          actions={[
            { id: "back", label: "Back", run: onBack },
            {
              detail: sellable
                ? `${bikeName(career.bikeId)} for ${formatMoney(tradeInOf(career.bikeId))}`
                : undefined,
              disabled: !sellable,
              id: "sell",
              label: "Sell",
              run: trySell,
            },
            {
              disabled: row.refusal !== null,
              id: "buy",
              label: "Buy",
              run: () => {
                tryBuy(row);
              },
            },
          ]}
          autoFocus={false}
          label="Garage"
          primary="buy"
        />
      </ScreenStrip>
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
}
