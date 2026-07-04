import { z } from "zod"

const objectSchema = <TShape extends z.ZodRawShape>(shape: TShape) =>
  z.object(shape).strict().readonly()

export const LocalActionNameSchema = z.enum([
  "recordAssessment",
  "submitResponseGate",
  "generateCommanderReport",
])
export type LocalActionName = z.infer<typeof LocalActionNameSchema>

export const OntologyObjectIdSchema = z
  .string()
  .regex(/^[a-z][A-Za-z0-9-]*$/)
  .brand("OntologyObjectId")

export const ISODateTimeSchema = z.string().datetime({ offset: true }).brand("ISODateTime")

const refSchema = <TObjectType extends string>(objectType: TObjectType) =>
  objectSchema({ objectType: z.literal(objectType), objectId: OntologyObjectIdSchema })

export const IncidentRefSchema = refSchema("Incident")

export const CitationRefSchema = refSchema("Citation")

export const AssessmentRefSchema = refSchema("Assessment")

export const ResponseGateRefSchema = refSchema("ResponseGate")

export const CommanderReportRefSchema = refSchema("CommanderReport")

export const OntologyObjectRefSchema = z.union([
  IncidentRefSchema,
  CitationRefSchema,
  AssessmentRefSchema,
  ResponseGateRefSchema,
  CommanderReportRefSchema,
])

export const AssessmentOutcomeSchema = z.enum([
  "benign",
  "suspicious",
  "confirmed",
  "needs_human_review",
])

export const ResponseGateStatusSchema = z.enum(["PENDING", "PASS", "BLOCKED"])
export type ResponseGateStatus = z.infer<typeof ResponseGateStatusSchema>

const requiredText = z.string().min(1)
const citationRefsSchema = z.array(CitationRefSchema).readonly()

export const ReportRowSchema = objectSchema({
  id: requiredText,
  label: requiredText,
  value: requiredText,
})

const assessmentFields = {
  incidentRef: IncidentRefSchema,
  assessedAt: ISODateTimeSchema,
  assessedBy: requiredText,
  outcome: AssessmentOutcomeSchema,
  confidence: z.number().min(0).max(1),
  rationale: requiredText,
  citationRefs: citationRefsSchema,
}

export const AssessmentSchema = objectSchema({
  ref: AssessmentRefSchema,
  ...assessmentFields,
})

const responseGateFields = {
  incidentRef: IncidentRefSchema,
  submittedAt: ISODateTimeSchema,
  submittedBy: requiredText,
  rationale: requiredText,
  citationRefs: citationRefsSchema,
}

export const ResponseGateSchema = objectSchema({
  ref: ResponseGateRefSchema,
  status: ResponseGateStatusSchema,
  ...responseGateFields,
})

const commanderReportFields = {
  incidentRefs: z.array(IncidentRefSchema).min(1).readonly(),
  citationRefs: citationRefsSchema,
  assessmentRefs: z.array(AssessmentRefSchema).readonly(),
  gateRefs: z.array(ResponseGateRefSchema).readonly(),
  generatedAt: ISODateTimeSchema,
  title: requiredText,
  summary: requiredText,
  period: requiredText,
  rows: z.array(ReportRowSchema).readonly(),
}

export const CommanderReportSchema = objectSchema({
  ref: CommanderReportRefSchema,
  ...commanderReportFields,
})

export const RecordAssessmentInputSchema = objectSchema({
  assessmentId: OntologyObjectIdSchema,
  ...assessmentFields,
})

export const RecordAssessmentOutputSchema = objectSchema({
  actionType: z.literal("recordAssessment"),
  assessment: AssessmentSchema,
})

export const SubmitResponseGateInputSchema = objectSchema({
  gateRef: ResponseGateRefSchema,
  currentStatus: ResponseGateStatusSchema,
  nextStatus: ResponseGateStatusSchema,
  ...responseGateFields,
})
type SubmitResponseGateInput = Readonly<z.infer<typeof SubmitResponseGateInputSchema>>

export const SubmitResponseGateOutputSchema = objectSchema({
  actionType: z.literal("submitResponseGate"),
  gate: ResponseGateSchema,
  transition: objectSchema({
    from: ResponseGateStatusSchema,
    to: ResponseGateStatusSchema,
  }),
})

export const GenerateCommanderReportInputSchema = objectSchema({
  reportId: OntologyObjectIdSchema,
  ...commanderReportFields,
})

export const GenerateCommanderReportOutputSchema = objectSchema({
  actionType: z.literal("generateCommanderReport"),
  report: CommanderReportSchema,
})

