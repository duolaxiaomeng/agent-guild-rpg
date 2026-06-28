import { z } from "zod";

export const worldLocationSchema = z.enum([
  "main_city",
  "homestead",
  "guild_hall",
  "chat_room",
  "teacher_workbench"
]);

export const homesteadSummarySchema = z.object({
  ownerId: z.string().uuid(),
  displayName: z.string(),
  location: worldLocationSchema,
  isOnline: z.boolean()
});
