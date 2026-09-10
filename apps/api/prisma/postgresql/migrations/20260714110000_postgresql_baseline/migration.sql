-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('teacher', 'student');

-- CreateEnum
CREATE TYPE "GuildMembershipRole" AS ENUM ('leader', 'member', 'visitor');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'invited', 'declined', 'removed');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('chat_room', 'workshop', 'archive', 'guild_hall');

-- CreateEnum
CREATE TYPE "QuestStatus" AS ENUM ('open', 'locked', 'completed');

-- CreateEnum
CREATE TYPE "AgentSessionStatus" AS ENUM ('active', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "AgentConnectorStatus" AS ENUM ('online', 'offline', 'revoked');

-- CreateEnum
CREATE TYPE "SubmissionTriggerType" AS ENUM ('button', 'chat_command', 'schedule');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('approve', 'adjust', 'reject');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('queued', 'ai_reviewed', 'needs_teacher', 'teacher_decided');

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM ('blocked', 'queued', 'leased', 'running', 'completed', 'failed', 'needs_teacher', 'cancelled');

-- CreateEnum
CREATE TYPE "AgentTaskResourceClass" AS ENUM ('light', 'heavy');

-- CreateEnum
CREATE TYPE "AgentTaskAttemptStatus" AS ENUM ('leased', 'running', 'completed', 'failed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "ContributionKind" AS ENUM ('peer_review', 'collaboration', 'build_support');

-- CreateEnum
CREATE TYPE "ClassroomSessionStatus" AS ENUM ('draft', 'live', 'completed');

-- CreateEnum
CREATE TYPE "ClassroomStageStatus" AS ENUM ('draft', 'running', 'paused', 'completed', 'ended_early');

-- CreateEnum
CREATE TYPE "ClassroomStaffRole" AS ENUM ('teacher', 'assistant');

-- CreateEnum
CREATE TYPE "HelpRequestCategory" AS ENUM ('blocked', 'environment', 'question', 'review', 'other');

-- CreateEnum
CREATE TYPE "HelpRequestStatus" AS ENUM ('open', 'claimed', 'resolved', 'cancelled');

-- CreateEnum
CREATE TYPE "ClassroomEventType" AS ENUM ('session_started', 'stage_started', 'stage_paused', 'stage_extended', 'stage_completed', 'stage_ended_early', 'stage_unlocked', 'help_created', 'help_claimed', 'help_resolved', 'help_cancelled');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseWorld" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentDay" INTEGER NOT NULL,
    "isUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseWorld_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Homestead" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "Homestead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "collaborationPoints" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildMembership" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GuildMembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL,
    "invitedById" TEXT,
    "invitedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "homesteadId" TEXT,
    "type" "RoomType" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomAccessGrant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestDay" (
    "id" TEXT NOT NULL,
    "courseWorldId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "QuestStatus" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "homework" TEXT NOT NULL DEFAULT '',
    "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
    "dueAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "teacherId" TEXT,

    CONSTRAINT "QuestDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteLotteryOption" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteLotteryOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteLotteryDraw" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteLotteryDraw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "AgentSessionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPairing" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentPairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConnector" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "agentSessionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "AgentConnectorStatus" NOT NULL DEFAULT 'offline',
    "capabilities" JSONB NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSubmission" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "pendingReviewKey" TEXT,
    "studentId" TEXT NOT NULL,
    "courseWorldId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "agentSessionId" TEXT NOT NULL,
    "triggerType" "SubmissionTriggerType" NOT NULL,
    "conversationSummary" TEXT NOT NULL,
    "workSummary" TEXT NOT NULL,
    "artifacts" JSONB NOT NULL,
    "selfReflection" TEXT NOT NULL,
    "agentEvaluationHints" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewResult" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'queued',
    "reviewerId" TEXT,
    "suggestedScore" INTEGER,
    "finalScore" INTEGER,
    "decision" "ReviewDecision",
    "rationale" TEXT,
    "aiReviewedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "kind" "ContributionKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseWorldId" TEXT,
    "roomId" TEXT,
    "agentSessionId" TEXT,
    "taskId" TEXT,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" TEXT,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "sourceType" TEXT NOT NULL DEFAULT 'student',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunSnapshot" (
    "runId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input" JSONB,
    "dependencies" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "previousStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRunSnapshot_pkey" PRIMARY KEY ("runId")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "courseWorldId" TEXT,
    "dayId" TEXT,
    "guildId" TEXT,
    "studentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "requiredCapabilities" JSONB NOT NULL DEFAULT '[]',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "resourceClass" "AgentTaskResourceClass" NOT NULL DEFAULT 'heavy',
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'blocked',
    "payload" JSONB NOT NULL,
    "blockedByCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwnerId" TEXT,
    "heavyLeaseKey" TEXT,
    "leaseTokenHash" TEXT,
    "leasedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTaskDependency" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependencyTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTaskAttempt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "connectorId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "status" "AgentTaskAttemptStatus" NOT NULL DEFAULT 'leased',
    "leaseTokenHash" TEXT NOT NULL,
    "leasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorKind" TEXT,
    "errorMessage" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTaskAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomSession" (
    "id" TEXT NOT NULL,
    "courseWorldId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "status" "ClassroomSessionStatus" NOT NULL DEFAULT 'draft',
    "currentStageId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomStage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "extensionSeconds" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "accumulatedPauseSeconds" INTEGER NOT NULL DEFAULT 0,
    "status" "ClassroomStageStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomStaffAssignment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ClassroomStaffRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomStaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpRequest" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "category" "HelpRequestCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "HelpRequestStatus" NOT NULL DEFAULT 'open',
    "assigneeId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HelpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "eventType" "ClassroomEventType" NOT NULL,
    "targetId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Homestead_ownerId_key" ON "Homestead"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_name_key" ON "Guild"("name");

-- CreateIndex
CREATE INDEX "GuildMembership_userId_status_idx" ON "GuildMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "GuildMembership_invitedById_status_invitedAt_idx" ON "GuildMembership"("invitedById", "status", "invitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuildMembership_guildId_userId_key" ON "GuildMembership"("guildId", "userId");

-- A student can hold only one active guild membership across all guilds.
CREATE UNIQUE INDEX "GuildMembership_one_active_guild_per_student_key" ON "GuildMembership"("userId") WHERE "status" = 'active';

-- CreateIndex
CREATE INDEX "RoomAccessGrant_roomId_createdAt_idx" ON "RoomAccessGrant"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "RoomAccessGrant_granteeId_status_expiresAt_idx" ON "RoomAccessGrant"("granteeId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestDay_courseWorldId_publishedAt_idx" ON "QuestDay"("courseWorldId", "publishedAt");

-- CreateIndex
CREATE INDEX "QuestDay_teacherId_publishedAt_idx" ON "QuestDay"("teacherId", "publishedAt");

-- CreateIndex
CREATE INDEX "WebsiteLotteryOption_dayId_isActive_sortOrder_idx" ON "WebsiteLotteryOption"("dayId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "WebsiteLotteryDraw_optionId_drawnAt_idx" ON "WebsiteLotteryDraw"("optionId", "drawnAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteLotteryDraw_dayId_studentId_key" ON "WebsiteLotteryDraw"("dayId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteLotteryDraw_dayId_optionId_key" ON "WebsiteLotteryDraw"("dayId", "optionId");

-- CreateIndex
CREATE INDEX "AgentSession_studentId_status_createdAt_idx" ON "AgentSession"("studentId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPairing_codeHash_key" ON "AgentPairing"("codeHash");

-- CreateIndex
CREATE INDEX "AgentPairing_studentId_createdAt_idx" ON "AgentPairing"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentPairing_expiresAt_usedAt_idx" ON "AgentPairing"("expiresAt", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConnector_agentSessionId_key" ON "AgentConnector"("agentSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConnector_tokenHash_key" ON "AgentConnector"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentConnector_studentId_status_lastSeenAt_idx" ON "AgentConnector"("studentId", "status", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentEvent_eventId_key" ON "AgentEvent"("eventId");

-- CreateIndex
CREATE INDEX "AgentEvent_studentId_dayId_occurredAt_idx" ON "AgentEvent"("studentId", "dayId", "occurredAt");

-- CreateIndex
CREATE INDEX "AgentEvent_connectorId_createdAt_idx" ON "AgentEvent"("connectorId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentEvent_connectorId_occurredAt_id_idx" ON "AgentEvent"("connectorId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSubmission_pendingReviewKey_key" ON "AgentSubmission"("pendingReviewKey");

-- CreateIndex
CREATE INDEX "AgentSubmission_studentId_dayId_submittedAt_idx" ON "AgentSubmission"("studentId", "dayId", "submittedAt");

-- CreateIndex
CREATE INDEX "AgentSubmission_courseWorldId_dayId_submittedAt_idx" ON "AgentSubmission"("courseWorldId", "dayId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSubmission_studentId_clientRequestId_key" ON "AgentSubmission"("studentId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewResult_submissionId_key" ON "ReviewResult"("submissionId");

-- CreateIndex
CREATE INDEX "ReviewResult_status_createdAt_idx" ON "ReviewResult"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewResult_status_decidedAt_idx" ON "ReviewResult"("status", "decidedAt");

-- CreateIndex
CREATE INDEX "AgentMemory_studentId_type_idx" ON "AgentMemory"("studentId", "type");

-- CreateIndex
CREATE INDEX "AgentMemory_studentId_createdAt_idx" ON "AgentMemory"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentMemory_studentId_courseWorldId_idx" ON "AgentMemory"("studentId", "courseWorldId");

-- CreateIndex
CREATE INDEX "AgentMemory_studentId_roomId_idx" ON "AgentMemory"("studentId", "roomId");

-- CreateIndex
CREATE INDEX "AgentMemory_studentId_agentSessionId_idx" ON "AgentMemory"("studentId", "agentSessionId");

-- CreateIndex
CREATE INDEX "AgentMemory_studentId_taskId_idx" ON "AgentMemory"("studentId", "taskId");

-- CreateIndex
CREATE INDEX "AgentRunSnapshot_status_updatedAt_idx" ON "AgentRunSnapshot"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTask_runId_key" ON "AgentTask"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTask_heavyLeaseKey_key" ON "AgentTask"("heavyLeaseKey");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTask_leaseTokenHash_key" ON "AgentTask"("leaseTokenHash");

-- CreateIndex
CREATE INDEX "AgentTask_status_resourceClass_availableAt_priority_idx" ON "AgentTask"("status", "resourceClass", "availableAt", "priority");

-- CreateIndex
CREATE INDEX "AgentTask_studentId_status_resourceClass_idx" ON "AgentTask"("studentId", "status", "resourceClass");

-- CreateIndex
CREATE INDEX "AgentTask_courseWorldId_dayId_status_idx" ON "AgentTask"("courseWorldId", "dayId", "status");

-- CreateIndex
CREATE INDEX "AgentTask_guildId_status_createdAt_idx" ON "AgentTask"("guildId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentTask_runId_status_idx" ON "AgentTask"("runId", "status");

-- CreateIndex
CREATE INDEX "AgentTask_leaseOwnerId_leaseExpiresAt_idx" ON "AgentTask"("leaseOwnerId", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "AgentTaskDependency_dependencyTaskId_taskId_idx" ON "AgentTaskDependency"("dependencyTaskId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTaskDependency_taskId_dependencyTaskId_key" ON "AgentTaskDependency"("taskId", "dependencyTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTaskAttempt_leaseTokenHash_key" ON "AgentTaskAttempt"("leaseTokenHash");

-- CreateIndex
CREATE INDEX "AgentTaskAttempt_taskId_status_idx" ON "AgentTaskAttempt"("taskId", "status");

-- CreateIndex
CREATE INDEX "AgentTaskAttempt_connectorId_status_leaseExpiresAt_idx" ON "AgentTaskAttempt"("connectorId", "status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "AgentTaskAttempt_status_leaseExpiresAt_idx" ON "AgentTaskAttempt"("status", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTaskAttempt_taskId_attemptNumber_key" ON "AgentTaskAttempt"("taskId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_token_key" ON "UserSession"("token");

-- CreateIndex
CREATE INDEX "UserSession_userId_createdAt_idx" ON "UserSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "ClassroomSession_courseWorldId_status_idx" ON "ClassroomSession"("courseWorldId", "status");

-- CreateIndex
CREATE INDEX "ClassroomSession_teacherId_status_idx" ON "ClassroomSession"("teacherId", "status");

-- CreateIndex
CREATE INDEX "ClassroomStage_sessionId_sortOrder_idx" ON "ClassroomStage"("sessionId", "sortOrder");

-- CreateIndex
CREATE INDEX "ClassroomStage_sessionId_status_idx" ON "ClassroomStage"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomStage_sessionId_sortOrder_key" ON "ClassroomStage"("sessionId", "sortOrder");

-- CreateIndex
CREATE INDEX "ClassroomStaffAssignment_sessionId_role_idx" ON "ClassroomStaffAssignment"("sessionId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomStaffAssignment_sessionId_userId_key" ON "ClassroomStaffAssignment"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomStaffAssignment_sessionId_role_key" ON "ClassroomStaffAssignment"("sessionId", "role");

-- CreateIndex
CREATE INDEX "HelpRequest_sessionId_status_createdAt_idx" ON "HelpRequest"("sessionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "HelpRequest_studentId_createdAt_idx" ON "HelpRequest"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "ClassroomEvent_sessionId_createdAt_idx" ON "ClassroomEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ClassroomEvent_sessionId_eventType_createdAt_idx" ON "ClassroomEvent"("sessionId", "eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "Homestead" ADD CONSTRAINT "Homestead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guild" ADD CONSTRAINT "Guild_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_homesteadId_fkey" FOREIGN KEY ("homesteadId") REFERENCES "Homestead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestDay" ADD CONSTRAINT "QuestDay_courseWorldId_fkey" FOREIGN KEY ("courseWorldId") REFERENCES "CourseWorld"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestDay" ADD CONSTRAINT "QuestDay_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteLotteryOption" ADD CONSTRAINT "WebsiteLotteryOption_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "QuestDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteLotteryOption" ADD CONSTRAINT "WebsiteLotteryOption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteLotteryDraw" ADD CONSTRAINT "WebsiteLotteryDraw_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "QuestDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteLotteryDraw" ADD CONSTRAINT "WebsiteLotteryDraw_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteLotteryDraw" ADD CONSTRAINT "WebsiteLotteryDraw_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "WebsiteLotteryOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPairing" ADD CONSTRAINT "AgentPairing_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConnector" ADD CONSTRAINT "AgentConnector_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConnector" ADD CONSTRAINT "AgentConnector_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "AgentConnector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "QuestDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSubmission" ADD CONSTRAINT "AgentSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSubmission" ADD CONSTRAINT "AgentSubmission_courseWorldId_fkey" FOREIGN KEY ("courseWorldId") REFERENCES "CourseWorld"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSubmission" ADD CONSTRAINT "AgentSubmission_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "QuestDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSubmission" ADD CONSTRAINT "AgentSubmission_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "AgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewResult" ADD CONSTRAINT "ReviewResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AgentSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewResult" ADD CONSTRAINT "ReviewResult_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionLog" ADD CONSTRAINT "ContributionLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionLog" ADD CONSTRAINT "ContributionLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_courseWorldId_fkey" FOREIGN KEY ("courseWorldId") REFERENCES "CourseWorld"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "QuestDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_leaseOwnerId_fkey" FOREIGN KEY ("leaseOwnerId") REFERENCES "AgentConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTaskDependency" ADD CONSTRAINT "AgentTaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTaskDependency" ADD CONSTRAINT "AgentTaskDependency_dependencyTaskId_fkey" FOREIGN KEY ("dependencyTaskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTaskAttempt" ADD CONSTRAINT "AgentTaskAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTaskAttempt" ADD CONSTRAINT "AgentTaskAttempt_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "AgentConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomSession" ADD CONSTRAINT "ClassroomSession_courseWorldId_fkey" FOREIGN KEY ("courseWorldId") REFERENCES "CourseWorld"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomSession" ADD CONSTRAINT "ClassroomSession_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "QuestDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomSession" ADD CONSTRAINT "ClassroomSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomStage" ADD CONSTRAINT "ClassroomStage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomStaffAssignment" ADD CONSTRAINT "ClassroomStaffAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomStaffAssignment" ADD CONSTRAINT "ClassroomStaffAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpRequest" ADD CONSTRAINT "HelpRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpRequest" ADD CONSTRAINT "HelpRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpRequest" ADD CONSTRAINT "HelpRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomEvent" ADD CONSTRAINT "ClassroomEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomEvent" ADD CONSTRAINT "ClassroomEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