export type LocalActionDefinition = {
  readonly actionType: LocalActionName
  readonly inputSchema: z.ZodType
  readonly outputSchema: z.ZodType
  readonly run: (input: unknown) => unknown
}

export class LocalActionValidationError extends Error {
  readonly actionName: LocalActionName
  readonly reasons: readonly string[]

  constructor(actionName: LocalActionName, reasons: readonly string[]) {
    super(`${actionName} validation failed: ${reasons.join("; ")}`)
    this.name = "LocalActionValidationError"
    this.actionName = actionName
    this.reasons = reasons
  }
}

const gateTransitions: Record<ResponseGateStatus, readonly ResponseGateStatus[]> = {
  PENDING: ["PASS", "BLOCKED"],
  PASS: [],
  BLOCKED: [],
}

const parseActionInput = <TInput>(
  actionName: LocalActionName,
  schema: z.ZodType<TInput>,
  input: unknown,
): TInput => {
  const parsed = schema.safeParse(input)
  if (parsed.success) {
    return parsed.data
  }
  throw new LocalActionValidationError(
    actionName,
    parsed.error.issues.map((issue) => issue.message),
  )
}

const ensureGateTransition = (input: SubmitResponseGateInput): void => {
  const allowedStatuses = gateTransitions[input.currentStatus]
  if (allowedStatuses.includes(input.nextStatus)) {
    return
  }
  throw new LocalActionValidationError("submitResponseGate", [
    `gate transition ${input.currentStatus} -> ${input.nextStatus} is not allowed`,
  ])
}

export const recordAssessment = (input: unknown) => {
  const parsed = parseActionInput("recordAssessment", RecordAssessmentInputSchema, input)
  return RecordAssessmentOutputSchema.parse({
    actionType: "recordAssessment",
    assessment: {
      ref: { objectType: "Assessment", objectId: parsed.assessmentId },
      incidentRef: parsed.incidentRef,
      assessedAt: parsed.assessedAt,
      assessedBy: parsed.assessedBy,
      outcome: parsed.outcome,
      confidence: parsed.confidence,
      rationale: parsed.rationale,
      citationRefs: parsed.citationRefs,
    },
  })
}

export const submitResponseGate = (input: unknown) => {
  const parsed = parseActionInput("submitResponseGate", SubmitResponseGateInputSchema, input)
  ensureGateTransition(parsed)
  return SubmitResponseGateOutputSchema.parse({
    actionType: "submitResponseGate",
    gate: {
      ref: parsed.gateRef,
      incidentRef: parsed.incidentRef,
      status: parsed.nextStatus,
      submittedAt: parsed.submittedAt,
      submittedBy: parsed.submittedBy,
      rationale: parsed.rationale,
      citationRefs: parsed.citationRefs,
    },
    transition: { from: parsed.currentStatus, to: parsed.nextStatus },
  })
}

export const generateCommanderReport = (input: unknown) => {
  const parsed = parseActionInput(
    "generateCommanderReport",
    GenerateCommanderReportInputSchema,
    input,
  )
  return GenerateCommanderReportOutputSchema.parse({
    actionType: "generateCommanderReport",
    report: {
      ref: { objectType: "CommanderReport", objectId: parsed.reportId },
      incidentRefs: parsed.incidentRefs,
      citationRefs: parsed.citationRefs,
      assessmentRefs: parsed.assessmentRefs,
      gateRefs: parsed.gateRefs,
      generatedAt: parsed.generatedAt,
      title: parsed.title,
      summary: parsed.summary,
      period: parsed.period,
      rows: parsed.rows,
    },
  })
}

export const recordAssessmentAction: LocalActionDefinition = {
  actionType: "recordAssessment",
  inputSchema: RecordAssessmentInputSchema,
  outputSchema: RecordAssessmentOutputSchema,
  run: recordAssessment,
}

export const submitResponseGateAction: LocalActionDefinition = {
  actionType: "submitResponseGate",
  inputSchema: SubmitResponseGateInputSchema,
  outputSchema: SubmitResponseGateOutputSchema,
  run: submitResponseGate,
}

export const generateCommanderReportAction: LocalActionDefinition = {
  actionType: "generateCommanderReport",
  inputSchema: GenerateCommanderReportInputSchema,
  outputSchema: GenerateCommanderReportOutputSchema,
  run: generateCommanderReport,
}

export const localOntologyActions: readonly LocalActionDefinition[] = [
  recordAssessmentAction,
  submitResponseGateAction,
  generateCommanderReportAction,
]
