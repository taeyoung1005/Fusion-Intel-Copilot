import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

const runDemoOntology = (): string =>
  execFileSync("npm", ["run", "demo:ontology", "--silent"], {
    cwd: process.cwd(),
    encoding: "utf8",
  })

describe("demo:ontology", () => {
  it("prints a deterministic local ontology graph summary", () => {
    // Given: the synthetic fixture-driven ontology demo command.
    const requiredSnippets = [
      "Local ontology graph summary",
      "Object kind counts",
      "  Sensor:",
      "  Observation:",
      "  Track:",
      "  Incident:",
      "  EvidenceClip:",
      "  Citation:",
      "Link type counts",
      "Action type counts",
      "Sample path",
      "Sensor:",
      "Incident:",
      "ResponseGate:",
    ] as const

    // When: callers run the CLI surface twice.
    const firstOutput = runDemoOntology()
    const secondOutput = runDemoOntology()

    // Then: the output is stable and includes every required graph family.
    expect(secondOutput).toBe(firstOutput)
    for (const snippet of requiredSnippets) {
      expect(firstOutput).toContain(snippet)
    }
    expect(firstOutput).not.toMatch(/: 0\b/)
  })
})
