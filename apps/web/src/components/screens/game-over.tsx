import type { CareerState } from "@racer/career/state";
import { endings } from "@racer/career/story";
import { bikes } from "@racer/sim/bikes";
import type { BikeId } from "@racer/sim/bikes";
import { formatMoney } from "@racer/ui/components/money";
import { Screen } from "@racer/ui/components/screen";
import { cn } from "@racer/ui/utils";

import { gameOverPlates, plates } from "../../assets/clubhouse-art.ts";
import { BROKE_CARD } from "../../career/copy.ts";
import { bikeName } from "../../career/format.ts";
import { BarHeader, BarNav } from "./bar-chrome.tsx";
import {
  BarBackdrop,
  BarLight,
  BarSeats,
  useBarClock,
} from "./clubhouse-bar.tsx";
import { Plate, place, Stage, stagePx } from "./clubhouse-stage.tsx";
import type { StageBox } from "./clubhouse-stage.tsx";
import { RuledSheet, stampStyle } from "./clubhouse-wall.tsx";
import { useEscape } from "./shared.tsx";

const BACKDROP = { h: 941, w: 1672, x: 0, y: 0 } as const;
const BROKE_SHEET = { h: 691, w: 470, x: 36, y: 110 } as const;
const BROKE_RECORD = { h: 302, w: 420, x: 1230, y: 540 } as const;
const ENDING_SHEET = { h: 740, w: 570, x: 548, y: 104 } as const;
const ENDING_STAMP = { h: 146, w: 500, x: 1146, y: 104 } as const;
const ENDING_RECORD = { h: 403, w: 560, x: 1100, y: 262 } as const;

const FIRST_LINE = 206;
const LINE_GAP = 45.2;
const MARGIN = 73;
const RIGHT_EDGE = 50;
const SETTLE = 7;

const bestBike = (garage: readonly BikeId[]): string => {
  const [best] = garage.toSorted(
    (left, right) => bikes[right].price - bikes[left].price
  );
  return best === undefined ? "" : bikeName(best);
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const WrittenSheet = ({
  box,
  scale,
  title,
  text,
}: {
  readonly box: StageBox;
  readonly scale: number;
  readonly title: string;
  readonly text: string;
}) => {
  const gap = LINE_GAP * scale;
  const left = box.x + MARGIN * scale + 14;
  const top = box.y + FIRST_LINE * scale + SETTLE;
  return (
    <section aria-label={title}>
      <RuledSheet box={box} scale={scale} />
      <h1
        className="font-display text-ink flex -rotate-6 items-center justify-center leading-none font-black uppercase"
        style={{
          ...place({ h: 58, w: box.w - 90, x: box.x + 40, y: box.y + 34 }),
          fontSize: stagePx(38),
        }}
      >
        {title}
      </h1>
      <p
        className="font-display text-ink/85 -rotate-[0.4deg] font-bold"
        style={{
          ...place({
            h: box.h * 0.6,
            w: box.x + box.w - RIGHT_EDGE * scale - 20 - left,
            x: left,
            y: top,
          }),
          fontSize: stagePx(gap * 0.72),
          lineHeight: stagePx(gap),
        }}
      >
        {text}
      </p>
    </section>
  );
};

const RecordLine = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) => (
  <div className="flex items-baseline justify-between gap-[0.6em]">
    <dt className="text-paper/75">{label}</dt>
    <dd className="numeric text-right">{value}</dd>
  </div>
);

const RecordNote = ({
  box,
  career,
  money,
}: {
  readonly box: StageBox;
  readonly career: CareerState;
  readonly money: boolean;
}) => {
  const { record } = career;
  return (
    <section aria-label="Record">
      <Plate box={box} src={plates.noteCyan} />
      <dl
        className="font-display text-paper flex -rotate-3 flex-col justify-center gap-[0.3em] leading-none font-bold uppercase"
        style={{
          ...place({
            h: box.h * 0.62,
            w: box.w * 0.5,
            x: box.x + box.w * 0.11,
            y: box.y + box.h * 0.18,
          }),
          fontSize: stagePx(box.w / 27),
        }}
      >
        <RecordLine label="Reached" value={`Level ${career.level}`} />
        <RecordLine
          label="Races"
          value={`${record.starts} · ${plural(record.wins, "win", "wins")}`}
        />
        <RecordLine
          label="Knocked down"
          value={plural(record.knockdowns, "rider", "riders")}
        />
        <RecordLine
          label="Busted"
          value={plural(record.busts, "time", "times")}
        />
        {money ? (
          <RecordLine label="Earned" value={formatMoney(record.earnings)} />
        ) : (
          <RecordLine label="Best bike" value={bestBike(career.garage)} />
        )}
      </dl>
    </section>
  );
};

export const GameOverScreen = ({
  career,
  onNewCareer,
  onBackRoom,
}: {
  readonly career: CareerState;
  readonly onNewCareer: () => void;
  readonly onBackRoom: () => void;
}) => {
  useEscape(onBackRoom);
  return (
    <Screen className="bg-ink flex [animation-duration:600ms]" enter="fade">
      <Stage>
        <Plate
          box={BACKDROP}
          className="object-cover"
          src={gameOverPlates.backdrop}
        />
        <BarHeader career={career} />
        <WrittenSheet
          box={BROKE_SHEET}
          scale={0.75}
          text={BROKE_CARD}
          title="Broke"
        />
        <RecordNote box={BROKE_RECORD} career={career} money={false} />
        <BarNav
          actions={[
            { id: "new", label: "New career", run: onNewCareer },
            { id: "back-room", label: "Back room", run: onBackRoom },
          ]}
          label="Game over"
          primary="new"
        >
          <p
            className="text-paper/60 tracking-wide"
            style={{ fontSize: stagePx(20) }}
          >
            The Lowside car park, after closing
          </p>
        </BarNav>
      </Stage>
    </Screen>
  );
};

export const EndingScreen = ({
  career,
  onBackRoom,
}: {
  readonly career: CareerState;
  readonly onBackRoom: () => void;
}) => {
  const clock = useBarClock();
  const ending = career.story.ending ? endings[career.story.ending] : null;
  useEscape(onBackRoom);
  return (
    <Screen
      className="flex"
      enter="fade"
      style={{
        backgroundImage: `url(${plates.wall})`,
        backgroundSize: "60vw auto",
      }}
    >
      <Stage>
        <BarBackdrop clock={clock} />
        <BarSeats figure={null} />
        <BarHeader career={career} />
        <WrittenSheet
          box={ENDING_SHEET}
          scale={0.7}
          text={ending?.note ?? ""}
          title={ending?.name ?? "The Long Ridge"}
        />
        <div
          className="font-display flex items-center justify-center font-bold uppercase"
          style={place(ENDING_STAMP)}
        >
          <p
            className={cn(
              stampStyle,
              "bg-ink/80 text-neon-yellow border-neon-yellow -rotate-6"
            )}
            style={{ fontSize: stagePx(64) }}
          >
            Season over
          </p>
        </div>
        <RecordNote box={ENDING_RECORD} career={career} money />
        <BarLight clock={clock} />
        <BarNav
          actions={[{ id: "back-room", label: "Back room", run: onBackRoom }]}
          label="Ending"
          primary="back-room"
        />
      </Stage>
    </Screen>
  );
};
