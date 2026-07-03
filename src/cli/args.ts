export type ScenarioArgResult =
  | { readonly ok: true; readonly scenario: "24h" }
  | { readonly ok: false; readonly message: string }

export const parseScenarioArg = (args: readonly string[]): ScenarioArgResult => {
  const scenarioIndex = args.findIndex((arg) => arg === "--scenario")
  const scenarioEquals = args.find((arg) => arg.startsWith("--scenario="))

  if (scenarioEquals !== undefined) {
    const scenario = scenarioEquals.slice("--scenario=".length)
    return scenario === "24h"
      ? { ok: true, scenario }
      : { ok: false, message: `unsupported scenario '${scenario}'; expected '24h'` }
  }

  if (scenarioIndex === -1) {
    return { ok: false, message: "missing required --scenario 24h argument" }
  }

  const scenario = args[scenarioIndex + 1]
  return scenario === "24h"
    ? { ok: true, scenario }
    : { ok: false, message: `unsupported scenario '${scenario ?? "<missing>"}'; expected '24h'` }
}
