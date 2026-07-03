# DETR Person-Attribute Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When DETR detects a person in a CARLA camera feed, extract five appearance attributes (hat, sleeve length, bag, top color, build) and fold them into the evidence text that already reaches both the UI and the Codex agent's judgment input.

**Architecture:** A new client-only module (`src/cop/attributeClassifier.ts`) crops the DETR bounding box out of the already-captured frame, runs three independent CLIP zero-shot binary classifications (hat/sleeve/bag) via `@huggingface/transformers` (same library DETR already uses), and computes color/build directly from pixels/bbox ratio with no extra model call. `useCarlaVideoDetection.ts` calls this exactly when it's about to emit a new evidence clip (the existing `EVIDENCE_EVERY_FRAMES` throttle — no new throttle needed) and appends a Korean description to `EvidenceClip.label`. Because `EvidenceClip.label` already flows into `Incident.title` (unchanged, existing wiring) and `codexAgentClient.ts` is extended to fold `incident.title` into `evidence.summary`, no server-side change is required — Codex receives the attribute text through the same request field the user asked for.

**Tech Stack:** TypeScript, React 19, `@huggingface/transformers` (transformers.js, already a dependency), Vitest, Playwright.

## Global Constraints

- Attributes: hat (`wearing_hat`/`no_hat`), sleeve length (`short_sleeve`/`long_sleeve`), bag (`carrying_bag`/`no_bag`) via CLIP zero-shot (`Xenova/clip-vit-base-patch32`, `zero-shot-image-classification` task). Top color (7 named colors + `"other"`) and build (`small`/`medium`/`large`) via pixel/bbox math, no model call.
- Attribute extraction runs exactly when `useCarlaVideoDetection.ts` is about to emit a new `EvidenceClip` (the existing `frameIndex - lastEvidenceFrameRef.current >= EVIDENCE_EVERY_FRAMES` gate) — not tied to the realtime-alert popup's separate 8-second gate.
- On CLIP load/inference failure (matching `isDetrMemoryFailure`'s `bad_alloc`/session-creation error pattern), attribute extraction disables itself silently and permanently for the session — DETR detection and evidence emission must keep working with `attributes` simply omitted.
- Codex must actually receive the attribute text: `EvidenceClip.label` carries it (existing `Incident.title` wiring, unchanged) and `codexAgentClient.ts`'s `evidence.summary` (currently the fixed string `` `${zone} ${meta} 증거 패킷` ``) must append `incident.title` so it's present in `summary` too.
- No server-side files (`server/visionPipeline.ts`, `server/visionSemantics.ts`) need to change — `EvidenceClip` never round-trips through the server; the label enrichment happens entirely client-side. (This is a simplification found while planning — the design spec sketched adding an `attributes` field to the server's `VisionDetection` type, but tracing the actual Codex data path shows that's unnecessary for this goal.)
- Mirror the existing `window.__D4D_TEST_DETR_DETECTOR__` test-hook pattern (`src/vite-env.d.ts`) with a new `window.__D4D_TEST_CLIP_CLASSIFIER__` so e2e tests can mock CLIP output deterministically without loading the real model.

---

### Task 1: Pure attribute-decision logic + tests

**Files:**
- Create: `src/cop/attributeClassifier.ts`
- Create: `src/cop/attributeClassifier.test.ts`

**Interfaces:**
- Produces: `type TopColor = "red" | "blue" | "black" | "white" | "gray" | "green" | "yellow" | "other"`, `type Build = "small" | "medium" | "large"`, `type PersonAttributes = { readonly hat: "wearing_hat" | "no_hat"; readonly sleeveLength: "short_sleeve" | "long_sleeve"; readonly bagCarried: "carrying_bag" | "no_bag"; readonly topColor: TopColor; readonly build: Build; readonly attributeConfidence: number }`, `rgbToNamedColor(r: number, g: number, b: number): TopColor`, `buildFromRatio(bboxHeight: number, frameHeight: number): Build`, `pickBinaryLabel<A extends string, B extends string>(scores: readonly { readonly label: string; readonly score: number }[], labels: readonly [string, string], values: readonly [A, B]): { readonly value: A | B; readonly score: number }`, `describeAttributes(attributes: PersonAttributes): string`

- [ ] **Step 1: Write the failing tests**

Create `src/cop/attributeClassifier.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  buildFromRatio,
  describeAttributes,
  pickBinaryLabel,
  rgbToNamedColor,
} from "./attributeClassifier"

describe("rgbToNamedColor", () => {
  it("recognizes red", () => {
    expect(rgbToNamedColor(255, 0, 0)).toBe("red")
  })

  it("recognizes blue", () => {
    expect(rgbToNamedColor(0, 0, 255)).toBe("blue")
  })

  it("recognizes green", () => {
    expect(rgbToNamedColor(0, 180, 0)).toBe("green")
  })

  it("recognizes yellow", () => {
    expect(rgbToNamedColor(230, 220, 20)).toBe("yellow")
  })

  it("recognizes black by low lightness", () => {
    expect(rgbToNamedColor(10, 10, 10)).toBe("black")
  })

  it("recognizes white by high lightness and low saturation", () => {
    expect(rgbToNamedColor(245, 245, 245)).toBe("white")
  })

  it("recognizes gray by low saturation at mid lightness", () => {
    expect(rgbToNamedColor(120, 120, 120)).toBe("gray")
  })

  it("falls back to other for hues outside the named buckets (magenta)", () => {
    expect(rgbToNamedColor(180, 0, 180)).toBe("other")
  })
})

describe("buildFromRatio", () => {
  it("classifies a small bounding box ratio as small", () => {
    expect(buildFromRatio(72, 360)).toBe("small")
  })

  it("classifies a mid bounding box ratio as medium", () => {
    expect(buildFromRatio(162, 360)).toBe("medium")
  })

  it("classifies a large bounding box ratio as large", () => {
    expect(buildFromRatio(270, 360)).toBe("large")
  })

  it("defaults to medium when frameHeight is zero", () => {
    expect(buildFromRatio(100, 0)).toBe("medium")
  })
})

describe("pickBinaryLabel", () => {
  const labels: readonly [string, string] = ["a person wearing a hat", "a person not wearing a hat"]
  const values: readonly ["wearing_hat", "no_hat"] = ["wearing_hat", "no_hat"]

  it("picks the first value when its score is higher", () => {
    const result = pickBinaryLabel(
      [
        { label: "a person wearing a hat", score: 0.82 },
        { label: "a person not wearing a hat", score: 0.18 },
      ],
      labels,
      values,
    )
    expect(result).toEqual({ value: "wearing_hat", score: 0.82 })
  })

  it("picks the second value when its score is higher", () => {
    const result = pickBinaryLabel(
      [
        { label: "a person wearing a hat", score: 0.3 },
        { label: "a person not wearing a hat", score: 0.7 },
      ],
      labels,
      values,
    )
    expect(result).toEqual({ value: "no_hat", score: 0.7 })
  })
})

describe("describeAttributes", () => {
  it("composes a Korean description from all five attributes", () => {
    const text = describeAttributes({
      hat: "no_hat",
      sleeveLength: "short_sleeve",
      bagCarried: "carrying_bag",
      topColor: "red",
      build: "medium",
      attributeConfidence: 0.8,
    })
    expect(text).toBe("빨간 상의 · 배낭 소지 · 모자 없음 · 반팔")
  })

  it("omits the color prefix when topColor is other", () => {
    const text = describeAttributes({
      hat: "wearing_hat",
      sleeveLength: "long_sleeve",
      bagCarried: "no_bag",
      topColor: "other",
      build: "large",
      attributeConfidence: 0.6,
    })
    expect(text).toBe("상의 · 소지품 없음 · 모자 착용 · 긴팔")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cop/attributeClassifier.test.ts`
Expected: FAIL with "Cannot find module './attributeClassifier'"

- [ ] **Step 3: Write the pure implementation**

Create `src/cop/attributeClassifier.ts`:

```ts
export type TopColor = "red" | "blue" | "black" | "white" | "gray" | "green" | "yellow" | "other"
export type Build = "small" | "medium" | "large"

export type PersonAttributes = {
  readonly hat: "wearing_hat" | "no_hat"
  readonly sleeveLength: "short_sleeve" | "long_sleeve"
  readonly bagCarried: "carrying_bag" | "no_bag"
  readonly topColor: TopColor
  readonly build: Build
  readonly attributeConfidence: number
}

const BUILD_SMALL_MAX_RATIO = 0.3
const BUILD_LARGE_MIN_RATIO = 0.6

export const buildFromRatio = (bboxHeight: number, frameHeight: number): Build => {
  if (frameHeight <= 0) {
    return "medium"
  }
  const ratio = bboxHeight / frameHeight
  if (ratio < BUILD_SMALL_MAX_RATIO) {
    return "small"
  }
  if (ratio >= BUILD_LARGE_MIN_RATIO) {
    return "large"
  }
  return "medium"
}

export const rgbToNamedColor = (r: number, g: number, b: number): TopColor => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2 / 255
  const delta = max - min
  const saturation = delta === 0 ? 0 : delta / (255 - Math.abs(max + min - 255))

  if (lightness < 0.15) {
    return "black"
  }
  if (lightness > 0.85 && saturation < 0.25) {
    return "white"
  }
  if (saturation < 0.2) {
    return "gray"
  }

  let hue: number
  if (max === r) {
    hue = ((g - b) / delta) % 6
  } else if (max === g) {
    hue = (b - r) / delta + 2
  } else {
    hue = (r - g) / delta + 4
  }
  hue = Math.round(hue * 60)
  if (hue < 0) {
    hue += 360
  }

  if (hue < 30 || hue >= 330) {
    return "red"
  }
  if (hue < 90) {
    return "yellow"
  }
  if (hue < 150) {
    return "green"
  }
  if (hue < 270) {
    return "blue"
  }
  return "other"
}

export const pickBinaryLabel = <A extends string, B extends string>(
  scores: readonly { readonly label: string; readonly score: number }[],
  labels: readonly [string, string],
  values: readonly [A, B],
): { readonly value: A | B; readonly score: number } => {
  const first = scores.find((item) => item.label === labels[0])
  const second = scores.find((item) => item.label === labels[1])
  if (second === undefined || (first !== undefined && first.score >= second.score)) {
    return { value: values[0], score: first?.score ?? 0 }
  }
  return { value: values[1], score: second.score }
}

const COLOR_LABEL_KO: Record<TopColor, string> = {
  red: "빨간 ",
  blue: "파란 ",
  black: "검은 ",
  white: "흰 ",
  gray: "회색 ",
  green: "초록 ",
  yellow: "노란 ",
  other: "",
}

export const describeAttributes = (attributes: PersonAttributes): string => {
  const hatText = attributes.hat === "wearing_hat" ? "모자 착용" : "모자 없음"
  const sleeveText = attributes.sleeveLength === "short_sleeve" ? "반팔" : "긴팔"
  const bagText = attributes.bagCarried === "carrying_bag" ? "배낭 소지" : "소지품 없음"
  const colorPrefix = COLOR_LABEL_KO[attributes.topColor]
  return `${colorPrefix}상의 · ${bagText} · ${hatText} · ${sleeveText}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cop/attributeClassifier.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add src/cop/attributeClassifier.ts src/cop/attributeClassifier.test.ts
git commit -m "Add pure person-attribute color/build/label-picking logic"
```

---

### Task 2: CLIP model wiring + frame cropping (DOM-dependent, not unit tested)

**Files:**
- Modify: `src/cop/attributeClassifier.ts`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Consumes: `pickBinaryLabel`, `rgbToNamedColor`, `buildFromRatio`, `type PersonAttributes` (Task 1, same file); `type VisionFrameObject` from `./detrVisionDetector` (existing, for the `bbox` shape: `{x: number; y: number; width: number; height: number}`)
- Produces: `extractPersonAttributes(input: { readonly source: string; readonly bbox: VisionFrameObject["bbox"]; readonly frameHeight: number }): Promise<PersonAttributes>` — throws on failure (caller decides what to do, per Task 3)

No new unit test in this step — cropping/canvas/CLIP-model code needs a DOM (`Image`, `canvas`) that Vitest's Node environment doesn't provide (same reason `detectFrameObjectsWithDetr` in `detrVisionDetector.ts` has no direct test, only its pure `normalizeDetrDetections` does). This is covered by the e2e test in Task 5.

- [ ] **Step 1: Add the CLIP test-hook type**

Modify `src/vite-env.d.ts` — add after the existing `D4dTestDetrDetector`/`Window` block:

```ts
type D4dTestClipClassification = {
  readonly label: string
  readonly score: number
}

type D4dTestClipClassifier = (
  source: string,
  candidateLabels: readonly string[],
) => Promise<readonly D4dTestClipClassification[]>

interface Window {
  __D4D_TEST_DETR_DETECTOR__?: D4dTestDetrDetector
  __D4D_TEST_CLIP_CLASSIFIER__?: D4dTestClipClassifier
}
```

(This replaces the existing single-property `Window` interface — TypeScript merges interface declarations with the same name, but since there's already one `interface Window { __D4D_TEST_DETR_DETECTOR__?: ... }` in this file, edit that existing block to add the new property rather than declaring a second one, so the file has exactly one `Window` interface listing both properties.)

- [ ] **Step 2: Add CLIP wiring and cropping to `attributeClassifier.ts`**

Append to `src/cop/attributeClassifier.ts` (after the Task 1 code):

```ts
import { z } from "zod"
import type { VisionFrameObject } from "./detrVisionDetector"

const CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32"

const HAT_LABELS: readonly [string, string] = [
  "a person wearing a hat",
  "a person not wearing a hat",
]
const SLEEVE_LABELS: readonly [string, string] = [
  "a person wearing short sleeves",
  "a person wearing long sleeves",
]
const BAG_LABELS: readonly [string, string] = [
  "a person carrying a bag or backpack",
  "a person without a bag",
]

const ClipClassificationSchema = z
  .array(z.object({ label: z.string(), score: z.number() }))
  .readonly()

const createClipClassifier = async () => {
  const { pipeline } = await import("@huggingface/transformers")
  return pipeline("zero-shot-image-classification", CLIP_MODEL_ID)
}

let clipClassifierPromise: ReturnType<typeof createClipClassifier> | undefined

const testClipClassifier = (): D4dTestClipClassifier | undefined => {
  if (typeof window === "undefined") {
    return undefined
  }
  return window.__D4D_TEST_CLIP_CLASSIFIER__
}

const runClipClassification = async (
  source: string,
  candidateLabels: readonly [string, string],
): Promise<readonly { label: string; score: number }[]> => {
  const testFn = testClipClassifier()
  if (testFn !== undefined) {
    return ClipClassificationSchema.parse(await testFn(source, candidateLabels))
  }
  clipClassifierPromise ??= createClipClassifier()
  const classifier = await clipClassifierPromise
  const output = await classifier(source, candidateLabels as unknown as string[])
  return ClipClassificationSchema.parse(output)
}

const classifyBinary = async <A extends string, B extends string>(
  source: string,
  labels: readonly [string, string],
  values: readonly [A, B],
): Promise<{ readonly value: A | B; readonly score: number }> => {
  const scores = await runClipClassification(source, labels)
  return pickBinaryLabel(scores, labels, values)
}

type Bbox = VisionFrameObject["bbox"]

const decodeAndCropToCanvas = (source: string, bbox: Bbox): Promise<HTMLCanvasElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, bbox.width)
      canvas.height = Math.max(1, bbox.height)
      const context = canvas.getContext("2d")
      if (context === null) {
        reject(new Error("캔버스 컨텍스트를 생성할 수 없습니다."))
        return
      }
      context.drawImage(
        image,
        bbox.x,
        bbox.y,
        bbox.width,
        bbox.height,
        0,
        0,
        canvas.width,
        canvas.height,
      )
      resolve(canvas)
    }
    image.onerror = () => reject(new Error("프레임을 디코딩할 수 없습니다."))
    image.src = source
  })

