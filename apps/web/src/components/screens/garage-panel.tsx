import { buyBike, sellBike } from "@racer/career/shop";
import type { ShopRow } from "@racer/career/shop";
import type { CareerState } from "@racer/career/state";
import { STARTING_BIKE, tradeInOf } from "@racer/career/tables";
import { bikes } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import {
  Panel,
  PanelLine,
  PanelRule,
  PanelTitle,
} from "@racer/ui/components/kit-panel";
import { formatMoney } from "@racer/ui/components/money";
import { Pager } from "@racer/ui/components/pager";
import {
  SkewButton,
  TextButton,
  TextLinks,
} from "@racer/ui/components/skew-button";
import { StatBar } from "@racer/ui/components/stat-bar";
import { useEffect, useState } from "react";

import { bikeStats, topSpeedKmh } from "../../career/bike-stats.ts";
import {
  BOUGHT,
  IN_DEBT_AT_THE_GARAGE,
  NOBODY_WANTS_THE_PUP,
  SOLD,
} from "../../career/copy.ts";
import { bikeName } from "../../career/format.ts";
import {
  actionFor,
  shelfPick,
  shelves,
  standOf,
  steppedPick,
} from "../../career/garage-stand.ts";
import type {
  GarageAction,
  GaragePick,
  Shelf,
} from "../../career/garage-stand.ts";
import { keptByControl } from "../../key-target.ts";
import { useEscape } from "./shared.tsx";

const shelfLabels = {
  catalogue: "Catalogue",
  forSale: "For sale",
  yours: "Yours",
} as const satisfies Record<Shelf, string>;

const statTones = ["yellow", "cyan", "magenta"] as const;

const STEP_KEYS = { ArrowLeft: -1, ArrowRight: 1 } as const;

type Offer = Extract<GarageAction, { kind: "buy" | "sell" }>;

const summaryOf = (row: ShopRow): string => {
  const speed = `Top speed ${topSpeedKmh(bikes[row.bikeId])} km/h.`;
  if (row.owned) {
    return `Yours. ${speed}`;
  }
  return row.refusal === "locked"
    ? `Tier ${row.arrivesAt}. ${speed}`
    : `${formatMoney(row.price)}. ${speed}`;
};

const buyNumbers = (cash: number, price: number, withTradeIn: number) =>
  withTradeIn > 0
    ? `You have ${formatMoney(cash)}. Price ${formatMoney(price)}, ${formatMoney(withTradeIn)} with your trade-in.`
    : `You have ${formatMoney(cash)}. Price ${formatMoney(price)}. Your trade-in covers it with ${formatMoney(-withTradeIn)} over.`;

const refusedDetail = (
  career: CareerState,
  action: Extract<GarageAction, { kind: "refused" }>
): string => {
  const { row } = action;
  switch (action.refusal) {
    case "closed": {
      return "The garage is shut.";
    }
    case "inDebt": {
      return IN_DEBT_AT_THE_GARAGE;
    }
    case "locked": {
      return `Arrives at tier ${row.arrivesAt}.`;
    }
    case "short": {
      return `${buyNumbers(career.cash, row.price, row.price - tradeInOf(career.bikeId))} Short by ${formatMoney(-row.leftAfter)}.`;
    }
    default: {
      return action.refusal satisfies never;
    }
  }
};

const ActionCard = ({
  career,
  action,
  onAsk,
}: {
  readonly career: CareerState;
  readonly action: GarageAction;
  readonly onAsk: (offer: Offer) => void;
}) => {
  switch (action.kind) {
    case "sell": {
      return (
        <SkewButton
          detail={`The mechanic pays ${formatMoney(action.pays)}.`}
          onClick={() => {
            onAsk(action);
          }}
          title="Sell"
        />
      );
    }
    case "cantSell": {
      return <SkewButton detail={NOBODY_WANTS_THE_PUP} disabled title="Sell" />;
    }
    case "buy": {
      return (
        <SkewButton
          detail={buyNumbers(action.cash, action.price, action.withTradeIn)}
          onClick={() => {
            onAsk(action);
          }}
          title="Buy"
          tone="primary"
        />
      );
    }
    case "refused": {
      return (
        <SkewButton
          detail={refusedDetail(career, action)}
          disabled
          title="Buy"
        />
      );
    }
    default: {
      return action satisfies never;
    }
  }
};

const questionOf = (
  career: CareerState,
  row: ShopRow,
  offer: Offer
): string => {
  switch (offer.kind) {
    case "buy": {
      return `Trade your ${bikeName(career.bikeId)} for the ${row.name}? You'll have ${formatMoney(offer.leftAfter)} left.`;
    }
    case "sell": {
      return `Sell the ${bikeName(career.bikeId)} for ${formatMoney(offer.pays)}? You ride the Gutter Pup and have ${formatMoney(offer.cashAfter)}.`;
    }
    default: {
      return offer satisfies never;
    }
  }
};

