import { loadSyntheticFixture } from "./cli-runtime.ts"
import { buildDemoOntologyGraph } from "./demo-ontology-runtime.ts"
import { formatDemoOntologySummary } from "./demo-ontology-summary.ts"

const printOntologyFailure = (details: unknown): void => {
  process.stderr.write(
    `${JSON.stringify({ command: "demo:ontology", status: "fail", details }, null, 2)}\n`,
  )
  process.exitCode = 1
}

const loaded = await loadSyntheticFixture()
if (!loaded.ok) {
  printOntologyFailure(loaded.report)
} else {
  process.stdout.write(`${formatDemoOntologySummary(buildDemoOntologyGraph(loaded.fixture))}\n`)
}
