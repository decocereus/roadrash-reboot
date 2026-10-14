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

export const PLAYER_COLOURS = 0;
export const POLICE_COLOURS = 11;
