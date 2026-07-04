import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  LocalActionValidationError,
  generateCommanderReport,
  generateCommanderReportAction,
  recordAssessment,
  recordAssessmentAction,
  submitResponseGate,
  submitResponseGateAction,
} from "./actions"

const incidentRef = {
  objectType: "Incident",
  objectId: "incident-road-handoff-001",
} as const

const citationRef = {
  objectType: "Citation",
  objectId: "cite-road-handoff-001",
} as const

const gateRef = {
  objectType: "ResponseGate",
  objectId: "gate-road-handoff-fact",
} as const

describe("local ontology actions", () => {
  it("parses valid recordAssessment inputs into a local assessment output", () => {
    // Given: a complete assessment action input.
    const input = {
      assessmentId: "assessment-road-handoff-001",
      incidentRef,
      assessedAt: "2026-07-04T09:41:02.000Z",
      assessedBy: "operator-watch-01",
      outcome: "needs_human_review",
      confidence: 0.82,
      rationale: "Cross-camera handoff is plausible but still needs operator confirmation.",
      citationRefs: [citationRef],
    } as const

    // When: the local action parses and builds the output.
    const output = recordAssessment(input)

    // Then: the assessment keeps the incident and citation references.
    expect(recordAssessmentAction.inputSchema.safeParse(input).success).toBe(true)
    expect(recordAssessmentAction.outputSchema.safeParse(output).success).toBe(true)
    expect(output.assessment.ref).toEqual({
      objectType: "Assessment",
      objectId: "assessment-road-handoff-001",
    })
    expect(output.assessment.incidentRef).toEqual(incidentRef)
    expect(output.assessment.citationRefs).toEqual([citationRef])
  })

  it("rejects invalid response gate transitions", () => {
    // Given: an operator tries to reopen an already passed gate.
    const input = {
      gateRef,
      incidentRef,
      currentStatus: "PASS",
      nextStatus: "PENDING",
      submittedAt: "2026-07-04T09:43:00.000Z",
      submittedBy: "operator-watch-01",
      rationale: "Incorrectly attempting to reopen the final gate.",
      citationRefs: [citationRef],
    } as const

    // When: the gate reducer evaluates the transition.
    const run = () => submitResponseGate(input)

    // Then: a typed validation error rejects the transition.
    expect(run).toThrow(LocalActionValidationError)
    expect(run).toThrow("submitResponseGate validation failed")
  })

  it("preserves incident and citation refs when generating a commander report", () => {
    // Given: an incident report action input with explicit references.
    const input = {
      reportId: "report-road-handoff-001",
      incidentRefs: [incidentRef],
      citationRefs: [citationRef],
      assessmentRefs: [
        {
          objectType: "Assessment",
          objectId: "assessment-road-handoff-001",
        },
      ],
      gateRefs: [gateRef],
      generatedAt: "2026-07-04T10:00:00.000Z",
      title: "Road Handoff Commander Report",
      summary: "Camera A to B handoff remains under human review.",
      period: "09:38:47 ~ 09:41:02",
      rows: [
        { id: "total", label: "TOTAL EVENTS", value: "2" },
        { id: "watch", label: "WATCH EVENTS", value: "1" },
      ],
    } as const

    // When: the report builder creates the local output.
    const output = generateCommanderReport(input)

    // Then: the report output preserves the object references verbatim.
    expect(generateCommanderReportAction.inputSchema.safeParse(input).success).toBe(true)
    expect(generateCommanderReportAction.outputSchema.safeParse(output).success).toBe(true)
    expect(output.report.ref).toEqual({
      objectType: "CommanderReport",
      objectId: "report-road-handoff-001",
    })
    expect(output.report.incidentRefs).toEqual([incidentRef])
    expect(output.report.citationRefs).toEqual([citationRef])
  })

  it("parses valid submitResponseGate inputs into a local gate output", () => {
    // Given: a pending gate is ready for operator pass.
    const input = {
      gateRef,
      incidentRef,
      currentStatus: "PENDING",
      nextStatus: "PASS",
      submittedAt: "2026-07-04T09:44:00.000Z",
      submittedBy: "operator-watch-01",
      rationale: "Evidence and context reviewed.",
      citationRefs: [citationRef],
    } as const

    // When: the reducer applies the valid transition.
    const output = submitResponseGate(input)

    // Then: the output records the transition without side effects.
    expect(submitResponseGateAction.inputSchema.safeParse(input).success).toBe(true)
    expect(submitResponseGateAction.outputSchema.safeParse(output).success).toBe(true)
    expect(output.gate.status).toBe("PASS")
    expect(output.transition).toEqual({ from: "PENDING", to: "PASS" })
  })

  it("does not import network or external Foundry SDK code", () => {
    // Given: the local action implementation source.
    const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8")

    // When: the source is scanned for forbidden runtime dependencies.
    const forbiddenRuntime = /fetch\(|@osdk|palantir/

    // Then: action definitions remain local-only.
    expect(source).not.toMatch(forbiddenRuntime)
  })
})
