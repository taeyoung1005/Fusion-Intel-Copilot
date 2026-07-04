import { z } from "zod"

export const ActivityEventSourceSchema = z.enum(["vision", "codex", "carla"])
export const ActivityEventLevelSchema = z.enum(["info", "watch", "warn", "error"])
export const ActivityEventDetailSchema = z.record(z.string(), z.unknown()).readonly()

const ActivityEventObjectSchema = z.object({
  ts: z.string().min(1),
  source: ActivityEventSourceSchema,
  stage: z.string().min(1),
  level: ActivityEventLevelSchema,
  message: z.string().min(1),
  detail: ActivityEventDetailSchema.optional(),
})

export const ActivityEventSchema = ActivityEventObjectSchema.strict().readonly()

export const ActivityEventInputSchema = ActivityEventObjectSchema.omit({ ts: true })
  .extend({
    ts: z.string().min(1).optional(),
  })
  .strict()
  .readonly()

export type ActivityEvent = Readonly<z.infer<typeof ActivityEventSchema>>
export type ActivityEventInput = Readonly<z.infer<typeof ActivityEventInputSchema>>
