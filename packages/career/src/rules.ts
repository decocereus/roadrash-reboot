export interface RaceRules {
  readonly celebrities: boolean;
  readonly fieldSize: number;
}

export const launchRules: RaceRules = {
  celebrities: true,
  fieldSize: 10,
};
