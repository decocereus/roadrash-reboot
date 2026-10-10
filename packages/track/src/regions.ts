export type RegionId =
  | "salt-coast"
  | "cinder-flats"
  | "kettle-woods"
  | "lowtown"
  | "stonepeak";

export interface PropMix {
  readonly tree: number;
  readonly pole: number;
  readonly rock: number;
  readonly chevron: number;
}

export interface GroundColours {
  readonly near: number;
  readonly far: number;
  readonly patch: number;
}

export interface Region {
  readonly id: RegionId;
  readonly name: string;
  readonly skyZenith: number;
  readonly skyHorizon: number;
  readonly asphalt: number;
  readonly ground: GroundColours;
  readonly backdrop: number;
  readonly sunlight: number;
  readonly sunStrength: number;
  readonly skylight: number;
  readonly skyStrength: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly propMix: PropMix;
}

export const regions = {
  "cinder-flats": {
    asphalt: 0x4b_46_40,
    backdrop: 0xd8_b4_8a,
    fogFar: 2600,
    fogNear: 320,
    ground: { far: 0xa8_51_2e, near: 0xc9_92_5a, patch: 0xe3_cf_a5 },
    id: "cinder-flats",
    name: "Cinder Flats",
    propMix: { chevron: 1, pole: 0.5, rock: 0.8, tree: 0.12 },
    skyHorizon: 0xf1_d9_b0,
    skyStrength: 1.8,
    skyZenith: 0x4a_8f_d4,
    skylight: 0xff_f0_d8,
    sunStrength: 2.4,
    sunlight: 0xff_e9_c2,
  },
  "kettle-woods": {
    asphalt: 0x33_36_3a,
    backdrop: 0xae_bb_b5,
    fogFar: 350,
    fogNear: 40,
    ground: { far: 0x2e_4a_33, near: 0x3e_4a_2e, patch: 0x4f_7a_3d },
    id: "kettle-woods",
    name: "Kettle Woods",
    propMix: { chevron: 1, pole: 0, rock: 1.2, tree: 1.7 },
    skyHorizon: 0xc9_d3_cf,
    skyStrength: 1.9,
    skyZenith: 0x6f_8f_a6,
    skylight: 0xdf_e6_e3,
    sunStrength: 1.1,
    sunlight: 0xe8_ee_ea,
  },
  lowtown: {
    asphalt: 0x2f_30_33,
    backdrop: 0x3a_3f_47,
    fogFar: 1700,
    fogNear: 200,
    ground: { far: 0x3a_3f_47, near: 0x6e_6f_73, patch: 0x7a_3b_2e },
    id: "lowtown",
    name: "Lowtown",
    propMix: { chevron: 1.5, pole: 1.5, rock: 0.25, tree: 0.3 },
    skyHorizon: 0xe0_8a_5c,
    skyStrength: 1.3,
    skyZenith: 0x3b_33_54,
    skylight: 0xc4_b4_d2,
    sunStrength: 1.2,
    sunlight: 0xff_c8_94,
  },
  "salt-coast": {
    asphalt: 0x44_47_4b,
    backdrop: 0xb9_a8_8c,
    fogFar: 2400,
    fogNear: 300,
    ground: { far: 0x7f_a3_5a, near: 0xd9_c7_9a, patch: 0xb9_a8_8c },
    id: "salt-coast",
    name: "Salt Coast",
    propMix: { chevron: 1, pole: 1, rock: 0.6, tree: 0.35 },
    skyHorizon: 0xcf_e3_ec,
    skyStrength: 1.8,
    skyZenith: 0x3c_7f_cc,
    skylight: 0xea_f4_fb,
    sunStrength: 2.2,
    sunlight: 0xf6_f8_ff,
  },
  stonepeak: {
    asphalt: 0x3a_3c_40,
    backdrop: 0x9d_b6_cc,
    fogFar: 2100,
    fogNear: 260,
    ground: { far: 0x4c_7a_38, near: 0x6a_9a_3f, patch: 0x9a_a8_4a },
    id: "stonepeak",
    name: "Stonepeak",
    propMix: { chevron: 1, pole: 1, rock: 1, tree: 1 },
    skyHorizon: 0xc9_db_e8,
    skyStrength: 1.7,
    skyZenith: 0x3f_7f_d6,
    skylight: 0xe6_f1_ff,
    sunStrength: 2.1,
    sunlight: 0xff_f2_d6,
  },
} as const satisfies Record<RegionId, Region>;