const Asked = ({
  career,
  row,
  offer,
  onAnswer,
}: {
  readonly career: CareerState;
  readonly row: ShopRow;
  readonly offer: Offer;
  readonly onAnswer: (yes: boolean) => void;
}) => {
  useEscape(() => {
    onAnswer(false);
  });
  const buying = offer.kind === "buy";
  return (
    <div aria-label={buying ? "Buy" : "Sell"} role="group">
      <PanelLine>{questionOf(career, row, offer)}</PanelLine>
      <SkewButton
        autoFocus
        className="mt-3"
        onClick={() => {
          onAnswer(true);
        }}
        title={buying ? "Do it" : "Sell it"}
        tone="primary"
      />
      <TextLinks>
        <TextButton
          onClick={() => {
            onAnswer(false);
          }}
        >
          {buying ? "Not yet" : "Keep it"}
        </TextButton>
      </TextLinks>
    </div>
  );
};

export const GaragePanel = ({
  career,
  pick,
  onPick,
  onTrade,
}: {
  readonly career: CareerState;
  readonly pick: GaragePick;
  readonly onPick: (pick: GaragePick) => void;
  readonly onTrade: (career: CareerState) => void;
}) => {
  const [asking, setAsking] = useState<Offer | null>(null);
  const [said, setSaid] = useState("");
  const { row } = standOf(career, pick);
  const action = actionFor(career, row);
  const answer = (offer: Offer, yes: boolean): void => {
    setAsking(null);
    if (!yes) {
      return;
    }
    const traded =
      offer.kind === "buy" ? buyBike(career, row.bikeId) : sellBike(career);
    onTrade(traded);
    onPick(shelfPick(traded, "yours"));
    setSaid(offer.kind === "buy" ? BOUGHT : SOLD);
  };
  return (
    <Panel aria-label="Garage" className="h-full">
      <PanelTitle>{row.name}</PanelTitle>
      <PanelRule />
      <PanelLine>{summaryOf(row)}</PanelLine>
      <ul className="flex flex-col gap-1.5">
        {bikeStats(bikes[row.bikeId]).map((stat, index) => (
          <StatBar
            key={stat.label}
            label={stat.label}
            share={stat.value}
            tone={statTones[index % statTones.length] ?? "yellow"}
          />
        ))}
      </ul>
      <PanelRule className="mt-1" />
      <div aria-label="Shelf" className="grid grid-cols-3 gap-3" role="group">
        {shelves.map((shelf) => (
          <SkewButton
            aria-pressed={shelf === pick.shelf}
            className="px-2"
            key={shelf}
            onClick={() => {
              setSaid("");
              setAsking(null);
              onPick(shelfPick(career, shelf));
            }}
            size="slim"
            title={shelfLabels[shelf]}
            tone={shelf === pick.shelf ? "primary" : "plain"}
          />
        ))}
      </div>
      {asking === null ? (
        <ActionCard action={action} career={career} onAsk={setAsking} />
      ) : (
        <Asked
          career={career}
          offer={asking}
          onAnswer={(yes) => {
            answer(asking, yes);
          }}
          row={row}
        />
      )}
      {said !== "" && (
        <PanelLine role="status" tone="quiet">
          {said}
        </PanelLine>
      )}
      <PanelLine className="mt-auto" tone="quiet">
        Room races put everyone on the same bike.
      </PanelLine>
    </Panel>
  );
};

export const GarageStepper = ({
  career,
  pick,
  onPick,
}: {
  readonly career: CareerState;
  readonly pick: GaragePick;
  readonly onPick: (pick: GaragePick) => void;
}) => {
  const { place, rows } = standOf(career, pick);
  const step = (by: 1 | -1): void => {
    onPick(steppedPick(career, pick, by));
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (
        (event.code === "ArrowLeft" || event.code === "ArrowRight") &&
        !keptByControl(event.target, event.code)
      ) {
        step(STEP_KEYS[event.code]);
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
    };
  });
  return (
    <Pager
      className="absolute bottom-16 left-6"
      label="Bikes on this shelf"
      onBack={() => {
        step(-1);
      }}
      onNext={() => {
        step(1);
      }}
    >
      Bike {place}/{rows.length}
    </Pager>
  );
};

interface OpenGarage {
  readonly career: CareerState;
  readonly pick: GaragePick;
}

export interface Garage {
  readonly open: OpenGarage | null;
  readonly standBike: BikeId;
  readonly pick: (pick: GaragePick) => void;
  readonly reset: () => void;
}

export const useGarage = (
  career: CareerState | null,
  shown: boolean
): Garage => {
  const [picked, setPicked] = useState<GaragePick | null>(null);
  const open =
    career !== null && shown
      ? { career, pick: picked ?? shelfPick(career, "yours") }
      : null;
  return {
    open,
    pick: setPicked,
    reset() {
      setPicked(null);
    },
    standBike:
      open === null
        ? (career?.bikeId ?? STARTING_BIKE)
        : standOf(open.career, open.pick).row.bikeId,
  };
};
