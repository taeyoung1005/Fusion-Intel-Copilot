import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { TypstCliMissingError, compileTypstPdf } from "./reportTypstCompiler"

const originalEnv = { ...process.env }
const { PATH: originalPath = "" } = originalEnv
const tempDirs: string[] = []

afterEach(async () => {
  process.env = { ...originalEnv }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("compileTypstPdf", () => {
  it("returns PDF bytes from stdout and writes Typst source to stdin", async () => {
    // Given: a fake Typst CLI that records stdin and emits PDF bytes.
    const capturePath = await installFakeTypst(`
const { writeFileSync } = require("node:fs")
const chunks = []
process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
process.stdin.on("end", () => {
  writeFileSync(process.env.D4D_TYPST_STDIN_CAPTURE, Buffer.concat(chunks))
  if (process.argv.slice(2).join(" ") !== "compile --format pdf - -") {
    process.stderr.write("unexpected args: " + process.argv.slice(2).join(" "))
    process.exit(2)
  }
  process.stdout.write(Buffer.from("%PDF-1.7\\n% fake typst\\n"))
})
`)
    process.env = { ...process.env, D4D_TYPST_STDIN_CAPTURE: capturePath }

    // When: the compiler adapter renders a Typst source string.
    const pdf = await compileTypstPdf('#set text(font: "Apple SD Gothic Neo")\n경계구역')

    // Then: stdout is returned as PDF bytes and stdin carried the source.
    expect(pdf.toString("utf8")).toBe("%PDF-1.7\n% fake typst\n")
    expect(await readCapturedTypst(capturePath)).toContain("경계구역")
  })

  it("maps missing typst CLI to a typed error", async () => {
    // Given: PATH does not contain a typst executable.
    process.env = { ...process.env, PATH: "" }

    // When / Then: spawning typst reports the missing CLI in a typed error.
    await expect(compileTypstPdf("경계구역")).rejects.toBeInstanceOf(TypstCliMissingError)
  })

  it("returns Typst compiler stderr in a typed compile error", async () => {
    // Given: a fake Typst CLI that fails with stderr.
    await installFakeTypst(`
process.stdin.resume()
process.stdin.on("end", () => {
  process.stderr.write("error: expected expression at report.typ:12:4")
  process.exit(2)
})
`)

    // When / Then: compiler stderr is preserved for the HTTP boundary.
    await expect(compileTypstPdf("broken typst")).rejects.toMatchObject({
      stderr: "error: expected expression at report.typ:12:4",
    })
  })
})

const installFakeTypst = async (scriptBody: string): Promise<string> => {
  const tempDir = await mkdtemp(join(tmpdir(), "d4d-fake-typst-"))
  tempDirs.push(tempDir)
  const binDir = join(tempDir, "bin")
  const typstPath = join(binDir, "typst")
  const capturePath = join(tempDir, "source.typ")
  await mkdir(binDir)
  await writeFile(
    typstPath,
    `#!/usr/bin/env node
${scriptBody}
`,
    "utf8",
  )
  await chmod(typstPath, 0o755)
  process.env = { ...process.env, PATH: `${binDir}:${originalPath}` }
  return capturePath
}

const readCapturedTypst = async (capturePath: string): Promise<string> => {
  const { readFile } = await import("node:fs/promises")
  return readFile(capturePath, "utf8")
}
