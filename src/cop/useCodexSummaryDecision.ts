import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CodexAgentClientError,
  type CodexAgentContext,
  type CodexAgentDecision,
  buildCodexAgentRequestKey,
  requestCodexAgent,
} from "./codexAgentClient"
import type { Citation, EvidenceClip, Incident, MissingContext } from "./copData"

export type CodexProgress = "requesting" | "refreshing" | "retrying"

export type CodexPanelState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly progress: CodexProgress }
  | {
      readonly kind: "ready"
      readonly response: CodexAgentDecision
      readonly freshness: "fresh" | "stale"
      readonly progress?: CodexProgress
      readonly notice?: string
    }
  | { readonly kind: "failure"; readonly message: string; readonly progress: "retrying" }

export type CodexSummaryRequestInput = {
  readonly selectedClip: EvidenceClip | undefined
  readonly selectedIncident: Incident
  readonly citations: readonly Citation[]
  readonly missingContext: readonly MissingContext[]
  readonly recentActivitySummary: string | undefined
  readonly telemetryFingerprint?: string
}

type CodexRequestEntry = {
  readonly key: string
  readonly context: CodexAgentContext
}

export const CODEX_SUMMARY_DEBOUNCE_MS = 750
export const CODEX_SUMMARY_MIN_INTERVAL_MS = 15_000
export const CODEX_SUMMARY_RETRY_DELAY_MS = 15_000

const SYSTEM_POSTURE_CITATION: Citation = { id: "cite-system", label: "SYSTEM-POSTURE" }
const STALE_RETRY_NOTICE = "응답 지연 · 마지막 정상 판단 유지 · 재시도 중"

export const buildCodexSummaryContext = ({
  selectedClip,
  selectedIncident,
  citations,
  missingContext,
  recentActivitySummary,
}: CodexSummaryRequestInput): CodexAgentContext => {
  const requestCitations = citations.length > 0 ? citations.slice(0, 2) : [SYSTEM_POSTURE_CITATION]
  return {
    incident: selectedIncident,
    citations: requestCitations,
    missingContext,
    responseOutcome: `사람 확인 게이트 대기 / ${selectedClip?.label ?? "선택 클립 없음"}`,
    ...(recentActivitySummary !== undefined ? { recentActivitySummary } : {}),
  }
}

export const buildCodexSummaryRequestKey = (input: CodexSummaryRequestInput): string =>
  buildCodexAgentRequestKey(buildCodexSummaryContext(input))

export const codexProgressText = (progress: CodexProgress): string => {
  if (progress === "retrying") {
    return "Codex 판단 재시도 중"
  }
  if (progress === "refreshing") {
    return "Codex 판단 갱신 중"
  }
  return "Codex 판단 요청 중"
}

const staleState = (
  response: CodexAgentDecision,
  progress: CodexProgress = "retrying",
): CodexPanelState => ({
  kind: "ready",
  response,
  freshness: "stale",
  progress,
  notice: STALE_RETRY_NOTICE,
})

