import { ScanSearch } from "lucide-react"
import { type ReactElement, useState } from "react"
import { RealTimeVisionPanel } from "./RealTimeVisionPanel"
import { VisionPipelineResult } from "./VisionPipelineResult"
import type { EvidenceClip } from "./copData"
import { COP_VISION_SAMPLE } from "./copVisionData"
import {
  VisionPipelineClientError,
  type VisionPipelineResponse,
  requestVisionPipeline,
} from "./visionPipelineClient"

type VisionPanelState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "success"; readonly response: VisionPipelineResponse }
  | { readonly kind: "failure"; readonly message: string }

export function VisionPipelinePanel({
  cameraLabel,
  onVisionEvidence,
}: {
  readonly cameraLabel: string
  readonly onVisionEvidence: (clip: EvidenceClip) => void
}): ReactElement {
  const [state, setState] = useState<VisionPanelState>({ kind: "idle" })

  const runPipeline = async (): Promise<void> => {
    setState({ kind: "loading" })
    try {
      setState({
        kind: "success",
        response: await requestVisionPipeline({ ...COP_VISION_SAMPLE, cameraId: cameraLabel }),
      })
    } catch (error) {
      if (error instanceof VisionPipelineClientError) {
        setState({ kind: "failure", message: error.message })
        return
      }
      throw error
    }
  }

  return (
    <section className="cop-panel cop-vision" aria-labelledby="cop-vision-title">
      <div className="cop-panel-head">
        <h2 id="cop-vision-title">비전 AI 하네스</h2>
        <ScanSearch size={15} aria-hidden="true" />
      </div>
      <p className="cop-vision-copy">
        정적 샘플은 즉시 검증용이고, 실시간 DETR은 영상 프레임을 추론해 에이전트 하네스를 깨웁니다.
      </p>
      <button
        type="button"
        className="cop-button full"
        disabled={state.kind === "loading"}
        onClick={() => {
          void runPipeline()
        }}
      >
        {state.kind === "loading" ? "비전 AI 파이프라인 실행 중" : "비전 AI 파이프라인 실행"}
      </button>
      {state.kind === "failure" && (
        <p className="cop-vision-error" aria-live="polite">
          {state.message}
        </p>
      )}
      {state.kind === "success" && (
        <VisionPipelineResult response={state.response} cameraLabel={cameraLabel} />
      )}
      <RealTimeVisionPanel cameraLabel={cameraLabel} onVisionEvidence={onVisionEvidence} />
    </section>
  )
}
