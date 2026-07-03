import { buildResetReport } from "../src/cli/reports.ts"
import { printReport } from "./cli-runtime.ts"

printReport(buildResetReport())
