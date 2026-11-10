import type { ReactNode } from "react";

import { plates } from "../../assets/clubhouse-art.ts";
import { place, stagePx } from "./clubhouse-stage.tsx";
import type { StageBox } from "./clubhouse-stage.tsx";

const SHEET_SLICE = [297, 50, 445, 80] as const;

export const RuledSheet = ({
  box,
  scale,
}: {
  readonly box: StageBox;
  readonly scale: number;
}) => {
  const widths = SHEET_SLICE.map((edge) => stagePx(edge * scale)).join(" ");
  return (
    <div
      aria-hidden
      style={{
        ...place(box),
        borderImage: `url(${plates.standings}) ${SHEET_SLICE.join(" ")} fill / ${widths} stretch round`,
        borderStyle: "solid",
        borderWidth: widths,
      }}
    />
  );
};

const FIRST_LINE = 206;
const LINE_GAP = 45.2;
const MARGIN = 73;
const RIGHT_EDGE = 50;
const SETTLE = 7;
const TAPE_TOP = 45;
const TAPE_HEIGHT = 78;
const TAPE_TYPE = 50;

export interface RuledLines {
  readonly gap: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export const ruledLines = (box: StageBox, scale: number): RuledLines => {
  const left = box.x + MARGIN * scale + 14;
  return {
    gap: LINE_GAP * scale,
    left,
    top: box.y + FIRST_LINE * scale + SETTLE,
    width: box.x + box.w - RIGHT_EDGE * scale - 20 - left,
  };
};

export const SheetTitle = ({
  box,
  scale,
  children,
}: {
  readonly box: StageBox;
  readonly scale: number;
  readonly children: ReactNode;
}) => (
  <h1
    className="font-display text-ink flex -rotate-6 items-center justify-center leading-none font-black uppercase"
    style={{
      ...place({
        h: TAPE_HEIGHT * scale,
        w: box.w - 90,
        x: box.x + 40,
        y: box.y + TAPE_TOP * scale,
      }),
      fontSize: stagePx(TAPE_TYPE * scale),
    }}
  >
    {children}
  </h1>
);

export const WrittenSheet = ({
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
  const lines = ruledLines(box, scale);
  return (
    <section aria-label={title}>
      <RuledSheet box={box} scale={scale} />
      <SheetTitle box={box} scale={scale}>
        {title}
      </SheetTitle>
      <p
        className="font-display text-ink/85 -rotate-[0.4deg] font-bold"
        style={{
          ...place({
            h: box.h * 0.6,
            w: lines.width,
            x: lines.left,
            y: lines.top,
          }),
          fontSize: stagePx(lines.gap * 0.72),
          lineHeight: stagePx(lines.gap),
        }}
      >
        {text}
      </p>
    </section>
  );
};

export const stampStyle =
  "font-stencil border-[0.12em] px-[0.3em] leading-none whitespace-nowrap uppercase";
