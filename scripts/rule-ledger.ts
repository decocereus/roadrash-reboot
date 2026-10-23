import type { DummyRuleMap, OxlintConfig, OxlintOverride } from "oxlint";

type Setting = DummyRuleMap[string];

export interface RuleLedger {
  readonly enabled: ReadonlySet<string>;
  readonly exemptions: readonly string[];
}

const errorLevels = new Set<Setting>(["error", "deny", 2]);

const isError = (setting: Setting): boolean =>
  errorLevels.has(Array.isArray(setting) ? setting[0] : setting);

const scopeOf = (override: OxlintOverride): string =>
  [
    override.files.join(", "),
    ...(override.excludeFiles
      ? [`not ${override.excludeFiles.join(", ")}`]
      : []),
  ].join(" ");

const entriesOf = (rules: DummyRuleMap | undefined) =>
  Object.entries(rules ?? {});

export const ruleLedger = (config: OxlintConfig): RuleLedger => {
  const presets = config.extends ?? [];
  const root = new Map<string, Setting>();
  for (const layer of [...presets, config]) {
    for (const [rule, setting] of entriesOf(layer.rules)) {
      root.set(rule, setting);
    }
  }

  const exemptions = new Set<string>();
  for (const [rule, setting] of entriesOf(config.rules)) {
    if (!isError(setting)) {
      exemptions.add(`\`${rule}\` is not error in the root rules`);
    }
  }

  const scopes = new Map<string, Map<string, Setting>>();
  const settle = (override: OxlintOverride, own: boolean) => {
    const scope = scopeOf(override);
    const settings = scopes.get(scope) ?? new Map<string, Setting>();
    for (const [rule, setting] of entriesOf(override.rules)) {
      if (own && !isError(setting)) {
        exemptions.add(`\`${rule}\` is not error for ${scope}`);
      }
      settings.set(rule, setting);
    }
    scopes.set(scope, settings);
  };
  for (const override of presets.flatMap((preset) => preset.overrides ?? [])) {
    settle(override, false);
  }
  for (const override of config.overrides ?? []) {
    settle(override, true);
  }

  const enabled = new Set(
    [...root].filter(([, setting]) => isError(setting)).map(([rule]) => rule)
  );
  for (const [scope, settings] of scopes) {
    for (const [rule, setting] of settings) {
      if (isError(setting)) {
        enabled.add(rule);
      } else if (isError(root.get(rule))) {
        exemptions.add(`\`${rule}\` is not error for ${scope}`);
      }
    }
  }

  return { enabled, exemptions: [...exemptions] };
};
