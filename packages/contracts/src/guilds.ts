import { z } from "zod";

export const guildMembershipRoleSchema = z.enum([
  "leader",
  "member",
  "visitor"
]);

export const guildMembershipStatusSchema = z.enum([
  "active",
  "invited",
  "declined",
  "removed"
]);

export const createGuildSchema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().min(10).max(240)
});

export const createGuildInvitationSchema = z.object({
  email: z.string().trim().email().max(254)
});

export const guildMembershipSchema = z.object({
  id: z.string().trim().min(1),
  guildId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  role: guildMembershipRoleSchema,
  status: guildMembershipStatusSchema,
  invitedById: z.string().trim().min(1).nullable(),
  invitedAt: z.string().datetime().nullable(),
  respondedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const guildInvitationSchema = guildMembershipSchema.extend({
  guildName: z.string().trim().min(1).max(40),
  inviterName: z.string().trim().min(1).max(120),
  inviteeEmail: z.string().trim().email().max(254)
});

export type GuildMembershipRole = z.infer<typeof guildMembershipRoleSchema>;
export type GuildMembershipStatus = z.infer<typeof guildMembershipStatusSchema>;
export type CreateGuild = z.infer<typeof createGuildSchema>;
export type CreateGuildInvitation = z.infer<typeof createGuildInvitationSchema>;
export type GuildMembership = z.infer<typeof guildMembershipSchema>;
export type GuildInvitation = z.infer<typeof guildInvitationSchema>;
