import { z } from "zod";

export const websiteLotteryOptionSchema = z.object({
  id: z.string().min(1),
  dayId: z.string().min(1),
  label: z.string().min(1).max(80),
  description: z.string().max(300),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0)
});

export const websiteLotteryDrawSchema = z.object({
  id: z.string().min(1),
  dayId: z.string().min(1),
  studentId: z.string().min(1),
  drawnAt: z.string().datetime(),
  option: websiteLotteryOptionSchema
});

export const websiteLotteryPayloadSchema = z.object({
  dayId: z.string().min(1),
  options: z.array(websiteLotteryOptionSchema),
  draw: websiteLotteryDrawSchema.nullable()
});

export const websiteLotteryOptionInputSchema = z.object({
  label: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional()
});

export type WebsiteLotteryOption = z.infer<typeof websiteLotteryOptionSchema>;
export type WebsiteLotteryDraw = z.infer<typeof websiteLotteryDrawSchema>;
export type WebsiteLotteryPayload = z.infer<typeof websiteLotteryPayloadSchema>;
export type WebsiteLotteryOptionInput = z.infer<typeof websiteLotteryOptionInputSchema>;