export const useCodexSummaryDecision = ({
  selectedClip,
  selectedIncident,
  citations,
  missingContext,
  recentActivitySummary,
  telemetryFingerprint,
}: CodexSummaryRequestInput): CodexPanelState => {
  const [state, setState] = useState<CodexPanelState>({ kind: "idle" })
  const latestEntry = useMemo<CodexRequestEntry>(() => {
    const context = buildCodexSummaryContext({
      selectedClip,
      selectedIncident,
      citations,
      missingContext,
      recentActivitySummary,
      ...(telemetryFingerprint === undefined ? {} : { telemetryFingerprint }),
    })
    return { key: buildCodexAgentRequestKey(context), context }
  }, [
    selectedClip,
    selectedIncident,
    citations,
    missingContext,
    recentActivitySummary,
    telemetryFingerprint,
  ])
  const latestEntryRef = useRef<CodexRequestEntry>(latestEntry)
  latestEntryRef.current = latestEntry
  const inFlightRef = useRef(false)
  const pendingEntriesRef = useRef<readonly CodexRequestEntry[]>([])
  const lastStartedAtRef = useRef(0)
  const lastSuccessfulKeyRef = useRef<string | undefined>(undefined)
  const lastResponseRef = useRef<CodexAgentDecision | undefined>(undefined)
  const scheduleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mountedRef = useRef(true)
  const scheduleRetryRef = useRef<(entry: CodexRequestEntry) => void>(() => undefined)

  const clearScheduledRequest = useCallback((): void => {
    const timer = scheduleTimerRef.current
    if (timer !== undefined) {
      clearTimeout(timer)
      scheduleTimerRef.current = undefined
    }
  }, [])

  const takePendingEntry = useCallback((): CodexRequestEntry | undefined => {
    const pendingEntry = pendingEntriesRef.current[0]
    pendingEntriesRef.current = []
    return pendingEntry
  }, [])

  const requestDecision = useCallback(
    async (entry: CodexRequestEntry, progress: CodexProgress) => {
      if (inFlightRef.current) {
        pendingEntriesRef.current = [entry]
        const staleResponse = lastResponseRef.current
        setState(
          staleResponse === undefined
            ? { kind: "loading", progress: "retrying" }
            : staleState(staleResponse),
        )
        return
      }

      const lastResponse = lastResponseRef.current
      if (lastSuccessfulKeyRef.current === entry.key && lastResponse !== undefined) {
        setState({ kind: "ready", response: lastResponse, freshness: "fresh" })
        return
      }

      inFlightRef.current = true
      lastStartedAtRef.current = Date.now()
      pendingEntriesRef.current = []

      setState(
        lastResponse === undefined
          ? { kind: "loading", progress }
          : {
              kind: "ready",
              response: lastResponse,
              freshness: lastSuccessfulKeyRef.current === entry.key ? "fresh" : "stale",
              progress: progress === "requesting" ? "refreshing" : progress,
              notice:
                progress === "retrying" ? STALE_RETRY_NOTICE : "새 입력으로 Codex 판단 갱신 중",
            },
      )

      try {
        const response = await requestCodexAgent(entry.context)
        if (!mountedRef.current) {
          return
        }
        // Telemetry (evidence ticks from unrelated cameras) can change the
        // request key faster than a round trip completes. A newer key only
        // means a fresh request is already scheduled via the effect below —
        // it does not mean this response is wrong, so it must still be
        // shown (as "stale") rather than discarded, or the panel can be
        // starved into "loading" forever under continuous live telemetry.
        const isLatest = latestEntryRef.current.key === entry.key
        if (isLatest) {
          lastSuccessfulKeyRef.current = entry.key
        }
        lastResponseRef.current = response
        setState({ kind: "ready", response, freshness: isLatest ? "fresh" : "stale" })
      } catch (error) {
        if (!mountedRef.current || latestEntryRef.current.key !== entry.key) {
          return
        }
        const staleResponse = lastResponseRef.current
        if (staleResponse !== undefined) {
          setState(staleState(staleResponse))
          scheduleRetryRef.current(entry)
          return
        }
        const isTimeout = error instanceof CodexAgentClientError && error.reason === "timeout"
        setState({
          kind: "failure",
          message: isTimeout
            ? "Codex 판단 응답 지연 · 재시도 중"
            : "Codex 판단 연결 대기 · 재시도 중",
          progress: "retrying",
        })
        scheduleRetryRef.current(entry)
      } finally {
        inFlightRef.current = false
        const pendingEntry = takePendingEntry()
        if (
          mountedRef.current &&
          pendingEntry !== undefined &&
          pendingEntry.key !== lastSuccessfulKeyRef.current
        ) {
          scheduleRetryRef.current(pendingEntry)
        }
      }
    },
    [takePendingEntry],
  )

  const scheduleRequest = useCallback(
    (entry: CodexRequestEntry, progress: CodexProgress): void => {
      clearScheduledRequest()
      const elapsedSinceLastStart = Date.now() - lastStartedAtRef.current
      const minIntervalDelay = Math.max(0, CODEX_SUMMARY_MIN_INTERVAL_MS - elapsedSinceLastStart)
      const delay =
        progress === "retrying"
          ? Math.max(CODEX_SUMMARY_RETRY_DELAY_MS, minIntervalDelay)
          : Math.max(CODEX_SUMMARY_DEBOUNCE_MS, minIntervalDelay)

      if (progress === "retrying") {
        const staleResponse = lastResponseRef.current
        setState(
          staleResponse === undefined
            ? { kind: "loading", progress: "retrying" }
            : staleState(staleResponse),
        )
      }

      scheduleTimerRef.current = setTimeout(() => {
        scheduleTimerRef.current = undefined
        void requestDecision(entry, progress)
      }, delay)
    },
    [clearScheduledRequest, requestDecision],
  )
  scheduleRetryRef.current = (entry: CodexRequestEntry): void => scheduleRequest(entry, "retrying")

  const latestRequestKey = latestEntry.key
  useEffect(() => {
    const entry = latestEntryRef.current
    if (entry.key === latestRequestKey) {
      scheduleRequest(entry, "requesting")
    }
  }, [latestRequestKey, scheduleRequest])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      clearScheduledRequest()
    }
  }, [clearScheduledRequest])

  return state
}
