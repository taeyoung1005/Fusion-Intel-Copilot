import { parseScenarioArg } from "../src/cli/args.ts"
import { buildLedgerReport } from "../src/cli/reports.ts"
import { loadSyntheticFixture, printFailure, printReport } from "./cli-runtime.ts"

const parsedArgs = parseScenarioArg(process.argv.slice(2))
if (!parsedArgs.ok) {
  printFailure({
    command: "demo:ledger",
    status: "fail",
    checks: [{ id: "arguments", status: "fail", summary: parsedArgs.message }],
  })
} else {
  const loaded = await loadSyntheticFixture()
  if (!loaded.ok) {
    printFailure(loaded.report)
  } else {
    const report = buildLedgerReport(loaded.fixture)
    if (report.status === "pass") {
      printReport(report)
    } else {
      printFailure(report)
    }
  }
}
