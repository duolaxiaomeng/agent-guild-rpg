import { z } from "zod";

export const guildMembershipRoleSchema = z.enum([
  "leader",
  "member",
  "visitor"
]);

export const createGuildSchema = z.object({
  name: z.string().min(2).max(40),
  description: z.string().min(10).max(240)
});
