import { existsSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { z } from "zod"
import type { CliReport } from "../src/cli/reports.ts"
import { parseFixture } from "../src/cli/reports.ts"

const FixtureModuleSchema = z
  .object({
    syntheticDayScenario: z.unknown(),
  })
  .strict()

export type LoadedFixtureResult =
  | { readonly ok: true; readonly fixture: ReturnType<typeof parseFixture> }
  | { readonly ok: false; readonly report: CliReport }

const fixtureUrl = pathToFileURL(`${process.cwd()}/src/fixtures/syntheticDay.ts`)

const failureReport = (summary: string, details: unknown): CliReport => ({
  command: "demo:ledger",
  scenario: "24h",
  status: "fail",
  checks: [
    {
      id: "fixture_load",
      status: "fail",
      summary,
      details,
    },
  ],
})

export const loadSyntheticFixture = async (): Promise<LoadedFixtureResult> => {
  if (!existsSync(fixtureUrl)) {
    return {
      ok: false,
      report: failureReport("src/fixtures/syntheticDay.ts is not present yet", {
        action: "Complete W1.4 synthetic fixture export named syntheticDayScenario.",
      }),
    }
  }

  try {
    const moduleValue: unknown = await import(fixtureUrl.href)
    const moduleRecord = FixtureModuleSchema.parse(moduleValue)
    return { ok: true, fixture: parseFixture(moduleRecord.syntheticDayScenario) }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        report: failureReport("synthetic fixture failed schema validation", {
          issues: error.issues,
        }),
      }
    }
    if (error instanceof Error) {
      return {
        ok: false,
        report: failureReport("synthetic fixture could not be imported", {
          name: error.name,
          message: error.message,
        }),
      }
    }
    return {
      ok: false,
      report: failureReport("synthetic fixture import failed with a non-Error value", {
        value: String(error),
      }),
    }
  }
}

export const printReport = (report: CliReport): void => {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

export const printFailure = (report: CliReport): void => {
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode = 1
}
