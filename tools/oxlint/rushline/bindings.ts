import type { Scope, Variable } from "@oxlint/plugins";

export const variableNamed = (scope: Scope, name: string): Variable | null => {
  for (
    let current: Scope | null = scope;
    current !== null;
    current = current.upper
  ) {
    const variable = current.set.get(name);
    if (variable !== undefined) {
      return variable;
    }
  }
  return null;
};
