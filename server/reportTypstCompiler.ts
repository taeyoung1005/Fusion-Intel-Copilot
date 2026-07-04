import { spawn } from "node:child_process"

export const typstMissingCliMessage =
  "typst CLI가 설치되어 있지 않습니다. 'brew install typst' 후 다시 시도하세요."

export class TypstCliMissingError extends Error {
  constructor(message = typstMissingCliMessage) {
    super(message)
    this.name = "TypstCliMissingError"
  }
}

export class TypstCompileError extends Error {
  readonly stderr: string

  constructor(stderr: string) {
    super(stderr.length > 0 ? stderr : "typst compile failed")
    this.name = "TypstCompileError"
    this.stderr = stderr
  }
}

const hasErrorCode = (error: Error): error is Error & { readonly code: string } =>
  "code" in error && typeof error.code === "string"

export const compileTypstPdf = (source: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const child = spawn("typst", ["compile", "--format", "pdf", "-", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.from(chunk))
    })
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.from(chunk))
    })
    child.on("error", (error: Error) => {
      if (settled) {
        return
      }
      settled = true
      if (hasErrorCode(error) && error.code === "ENOENT") {
        reject(new TypstCliMissingError())
        return
      }
      reject(error)
    })
    child.on("close", (code) => {
      if (settled) {
        return
      }
      settled = true
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks))
        return
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8")
      reject(new TypstCompileError(stderr))
    })
    child.stdin.end(source, "utf8")
  })
