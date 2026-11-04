import type { Palette } from "./assets.ts";

export interface RiderBlocks {
  readonly name: string;
  readonly suit: number;
  readonly panel: number;
  readonly helmet: number;
  readonly helmetTrim: number;
  readonly livery: { readonly bike: number; readonly trim: number };
}

export const riderBlocks: readonly RiderBlocks[] = [
  {
    helmet: 0xf2_c2_30,
    helmetTrim: 0xff_2e_3d,
    livery: { bike: 0xff_2e_3d, trim: 0xf2_c2_30 },
    name: "SKY",
    panel: 0x18_10_24,
    suit: 0xff_2e_3d,
  },
  {
    helmet: 0xf4_f6_f8,
    helmetTrim: 0x1f_5c_ff,
    livery: { bike: 0x1f_5c_ff, trim: 0xf4_f6_f8 },
    name: "PARKER",
    panel: 0x0e_1c_58,
    suit: 0x1f_5c_ff,
  },
  {
    helmet: 0x18_b8_5a,
    helmetTrim: 0xf4_f6_f8,
    livery: { bike: 0x18_b8_5a, trim: 0xf4_f6_f8 },
    name: "JORDAN",
    panel: 0x0a_3a_2a,
    suit: 0x18_b8_5a,
  },
  {
    helmet: 0xff_7a_1a,
    helmetTrim: 0x18_10_24,
    livery: { bike: 0xff_7a_1a, trim: 0x18_10_24 },
    name: "RILEY",
    panel: 0x4a_1c_10,
    suit: 0xff_7a_1a,
  },
  {
    helmet: 0xff_2b_d6,
    helmetTrim: 0x8a_3f_ff,
    livery: { bike: 0x8a_3f_ff, trim: 0xff_2b_d6 },
    name: "MORGAN",
    panel: 0xff_2b_d6,
    suit: 0x8a_3f_ff,
  },
  {
    helmet: 0xff_ea_2e,
    helmetTrim: 0x12_24_5a,
    livery: { bike: 0xff_ea_2e, trim: 0x12_24_5a },
    name: "KAI",
    panel: 0x12_24_5a,
    suit: 0xff_ea_2e,
  },
  {
    helmet: 0x0d_0a_16,
    helmetTrim: 0x19_e6_ff,
    livery: { bike: 0x19_e6_ff, trim: 0x0d_0a_16 },
    name: "QUINN",
    panel: 0x0a_6a_7a,
    suit: 0x19_e6_ff,
  },
  {
    helmet: 0xff_2e_3d,
    helmetTrim: 0xf8_f8_f4,
    livery: { bike: 0xf8_f8_f4, trim: 0xff_2e_3d },
    name: "CASEY",
    panel: 0xff_2e_3d,
    suit: 0xcf_dc_f0,
  },
];

export const blockPaletteOf = (blocks: RiderBlocks): Palette =>
  new Map<string, number>([
    ["helmet", blocks.helmet],
    ["helmet2", blocks.helmetTrim],
    ["suit", blocks.suit],
    ["suit2", blocks.panel],
  ]);

export const raceBlocksFor = (index: number): RiderBlocks | null =>
  import.meta.env.DEV &&
  new URLSearchParams(globalThis.location.search).has("blocks")
    ? (riderBlocks[index % riderBlocks.length] ?? null)
    : null;
