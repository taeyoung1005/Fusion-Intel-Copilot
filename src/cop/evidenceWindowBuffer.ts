import { useRef } from "react"
import type { EvidenceClip } from "./copTimelineData"
import { MAX_WINDOW_MS, type WindowEntry } from "./evidenceWindowSummary"

export const useEvidenceWindowBuffer = (
  evidenceClips: readonly EvidenceClip[],
): ReadonlyMap<string, readonly WindowEntry[]> => {
  const bufferRef = useRef<Map<string, WindowEntry[]>>(new Map())
  const seenClipIdsRef = useRef<Set<string>>(new Set())

  const now = Date.now()

  for (const clip of evidenceClips) {
    if (clip.source !== "vision" || seenClipIdsRef.current.has(clip.id)) {
      continue
    }
    seenClipIdsRef.current.add(clip.id)
    const existing = bufferRef.current.get(clip.camera) ?? []
    bufferRef.current.set(clip.camera, [...existing, { clip, observedAtMs: now }])
  }

  const pruned = new Map<string, WindowEntry[]>()
  for (const [cameraId, entries] of bufferRef.current) {
    const kept = entries.filter((entry) => now - entry.observedAtMs <= MAX_WINDOW_MS)
    if (kept.length > 0) {
      pruned.set(cameraId, kept)
    }
  }
  bufferRef.current = pruned

  return bufferRef.current
}
