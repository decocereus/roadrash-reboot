export interface RiderColours {
  readonly bike: number;
  readonly jacket: number;
  readonly helmet: number;
  readonly trim?: number;
}

export const riderPalette: readonly RiderColours[] = [
  { bike: 0xc8_2f_2f, helmet: 0xf2_c2_30, jacket: 0x23_26_2c },
  {
    bike: 0x15_17_1b,
    helmet: 0x15_17_1b,
    jacket: 0x15_17_1b,
    trim: 0xd4_a6_3a,
  },
  { bike: 0x26_a6_a0, helmet: 0xed_e4_d0, jacket: 0xa8_74_3e },
  { bike: 0x2f_9a_4e, helmet: 0xf2_ee_e6, jacket: 0xd7_26_3d },
  { bike: 0xf2_ec_df, helmet: 0xff_ff_ff, jacket: 0xf2_ec_df },
  { bike: 0x77_80_6a, helmet: 0x5b_43_2e, jacket: 0x3f_4a_57 },
  { bike: 0x22_33_5c, helmet: 0x22_33_5c, jacket: 0x8a_7a_55 },
  { bike: 0xe0_40_a0, helmet: 0xe0_40_a0, jacket: 0x7b_4f_e0 },
  { bike: 0xe0_a2_1b, helmet: 0xf2_ee_e6, jacket: 0x1e_5a_a8 },
  { bike: 0xc2_52_1f, helmet: 0x2b_2e_33, jacket: 0x5b_46_32 },
  { bike: 0x6b_6b_3a, helmet: 0xf2_c2_30, jacket: 0xc8_e0_3a },
  {
    bike: 0xf4_f6_f8,
    helmet: 0xf4_f6_f8,
    jacket: 0x14_1c_33,
    trim: 0x2f_6b_ff,
  },
  { bike: 0xf2_7d_16, helmet: 0xff_ff_ff, jacket: 0x1d_7a_8c },
  { bike: 0x5f_b7_e6, helmet: 0x5f_b7_e6, jacket: 0xe9_e3_d6 },
  { bike: 0x6b_4a_2b, helmet: 0x6b_4a_2b, jacket: 0x8c_9a_5b },
  { bike: 0xbf_c4_c9, helmet: 0xf6_f2_ea, jacket: 0x1a_1a_1f },
  { bike: 0x7a_1f_3d, helmet: 0xf2_6b_1d, jacket: 0xf2_6b_1d },
  { bike: 0x6a_d6_b5, helmet: 0xfa_fa_fa, jacket: 0x2b_5f_8f },
];

export const trafficPaints = [
  0xe8_e2_d6, 0x2f_6f_d0, 0xc8_32_3c, 0x2f_8f_6b, 0xd8_a0_20, 0x3a_35_50,
] as const;

export const PLAYER_COLOURS = 0;
export const POLICE_COLOURS = 11;

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

export const blockCssOf = (colour: number): string =>
  `#${(riderBlocks[colour]?.suit ?? 0).toString(16).padStart(6, "0")}`;
