import { parseScenarioArg } from "../src/cli/args.ts"
import { buildAgentsReport } from "../src/cli/reports.ts"
import { loadSyntheticFixture, printFailure, printReport } from "./cli-runtime.ts"

const parsedArgs = parseScenarioArg(process.argv.slice(2))
if (!parsedArgs.ok) {
  printFailure({
    command: "demo:agents",
    status: "fail",
    checks: [{ id: "arguments", status: "fail", summary: parsedArgs.message }],
  })
} else {
  const loaded = await loadSyntheticFixture()
  if (!loaded.ok) {
    printFailure({ ...loaded.report, command: "demo:agents" })
  } else {
    printReport(buildAgentsReport(loaded.fixture))
  }
}
