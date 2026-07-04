import type { CommanderReportArtifact } from "../src/cop/reportArtifact"

const typstText = (value: string | number): string => {
  const escaped = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")
  return `text(${JSON.stringify(escaped)})`
}

const row = (values: readonly (string | number)[]): string =>
  values.map((value) => typstText(value)).join(",\n")

const detectionClasses = (values: readonly string[]): string =>
  values.length === 0 ? "-" : values.join(", ")

const citationTime = (time: string | undefined): string => time ?? "-"

const tableBlock = (
  columns: string,
  header: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string => `#table(
  columns: ${columns},
  inset: 4pt,
  stroke: 0.45pt,
  ${row(header)},
  ${rows.map((values) => row(values)).join(",\n  ")}
)`

export const buildReportTypstSource = (artifact: CommanderReportArtifact): string => {
  const cameraRows = artifact.perCameraFindings.map((finding) => [
    finding.camera,
    finding.eventCount,
    `${finding.highestConfidencePct}%`,
    finding.latestTime,
    detectionClasses(finding.detectionClasses),
  ])
  const timelineRows = artifact.timeline.map((entry) => [
    entry.time,
    entry.camera,
    entry.tone,
    entry.label,
    `${entry.confidencePct}%`,
  ])
  const citationRows = artifact.citations.map((citation) => [
    citation.id,
    citation.label,
    citationTime(citation.time),
  ])
  const actionRows = artifact.responseActions.map((action) => [action.label, action.status])
  const unresolvedRows =
    artifact.unresolved.length === 0
      ? [["누락 맥락 없음"]]
      : artifact.unresolved.map((item) => [item])
  const footerText = `generatedAtIso: ${artifact.generatedAtIso} / exportReceiptId: ${artifact.exportReceiptId}`

  return `#set page(paper: "a4", margin: 14mm)
#set text(font: "Apple SD Gothic Neo")
#set text(size: 9pt, lang: "ko")
#set par(justify: false, leading: 0.52em)

#align(right)[
  #table(
    columns: (1fr, 1fr, 1fr, 1fr),
    inset: 4pt,
    stroke: 0.5pt,
    [작성], [상황실장], [경계대대장], [지휘관],
    [/], [/], [/], [/]
  )
]

#align(center)[#text(size: 17pt, weight: "bold")[경계구역 일일 상황보고]]

#table(
  columns: (26mm, 1fr, 26mm, 1fr),
  inset: 4pt,
  stroke: 0.45pt,
  [분류기호], ${typstText(artifact.reportId)},
  [시행일자], ${typstText(artifact.date)},
  [제목], [경계구역 일일 상황보고],
  [보고기간], ${typstText(artifact.period)}
)

= 경계 근무 현황
${tableBlock(
  "(1.1fr, 0.7fr, 0.8fr, 0.9fr, 1.3fr)",
  ["카메라", "탐지건수", "최고신뢰도", "최종탐지시각", "탐지유형"],
  cameraRows,
)}

= 탐지 및 조치 내역
${tableBlock(
  "(0.7fr, 0.9fr, 0.6fr, 2fr, 0.7fr)",
  ["시각", "카메라", "유형", "내용", "신뢰도"],
  timelineRows,
)}

= 증거 인용
${tableBlock("(1.3fr, 1.5fr, 0.8fr)", ["인용ID", "라벨", "시각"], citationRows)}

= 사람 확인 게이트 결과
${tableBlock("(1.6fr, 0.7fr)", ["게이트명", "상태"], actionRows)}

= 특이사항 및 관장 조치
#block(inset: 5pt, stroke: 0.45pt)[
  #text(weight: "bold")[요약] \\
  #${typstText(artifact.summary)}
]

${tableBlock("(1fr)", ["누락 맥락"], unresolvedRows)}

#v(8pt)
#text(size: 8pt)[#${typstText(footerText)}]
`
}
