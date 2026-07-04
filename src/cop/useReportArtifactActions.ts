import { useCallback, useEffect, useMemo, useState } from "react"
import type { Citation, EvidenceClip, Incident, MissingContext, ResponseGate } from "./copData"
import type { DailyReportRow } from "./operationalTelemetry"
import {
  type CommanderReportArtifact,
  type ReportFile,
  buildCommanderReportArtifact,
  buildReportExportFile,
  buildReportPdfFile,
} from "./reportArtifact"

export type ReportActionState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "exported"
      readonly message: string
      readonly fileName: string
      readonly sizeBytes: number
    }
  | {
      readonly kind: "pdf"
      readonly message: string
      readonly fileName: string
      readonly sizeBytes: number
      readonly url: string
    }

export type ReportActionInput = {
  readonly selectedClip: EvidenceClip | undefined
  readonly selectedIncident: Incident
  readonly cameraLabel: string
  readonly evidenceClips: readonly EvidenceClip[]
  readonly citations: readonly Citation[]
  readonly missingContext: readonly MissingContext[]
  readonly responseGates: readonly ResponseGate[]
  readonly reportRows: readonly DailyReportRow[]
  readonly reportPeriod: string
}

type ReportActionResult = {
  readonly artifact: CommanderReportArtifact
  readonly actionState: ReportActionState
  readonly createPdfPreview: () => void
  readonly exportReport: () => void
}

const blobForReportFile = (file: ReportFile): Blob =>
  new Blob([file.content], { type: file.mimeType })

const downloadReportFile = (file: ReportFile): number => {
  const blob = blobForReportFile(file)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = file.fileName
  anchor.style.display = "none"
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return blob.size
}

export const useReportArtifactActions = ({
  selectedClip,
  selectedIncident,
  cameraLabel,
  evidenceClips,
  citations,
  missingContext,
  responseGates,
  reportRows,
  reportPeriod,
}: ReportActionInput): ReportActionResult => {
  const [actionState, setActionState] = useState<ReportActionState>({ kind: "idle" })
  const artifact = useMemo(
    () =>
      buildCommanderReportArtifact({
        selectedIncident,
        selectedClip,
        evidenceClips,
        citations,
        missingContext,
        responseGates,
        reportRows,
        reportPeriod,
        generatedAt: new Date(),
      }),
    [
      selectedIncident,
      selectedClip,
      evidenceClips,
      citations,
      missingContext,
      responseGates,
      reportRows,
      reportPeriod,
    ],
  )

  const reportScope = artifact.reportId
  useEffect(() => {
    if (reportScope.length > 0) {
      setActionState({ kind: "idle" })
    }
  }, [reportScope])

  useEffect(() => {
    return () => {
      if (actionState.kind === "pdf") {
        URL.revokeObjectURL(actionState.url)
      }
    }
  }, [actionState])

  const createPdfPreview = useCallback((): void => {
    const file = buildReportPdfFile(artifact)
    const blob = blobForReportFile(file)
    const url = URL.createObjectURL(blob)
    setActionState({
      kind: "pdf",
      message: `PDF 미리보기 생성: ${artifact.reportId} / ${selectedIncident.id} / ${
        selectedClip === undefined ? "선택 클립 없음" : cameraLabel
      }`,
      fileName: file.fileName,
      sizeBytes: blob.size,
      url,
    })
  }, [artifact, cameraLabel, selectedClip, selectedIncident.id])

  const exportReport = useCallback((): void => {
    const file = buildReportExportFile(artifact)
    const sizeBytes = downloadReportFile(file)
    setActionState({
      kind: "exported",
      message: `보고서 내보내기 완료: ${artifact.exportReceiptId} / ${selectedIncident.id}`,
      fileName: file.fileName,
      sizeBytes,
    })
  }, [artifact, selectedIncident.id])

  return { artifact, actionState, createPdfPreview, exportReport }
}