const averageColorOf = (canvas: HTMLCanvasElement): { r: number; g: number; b: number } => {
  const context = canvas.getContext("2d")
  if (context === null) {
    return { r: 128, g: 128, b: 128 }
  }
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  let r = 0
  let g = 0
  let b = 0
  const pixelCount = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    r += data[i] ?? 0
    g += data[i + 1] ?? 0
    b += data[i + 2] ?? 0
  }
  return { r: r / pixelCount, g: g / pixelCount, b: b / pixelCount }
}

export const extractPersonAttributes = async (input: {
  readonly source: string
  readonly bbox: Bbox
  readonly frameHeight: number
}): Promise<PersonAttributes> => {
  const canvas = await decodeAndCropToCanvas(input.source, input.bbox)
  const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.8)
  const { r, g, b } = averageColorOf(canvas)
  const topColor = rgbToNamedColor(r, g, b)
  const build = buildFromRatio(input.bbox.height, input.frameHeight)

  const [hat, sleeveLength, bagCarried] = await Promise.all([
    classifyBinary(croppedDataUrl, HAT_LABELS, ["wearing_hat", "no_hat"] as const),
    classifyBinary(croppedDataUrl, SLEEVE_LABELS, ["short_sleeve", "long_sleeve"] as const),
    classifyBinary(croppedDataUrl, BAG_LABELS, ["carrying_bag", "no_bag"] as const),
  ])

  return {
    hat: hat.value,
    sleeveLength: sleeveLength.value,
    bagCarried: bagCarried.value,
    topColor,
    build,
    attributeConfidence: (hat.score + sleeveLength.score + bagCarried.score) / 3,
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 4: Run Task 1's tests again to confirm nothing broke**

Run: `npx vitest run src/cop/attributeClassifier.test.ts`
Expected: PASS (14 tests, unchanged)

- [ ] **Step 5: Commit**

```bash
git add src/cop/attributeClassifier.ts src/vite-env.d.ts
git commit -m "Add CLIP zero-shot classification and frame cropping for person attributes"
```

---

### Task 3: Add `attributes` field to `EvidenceClip`

**Files:**
- Modify: `src/cop/copTimelineData.ts`

**Interfaces:**
- Consumes: `type PersonAttributes` from `./attributeClassifier` (Task 1)
- Produces: `EvidenceClip` gains `readonly attributes?: PersonAttributes`

- [ ] **Step 1: Read the current type to confirm exact location**

Run: `grep -n "export type EvidenceClip" -A 12 src/cop/copTimelineData.ts`

Confirm it matches:
```ts
export type EvidenceClip = {
  readonly id: string
  readonly time: string
  readonly camera: string
  readonly tone: AlertTone
  readonly label: string
  readonly detail: string
  readonly source: EvidenceClipSource
  readonly confidencePct: number
  readonly frameDataUrl?: string | null
}
```

- [ ] **Step 2: Add the field**

Modify `src/cop/copTimelineData.ts` — add the import at the top of the file (alongside existing imports) and add one field to `EvidenceClip`:

```ts
import type { PersonAttributes } from "./attributeClassifier"
```

```ts
export type EvidenceClip = {
  readonly id: string
  readonly time: string
  readonly camera: string
  readonly tone: AlertTone
  readonly label: string
  readonly detail: string
  readonly source: EvidenceClipSource
  readonly confidencePct: number
  readonly frameDataUrl?: string | null
  readonly attributes?: PersonAttributes
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors (biome may reorder the new import — if so, run `npx biome check --fix .` and re-verify)

- [ ] **Step 4: Commit**

```bash
git add src/cop/copTimelineData.ts
git commit -m "Add optional attributes field to EvidenceClip"
```

---

### Task 4: Wire attribute extraction into `useCarlaVideoDetection.ts`

**Files:**
- Modify: `src/cop/useCarlaVideoDetection.ts`

**Interfaces:**
- Consumes: `extractPersonAttributes`, `describeAttributes`, `type PersonAttributes` from `./attributeClassifier` (Tasks 1–3)

- [ ] **Step 1: Read the current file to confirm exact content**

Run: `cat -n src/cop/useCarlaVideoDetection.ts`

Confirm the evidence-emission block matches (this is the block being modified):

```ts
        if (frameIndex - lastEvidenceFrameRef.current >= EVIDENCE_EVERY_FRAMES) {
          lastEvidenceFrameRef.current = frameIndex
          const topObject = objects[0]
          const semantic = response.semanticEvents?.at(0)
          const label =
            semantic !== undefined
              ? `${semantic.subjectLabel} ${semantic.action}`
              : `${topObject?.label ?? "object"} 탐지`
          onVisionEvidenceRef.current({
            id: `ev-carla-vision-${cameraId}-${frameIndex}`,
            time: nowClock(),
            camera: cameraId,
            tone: riskToTone(response.situationAnalysisAgent.riskLevel),
            label: `${cameraLabel} · ${label}`,
            detail: `CONF ${Math.round((topObject?.confidence ?? 0) * 100)}%`,
            source: "vision",
            confidencePct: Math.round((topObject?.confidence ?? 0) * 100),
            frameDataUrl: source,
          })
        }
```

If the file has diverged from this (e.g. a different session edited it further), stop and report the actual content instead of guessing — this task's correctness depends on matching this block exactly.

- [ ] **Step 2: Add the attribute-extraction call and disable-on-failure flag**

Modify `src/cop/useCarlaVideoDetection.ts`. Add this import:

```ts
import { describeAttributes, extractPersonAttributes } from "./attributeClassifier"
```

Add these two module-level flags right after the existing `carlaVideoDetrDisabled`/`carlaVideoDetrDisableWarningShown` declarations:

```ts
let carlaAttributesDisabled = false
let carlaAttributesDisableWarningShown = false
```

Add this helper function right after `isDetrMemoryFailure`:

```ts
const extractPersonAttributesSafely = async (
  source: string,
  bbox: { x: number; y: number; width: number; height: number },
  frameHeight: number,
): ReturnType<typeof extractPersonAttributes> extends Promise<infer T>
  ? Promise<T | undefined>
  : never => {
  if (carlaAttributesDisabled) {
    return undefined
  }
  try {
    return await extractPersonAttributes({ source, bbox, frameHeight })
  } catch (error: unknown) {
    if (isDetrMemoryFailure(error)) {
      carlaAttributesDisabled = true
      if (!carlaAttributesDisableWarningShown) {
        carlaAttributesDisableWarningShown = true
        console.warn("CARLA 속성 추출(CLIP) 메모리 부족으로 자동 비활성화했습니다.")
      }
      return undefined
    }
    console.error("CARLA 인물 속성 추출 실패", error)
    return undefined
  }
}
```

Replace the evidence-emission block (confirmed in Step 1) with:

```ts
        if (frameIndex - lastEvidenceFrameRef.current >= EVIDENCE_EVERY_FRAMES) {
          lastEvidenceFrameRef.current = frameIndex
          const topObject = objects[0]
          const personObject = objects.find((object) =>
            object.label.toLowerCase().includes("person"),
          )
          const semantic = response.semanticEvents?.at(0)
          const label =
            semantic !== undefined
              ? `${semantic.subjectLabel} ${semantic.action}`
              : `${topObject?.label ?? "object"} 탐지`

          const attributes =
            personObject !== undefined
              ? await extractPersonAttributesSafely(source, personObject.bbox, FRAME_HEIGHT)
              : undefined
          const attributeSuffix =
            attributes !== undefined ? ` · ${describeAttributes(attributes)}` : ""

          onVisionEvidenceRef.current({
            id: `ev-carla-vision-${cameraId}-${frameIndex}`,
            time: nowClock(),
            camera: cameraId,
            tone: riskToTone(response.situationAnalysisAgent.riskLevel),
            label: `${cameraLabel} · ${label}${attributeSuffix}`,
            detail: `CONF ${Math.round((topObject?.confidence ?? 0) * 100)}%`,
            source: "vision",
            confidencePct: Math.round((topObject?.confidence ?? 0) * 100),
            frameDataUrl: source,
            attributes,
          })
        }
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. If the `extractPersonAttributesSafely` return-type helper (the conditional type) trips up biome/tsc formatting, simplify it to an explicit type instead — replace the function signature with:

```ts
const extractPersonAttributesSafely = async (
  source: string,
  bbox: { x: number; y: number; width: number; height: number },
  frameHeight: number,
): Promise<Awaited<ReturnType<typeof extractPersonAttributes>> | undefined> => {
```

(keep the body identical) — this is simpler and should typecheck cleanly; prefer this form directly if the conditional-type version above causes friction.

- [ ] **Step 4: Run the existing unit test suite**

Run: `npm run test`
Expected: PASS (all existing tests unaffected — this task only touches a file with no direct unit test, covered by e2e)

- [ ] **Step 5: Commit**

```bash
git add src/cop/useCarlaVideoDetection.ts
git commit -m "Attach extracted person attributes to CARLA evidence clips"
```

---

### Task 5: Fold attributes into Codex's `evidence.summary`

**Files:**
- Modify: `src/cop/codexAgentClient.ts`

**Interfaces:**
- No new exports — internal change to `requestCodexAgent`'s request body construction only.

- [ ] **Step 1: Confirm the current line**

Run: `grep -n "증거 패킷" src/cop/codexAgentClient.ts`

Confirm it shows:
```ts
          summary: `${context.incident.zone} ${context.incident.meta} 증거 패킷`,
```

- [ ] **Step 2: Extend the summary**

Modify `src/cop/codexAgentClient.ts` — change that line to:

```ts
          summary: `${context.incident.zone} ${context.incident.meta} 증거 패킷 — ${context.incident.title}`,
```

- [ ] **Step 3: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all pass (no existing test asserts the exact literal `evidence.summary` string sent to `/api/codex-agent`, based on the current test suite's route mocks only asserting response-side behavior — but re-run to be sure)

- [ ] **Step 4: Commit**

```bash
git add src/cop/codexAgentClient.ts
git commit -m "Fold incident title (now attribute-enriched) into Codex evidence.summary"
```

---

### Task 6: e2e test for attribute extraction reaching the UI and Codex

**Files:**
- Modify: `tests/e2e/cop.spec.ts`

- [ ] **Step 1: Add a new test**

Add this test at the end of the `test.describe("D4D COP 표면과 상호작용", ...)` block, after the existing `"CARLA 탐지 시 실시간 알림 팝업이 뜨고..."` test:

```ts
  test("추출된 인물 속성이 EVENT TIMELINE과 Codex 입력에 반영된다", async ({ page }) => {
    const carlaCamera = {
      id: "CARLA-ATTR-01",
      label: "E2E 속성 테스트",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:00.000Z",
      lastFrameAt: "2026-07-03T00:00:01.000Z",
      latestFrameDataUrl: null,
    }

    await page.route("**/api/carla-cameras**", async (route) => {
      if (route.request().url().includes("/frame.jpg")) {
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ cameras: [carlaCamera] }),
      })
    })

    await page.addInitScript(() => {
      window.__D4D_TEST_DETR_DETECTOR__ = async () => [
        { label: "person", score: 0.92, box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 } },
      ]
      window.__D4D_TEST_CLIP_CLASSIFIER__ = async (_source, candidateLabels) => {
        const first = candidateLabels[0]
        const second = candidateLabels[1]
        if (first === undefined || second === undefined) {
          return []
        }
        if (first.includes("hat")) {
          return [
            { label: first, score: 0.2 },
            { label: second, score: 0.8 },
          ]
        }
        return [
          { label: first, score: 0.85 },
          { label: second, score: 0.15 },
        ]
      }
    })
    await page.route("**/api/vision-pipeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          provider: "transformers-detr",
          sequenceId: "attr-test-sequence",
          cameraId: "CARLA-ATTR-01",
          detections: [{ id: "det-attr-001", label: "person", confidence: 0.92 }],
          tracks: [{ id: "trk-attr-001", status: "active_track" }],
          visualAnalysisAgent: { status: "triggered", summary: "테스트 탐지" },
          situationAnalysisAgent: { riskLevel: "watch", summary: "테스트 위험도" },
        }),
      })
    })

    let postedSummary = ""
    await page.route("**/api/codex-agent", async (route) => {
      const payload = route.request().postDataJSON()
      postedSummary = payload?.evidence?.summary ?? ""
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          codexMode: "local-codex-adapter",
          decision: {
            title: "테스트 판단",
            summary: "테스트 응답",
            recommendedAction: "사람 확인 유지",
            checkpoint: "test-checkpoint",
          },
          citations: ["CARLA-ATTR-01"],
          adapterNotice: "테스트 응답",
        }),
      })
    })

    await page.goto("/")

    await expect
      .poll(() => page.locator(".cop-track-block").count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1)

    await page.locator(".cop-track-block").first().hover()
    await expect(page.getByText(/배낭 소지/)).toBeVisible()
    await expect(page.getByText(/모자 없음/)).toBeVisible()

    await page.getByRole("button", { name: "서버 Codex 판단 요청" }).click()
    await expect.poll(() => postedSummary).toContain("배낭 소지")
    await expect.poll(() => postedSummary).toContain("모자 없음")
  })
```

- [ ] **Step 2: Run the new test**

Run: `npx playwright test tests/e2e/cop.spec.ts -g "추출된 인물 속성"`
Expected: PASS

If it times out waiting for `.cop-track-block`, check (in order): (a) the mocked camera's `frameCount`/`lastFrameAt` are non-null (required for `useCarlaVideoDetection`'s effect to fire), (b) the `__D4D_TEST_CLIP_CLASSIFIER__` mock's label-matching logic — it must return scores keyed to whatever candidate label strings `attributeClassifier.ts` actually sends (`HAT_LABELS`/`SLEEVE_LABELS`/`BAG_LABELS`); if Task 2's implementation changed those literal strings, update this mock to match, (c) the color/build text isn't asserted here since it depends on the 1x1 test PNG's actual pixel color, which isn't controlled — only the CLIP-derived hat/bag text (deterministic via the mock) is asserted.

- [ ] **Step 3: Run the full e2e suite**

Run: `npx playwright test tests/e2e/cop.spec.ts`
Expected: all pass (11 total — the 10 from the previous branch plus this one)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/cop.spec.ts
git commit -m "Add e2e test for person-attribute extraction reaching UI and Codex input"
```

---

### Task 7: Final full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the complete QA suite**

Run: `npm run qa:final`
Expected: typecheck, lint, vitest (68 tests: 54 existing + 14 from Task 1), and production build all pass.

- [ ] **Step 2: Run the e2e suite once more standalone**

Run: `npx playwright test tests/e2e/cop.spec.ts`
Expected: 11/11 pass

- [ ] **Step 3: Manual sanity check (optional but recommended)**

If a CARLA bridge or curl-based frame injection is available (as used earlier this session), verify by eye: a detected person's EVENT TIMELINE tooltip and the realtime alert popup both show the Korean attribute description, and requesting a Codex judgment for that incident shows attribute text somewhere in the flow (network tab or local-adapter response echoing `evidence.title`/`summary`).

- [ ] **Step 4: Final commit (if Step 3 turned up any fixes)**

```bash
git add -A
git commit -m "Fix issues found during manual verification"
```

(Skip if Step 3 needed no changes.)

---

## Self-Review Notes

- **Spec coverage:** 5 attributes (hat/sleeve/bag/color/build) → Tasks 1–2. CLIP-only for 3 binary questions, pixel/bbox math for color/build → Task 2. Execution tied to existing `EVIDENCE_EVERY_FRAMES` throttle, not the alert's 8s gate → Task 4. Graceful CLIP-failure degradation → Task 4 (`extractPersonAttributesSafely`). `PersonAttributes` on `EvidenceClip` → Task 3. Human-readable label → Task 4 (`describeAttributes` call). Codex `evidence.summary` → Task 5. Test-hook mockability → Task 2 (`__D4D_TEST_CLIP_CLASSIFIER__`) + Task 6 (e2e using it).
- **Deviation from the design spec, called out explicitly:** the spec listed adding `attributes` to `VisionDetection` in `server/visionPipeline.ts`. Tracing the actual data path Codex uses (`EvidenceClip.label` → `Incident.title` → `codexAgentClient.ts`'s request body) shows the server never sees or needs to see `EvidenceClip` at all — the enrichment is entirely client-side. This plan does not touch any server file. If the human reviewing this plan wants the server-side duplication anyway (e.g. for a future cross-camera-matching service that queries the server rather than client state), flag that before or during Task 3 rather than adding it silently.
- **Type consistency checked:** `PersonAttributes` (Task 1) is consumed identically by `extractPersonAttributes`'s return type (Task 2), `EvidenceClip.attributes` (Task 3), and `describeAttributes`'s parameter (Task 1, called from Task 4). `Bbox`/`VisionFrameObject["bbox"]` shape (`{x,y,width,height}`) matches what `personObject.bbox` actually is in `useCarlaVideoDetection.ts` (sourced from `detectFrameObjectsWithDetr`'s `VisionFrameObject[]`). The CLIP test hook signature in `vite-env.d.ts` (Task 2) matches exactly what `runClipClassification` calls in Task 2's own code, and what Task 6's e2e mock implements.
- **No placeholders:** every step has complete, runnable code — re-checked before saving.
