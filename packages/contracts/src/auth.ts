import { z } from "zod";

export const userRoleSchema = z.enum(["teacher", "student"]);

export const authCohortSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const authUserSchema = z.object({
  id: z.string().uuid(),
  role: userRoleSchema,
  displayName: z.string().min(1),
  cohort: authCohortSchema.nullable().optional()
});

export const authSessionSchema = z.object({
  token: z.string().min(1),
  user: authUserSchema
});
