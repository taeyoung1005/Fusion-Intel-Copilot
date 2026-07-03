import { execFile } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { promisify } from "node:util"
import { z } from "zod"
import {
  type AihubSemanticReport,
  buildAihubSemanticReport,
} from "../src/semantic/aihubLabelSemantics.ts"

const EVENT_IDS = ["ph_e2038", "ph_e2044", "ph_e2047", "ph_e2058", "ph_e2069"] as const
const INPUT_ROOT = "data/videos/aihub-71953-fight"
const OUTPUT_ROOT = "data/semantic/aihub-71953-fight"
const execFileAsync = promisify(execFile)

const ReportSchema = z.array(z.custom<AihubSemanticReport>()).readonly()

const reportPath = (eventId: string): string => join(INPUT_ROOT, eventId, "annotation.json")

const loadReport = async (eventId: string): Promise<AihubSemanticReport> => {
  const source = reportPath(eventId)
  const text = await readFile(source, "utf8")
  return buildAihubSemanticReport(eventId, JSON.parse(text))
}

const markdownFor = (reports: readonly AihubSemanticReport[]): string => {
  const lines = [
    "# AI Hub Lightweight Semantic Demo Report",
    "",
    "DETR/pose/action 모델을 추가로 돌리지 않고 AI Hub 라벨의 프레임, bbox, caption 근거에서 빠르게 추출한 데모용 시맨틱입니다.",
    "",
  ]
  for (const report of reports) {
    lines.push(`## ${report.eventId}`)
    lines.push(`- class: ${report.eventClass}`)
    lines.push(`- risk: ${report.riskLevel}`)
    lines.push(`- shared memory: ${report.sharedMemorySummary}`)
    lines.push(`- commander brief: ${report.commanderBrief}`)
    for (const view of report.viewSemantics) {
      lines.push(
        `- ${view.view}/${view.camera}: ${view.direction}, ${view.distanceTrend}, ${view.interaction}, confidence ${view.confidence}`,
      )
      lines.push(`  - zones: ${view.zonePath.join(" -> ")}`)
      lines.push(`  - actions: ${view.actionCandidates.join(", ")}`)
      lines.push(`  - signals: ${view.signals.join(", ")}`)
    }
    lines.push("- phase timeline:")
    for (const phase of report.phaseTimeline) {
      lines.push(`  - ${phase}`)
    }
    lines.push("")
  }
  return `${lines.join("\n")}\n`
}

const main = async (): Promise<void> => {
  const reports = ReportSchema.parse(await Promise.all(EVENT_IDS.map(loadReport)))
  await mkdir(OUTPUT_ROOT, { recursive: true })
  const jsonPath = join(OUTPUT_ROOT, "semantic-report.json")
  const markdownPath = join(OUTPUT_ROOT, "semantic-report.md")
  await writeFile(jsonPath, `${JSON.stringify(reports, null, 2)}\n`)
  await writeFile(markdownPath, markdownFor(reports))
  await execFileAsync("npx", ["biome", "format", "--write", jsonPath])
  process.stdout.write(
    JSON.stringify(
      {
        command: basename(process.argv[1] ?? "demo-aihub-semantics"),
        status: "pass",
        events: reports.length,
        views: reports.reduce((sum, report) => sum + report.viewSemantics.length, 0),
        outputs: [jsonPath, markdownPath].map((path) => join(dirname(path), basename(path))),
      },
      null,
      2,
    ),
  )
  process.stdout.write("\n")
}

await main()
