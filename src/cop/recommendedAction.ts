import type { Incident, MissingContext, ResponseGate } from "./copData"
import { type TakenResponseAction, formatTakenAtClock } from "./responseActionCatalog"

export type RecommendedAction = {
  readonly ko: string
  readonly en: string
  readonly headline: string
  readonly body: string
  readonly cta: string
}

export const buildRecommendedAction = (
  selectedIncident: Incident,
  missingContext: readonly MissingContext[],
  responseGates: readonly ResponseGate[],
  takenResponseAction?: TakenResponseAction,
): RecommendedAction => {
  if (takenResponseAction !== undefined) {
    return {
      ko: "관장 조치",
      en: "Recommended Next Action",
      headline: "대응 조치 완료",
      body: `${selectedIncident.zone}: ${takenResponseAction.label} (${formatTakenAtClock(takenResponseAction.takenAtMs)})`,
      cta: "사람 확인 게이트로 이동",
    }
  }

  if (missingContext.length > 0) {
    return {
      ko: "관장 조치",
      en: "Recommended Next Action",
      headline: "누락 데이터 보완 필요",
      body: `${selectedIncident.zone}: 누락 맥락 ${missingContext.length}건 보완 후 보고서 생성 가능`,
      cta: "누락 맥락 확인",
    }
  }

  if (responseGates.length > 0 && responseGates.every((gate) => gate.initial === "PASS")) {
    return {
      ko: "관장 조치",
      en: "Recommended Next Action",
      headline: "보고서 생성 가능",
      body: `${selectedIncident.zone}: 모든 사람 확인 게이트 통과 · 일일 보고서 생성 준비 완료`,
      cta: "보고서 생성 게이트로 이동",
    }
  }

  return {
    ko: "관장 조치",
    en: "Recommended Next Action",
    headline: "사람 확인 게이트 검토 필요",
    body: `${selectedIncident.zone}: 대기 중인 확인 게이트 완료 후 보고서 생성 가능`,
    cta: "사람 확인 게이트로 이동",
  }
}
