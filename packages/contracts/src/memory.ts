import { z } from "zod";

export const memoryTypeSchema = z.enum(["observation", "reflection", "plan"]);

const memoryScopeRequestShape = {
  courseWorldId: z.string().min(1).optional(),
  roomId: z.string().min(1).optional(),
  agentSessionId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional()
};

export const memoryScopeSchema = z.object(memoryScopeRequestShape);

export const observeRequestSchema = z.object({
  studentId: z.string().min(1),
  type: memoryTypeSchema,
  content: z.string().min(1),
  importance: z.number().min(1).max(10).optional(),
  ...memoryScopeRequestShape
});

export const retrieveRequestSchema = z.object({
  studentId: z.string().min(1),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
  ...memoryScopeRequestShape
});

export const memoryNodeSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  type: memoryTypeSchema,
  content: z.string(),
  importance: z.number(),
  courseWorldId: z.string().nullable(),
  roomId: z.string().nullable(),
  agentSessionId: z.string().nullable(),
  taskId: z.string().nullable(),
  createdAt: z.string(),
  lastAccessedAt: z.string(),
  score: z.number().optional()
});

export const reflectRequestSchema = z.object({
  studentId: z.string().min(1),
  ...memoryScopeRequestShape
});

export const reflectResponseSchema = z.object({
  insights: z.array(z.string())
});

export type ObserveRequest = z.infer<typeof observeRequestSchema>;
export type RetrieveRequest = z.infer<typeof retrieveRequestSchema>;
export type MemoryNode = z.infer<typeof memoryNodeSchema>;
export type ReflectRequest = z.infer<typeof reflectRequestSchema>;
export type ReflectResponse = z.infer<typeof reflectResponseSchema>;
export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type MemoryScope = z.infer<typeof memoryScopeSchema>;
