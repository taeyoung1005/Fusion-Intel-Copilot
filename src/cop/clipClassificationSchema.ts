import { z } from "zod"

export const ClipClassificationSchema = z
  .array(z.object({ label: z.string(), score: z.number() }))
  .readonly()

export type ClipClassification = Readonly<z.infer<typeof ClipClassificationSchema>[number]>
