interface Fluid {
  readonly rem: number;
  readonly vmin: number;
  readonly maxRem: number;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

interface Band {
  readonly top: number;
  readonly bottom: number;
}

export interface HudBands {
  readonly warning: Band;
  readonly tower: Band & { readonly left: number };
  readonly notice: Band;
  readonly centreHalf: number;
}

export type TowerRows = "all" | number;

const ROOT_PX = 16;
const PERCENT = 100;
const EDGE = 0.03;
const NOTICE_TOP = 0.3;
const TOWER_RIGHT = 0.02;
const BAND_GAP_REM = 0.25;
const WARNING_PAD_REM = 0.25;
const WARNING_SIDE_PAD_REM = 1;
const WARNING_TEXT_EM = 8.7;
const NOTICE_FONT_PX = 36;
const NOTICE_LINE_PX = 40;
const NOTICE_TEXT_EM = 6.1;
const DIAL_HEIGHT = 0.25;
const DIAL_MIN_PX = 144;
const DIAL_ASPECT = 1.08;
const TOWER_PAD_EM = 0.3;
const TOWER_WINDOW = 5;

export const ROW_EM = 1.3;

export const warningFont: Fluid = { maxRem: 2.5, rem: 1.375, vmin: 3.89 };
const towerFont: Fluid = { maxRem: 1.5, rem: 0.875, vmin: 2.5 };
const towerWidth: Fluid = { maxRem: 18, rem: 10.5, vmin: 30 };

export const cssOf = ({ maxRem, rem, vmin }: Fluid): string =>
  `clamp(${rem}rem, ${vmin}vmin, ${maxRem}rem)`;

const pxOf = ({ maxRem, rem, vmin }: Fluid, view: Viewport): number =>
  Math.min(
    maxRem * ROOT_PX,
    Math.max(
      rem * ROOT_PX,
      (vmin / PERCENT) * Math.min(view.width, view.height)
    )
  );

const percent = (share: number): string => `${share * PERCENT}%`;

const underWarning = `calc(${percent(EDGE)} + ${cssOf(warningFont)} + ${2 * WARNING_PAD_REM + BAND_GAP_REM}rem)`;

export const hudEdge = percent(EDGE);
export const noticeTop = percent(NOTICE_TOP);
export const warningPad = `${WARNING_PAD_REM}rem ${WARNING_SIDE_PAD_REM}rem`;

export const towerBox = (rows: TowerRows, drawn: number) => ({
  contain: "layout size",
  fontSize: cssOf(towerFont),
  height: `${2 * TOWER_PAD_EM + drawn * ROW_EM}em`,
  padding: `${TOWER_PAD_EM}em`,
  right: percent(TOWER_RIGHT),
  top: rows === "all" ? hudEdge : underWarning,
  width: cssOf(towerWidth),
});

const warningBottomPx = (view: Viewport): number =>
  EDGE * view.height + pxOf(warningFont, view) + 2 * WARNING_PAD_REM * ROOT_PX;

const towerTopPx = (view: Viewport, rows: TowerRows): number =>
  rows === "all"
    ? EDGE * view.height
    : warningBottomPx(view) + BAND_GAP_REM * ROOT_PX;

const centreHalfPx = (view: Viewport): number =>
  Math.max(
    (WARNING_TEXT_EM * pxOf(warningFont, view)) / 2 +
      WARNING_SIDE_PAD_REM * ROOT_PX,
    (NOTICE_TEXT_EM * NOTICE_FONT_PX) / 2,
    (Math.max(DIAL_MIN_PX, DIAL_HEIGHT * view.height) * DIAL_ASPECT) / 2
  ) +
  BAND_GAP_REM * ROOT_PX;

const towerLeftPx = (view: Viewport): number =>
  view.width * (1 - TOWER_RIGHT) - pxOf(towerWidth, view);

export const towerRowsAt = (view: Viewport): TowerRows => {
  if (towerLeftPx(view) >= view.width / 2 + centreHalfPx(view)) {
    return "all";
  }
  const font = pxOf(towerFont, view);
  const room =
    NOTICE_TOP * view.height -
    towerTopPx(view, 1) -
    BAND_GAP_REM * ROOT_PX -
    2 * TOWER_PAD_EM * font;
  return Math.max(
    1,
    Math.min(TOWER_WINDOW, Math.floor(room / (ROW_EM * font)))
  );
};

export const hudBands = (
  view: Viewport,
  rows: TowerRows,
  shown: number
): HudBands => {
  const font = pxOf(towerFont, view);
  const towerTop = towerTopPx(view, rows);
  return {
    centreHalf: centreHalfPx(view),
    notice: {
      bottom: NOTICE_TOP * view.height + NOTICE_LINE_PX,
      top: NOTICE_TOP * view.height,
    },
    tower: {
      bottom: towerTop + (2 * TOWER_PAD_EM + shown * ROW_EM) * font,
      left: towerLeftPx(view),
      top: towerTop,
    },
    warning: { bottom: warningBottomPx(view), top: EDGE * view.height },
  };
};

export const windowOf = <Row extends { readonly you: boolean }>(
  rows: readonly Row[],
  shown: TowerRows
): readonly Row[] => {
  if (shown === "all" || rows.length <= shown) {
    return rows;
  }
  const you = Math.max(
    0,
    rows.findIndex((row) => row.you)
  );
  const around = shown - 1;
  if (around === 0) {
    return rows.slice(you, you + 1);
  }
  const first = Math.min(
    Math.max(1, you - Math.floor(around / 2)),
    rows.length - around
  );
  return [...rows.slice(0, 1), ...rows.slice(first, first + around)];
};
