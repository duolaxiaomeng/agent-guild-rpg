PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Guild invitations retain their audit history and inviter identity.
CREATE TABLE "new_GuildMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "invitedById" TEXT,
    "invitedAt" DATETIME,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GuildMembership_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GuildMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GuildMembership_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GuildMembership" ("guildId", "id", "role", "status", "userId", "createdAt", "updatedAt")
SELECT "guildId", "id", "role", "status", "userId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "GuildMembership";
DROP TABLE "GuildMembership";
ALTER TABLE "new_GuildMembership" RENAME TO "GuildMembership";
CREATE UNIQUE INDEX "GuildMembership_guildId_userId_key" ON "GuildMembership"("guildId", "userId");
CREATE UNIQUE INDEX "GuildMembership_one_active_guild_per_student_key" ON "GuildMembership"("userId") WHERE "status" = 'active';
CREATE INDEX "GuildMembership_userId_status_idx" ON "GuildMembership"("userId", "status");
CREATE INDEX "GuildMembership_invitedById_status_invitedAt_idx" ON "GuildMembership"("invitedById", "status", "invitedAt");

-- Connector supplied event ids make retries idempotent.
CREATE TABLE "new_AgentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentEvent_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "AgentConnector" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentEvent_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "QuestDay" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AgentEvent" ("connectorId", "createdAt", "dayId", "eventId", "id", "occurredAt", "payload", "studentId", "type")
SELECT "connectorId", "createdAt", "dayId", "id", "id", "occurredAt", "payload", "studentId", "type" FROM "AgentEvent";
DROP TABLE "AgentEvent";
ALTER TABLE "new_AgentEvent" RENAME TO "AgentEvent";
CREATE UNIQUE INDEX "AgentEvent_eventId_key" ON "AgentEvent"("eventId");
CREATE INDEX "AgentEvent_studentId_dayId_occurredAt_idx" ON "AgentEvent"("studentId", "dayId", "occurredAt");
CREATE INDEX "AgentEvent_connectorId_createdAt_idx" ON "AgentEvent"("connectorId", "createdAt");
CREATE INDEX "AgentEvent_connectorId_occurredAt_id_idx" ON "AgentEvent"("connectorId", "occurredAt", "id");

-- HTTP retries are keyed independently from the generated submission id. The
-- nullable pendingReviewKey is populated while a student/day review is active
-- and cleared after the teacher makes the terminal decision.
CREATE TABLE "new_AgentSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientRequestId" TEXT NOT NULL,
    "pendingReviewKey" TEXT,
    "studentId" TEXT NOT NULL,
    "courseWorldId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "agentSessionId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "conversationSummary" TEXT NOT NULL,
    "workSummary" TEXT NOT NULL,
    "artifacts" JSONB NOT NULL,
    "selfReflection" TEXT NOT NULL,
    "agentEvaluationHints" JSONB NOT NULL,
    "submittedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentSubmission_courseWorldId_fkey" FOREIGN KEY ("courseWorldId") REFERENCES "CourseWorld" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentSubmission_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "QuestDay" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentSubmission_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "AgentSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AgentSubmission" ("agentEvaluationHints", "agentSessionId", "artifacts", "clientRequestId", "conversationSummary", "courseWorldId", "createdAt", "dayId", "id", "selfReflection", "studentId", "submittedAt", "triggerType", "workSummary")
SELECT "agentEvaluationHints", "agentSessionId", "artifacts", "id", "conversationSummary", "courseWorldId", "createdAt", "dayId", "id", "selfReflection", "studentId", "submittedAt", "triggerType", "workSummary" FROM "AgentSubmission";
DROP TABLE "AgentSubmission";
ALTER TABLE "new_AgentSubmission" RENAME TO "AgentSubmission";
CREATE UNIQUE INDEX "AgentSubmission_pendingReviewKey_key" ON "AgentSubmission"("pendingReviewKey");
CREATE UNIQUE INDEX "AgentSubmission_studentId_clientRequestId_key" ON "AgentSubmission"("studentId", "clientRequestId");
CREATE INDEX "AgentSubmission_studentId_dayId_submittedAt_idx" ON "AgentSubmission"("studentId", "dayId", "submittedAt");
CREATE INDEX "AgentSubmission_courseWorldId_dayId_submittedAt_idx" ON "AgentSubmission"("courseWorldId", "dayId", "submittedAt");

-- Durable connector task control plane.
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "courseWorldId" TEXT,
    "dayId" TEXT,
    "guildId" TEXT,
    "studentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "requiredCapabilities" JSONB NOT NULL DEFAULT [],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "resourceClass" TEXT NOT NULL DEFAULT 'heavy',
    "status" TEXT NOT NULL DEFAULT 'blocked',
    "payload" JSONB NOT NULL,
    "blockedByCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwnerId" TEXT,
    "heavyLeaseKey" TEXT,
    "leaseTokenHash" TEXT,
    "leasedAt" DATETIME,
    "leaseExpiresAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "failureReason" TEXT,
    "result" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentTask_courseWorldId_fkey" FOREIGN KEY ("courseWorldId") REFERENCES "CourseWorld" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentTask_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "QuestDay" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentTask_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentTask_leaseOwnerId_fkey" FOREIGN KEY ("leaseOwnerId") REFERENCES "AgentConnector" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AgentTaskDependency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "dependencyTaskId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentTaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentTaskDependency_dependencyTaskId_fkey" FOREIGN KEY ("dependencyTaskId") REFERENCES "AgentTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AgentTaskAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "connectorId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'leased',
    "leaseTokenHash" TEXT NOT NULL,
    "leasedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "errorKind" TEXT,
    "errorMessage" TEXT,
    "result" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentTaskAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentTaskAttempt_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "AgentConnector" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentTask_leaseTokenHash_key" ON "AgentTask"("leaseTokenHash");
CREATE UNIQUE INDEX "AgentTask_runId_key" ON "AgentTask"("runId");
CREATE UNIQUE INDEX "AgentTask_heavyLeaseKey_key" ON "AgentTask"("heavyLeaseKey");
CREATE INDEX "AgentTask_status_resourceClass_availableAt_priority_idx" ON "AgentTask"("status", "resourceClass", "availableAt", "priority");
CREATE INDEX "AgentTask_studentId_status_resourceClass_idx" ON "AgentTask"("studentId", "status", "resourceClass");
CREATE INDEX "AgentTask_courseWorldId_dayId_status_idx" ON "AgentTask"("courseWorldId", "dayId", "status");
CREATE INDEX "AgentTask_guildId_status_createdAt_idx" ON "AgentTask"("guildId", "status", "createdAt");
CREATE INDEX "AgentTask_runId_status_idx" ON "AgentTask"("runId", "status");
CREATE INDEX "AgentTask_leaseOwnerId_leaseExpiresAt_idx" ON "AgentTask"("leaseOwnerId", "leaseExpiresAt");
CREATE UNIQUE INDEX "AgentTaskDependency_taskId_dependencyTaskId_key" ON "AgentTaskDependency"("taskId", "dependencyTaskId");
CREATE INDEX "AgentTaskDependency_dependencyTaskId_taskId_idx" ON "AgentTaskDependency"("dependencyTaskId", "taskId");
CREATE UNIQUE INDEX "AgentTaskAttempt_leaseTokenHash_key" ON "AgentTaskAttempt"("leaseTokenHash");
CREATE UNIQUE INDEX "AgentTaskAttempt_taskId_attemptNumber_key" ON "AgentTaskAttempt"("taskId", "attemptNumber");
CREATE INDEX "AgentTaskAttempt_taskId_status_idx" ON "AgentTaskAttempt"("taskId", "status");
CREATE INDEX "AgentTaskAttempt_connectorId_status_leaseExpiresAt_idx" ON "AgentTaskAttempt"("connectorId", "status", "leaseExpiresAt");
CREATE INDEX "AgentTaskAttempt_status_leaseExpiresAt_idx" ON "AgentTaskAttempt"("status", "leaseExpiresAt");

-- Existing classroom hot-path indexes and lottery uniqueness omitted by the
-- baseline migration.
CREATE INDEX "RoomAccessGrant_granteeId_status_expiresAt_idx" ON "RoomAccessGrant"("granteeId", "status", "expiresAt");
CREATE UNIQUE INDEX "WebsiteLotteryDraw_dayId_optionId_key" ON "WebsiteLotteryDraw"("dayId", "optionId");
CREATE INDEX "AgentSession_studentId_status_createdAt_idx" ON "AgentSession"("studentId", "status", "createdAt");
CREATE INDEX "ReviewResult_status_createdAt_idx" ON "ReviewResult"("status", "createdAt");
CREATE INDEX "ReviewResult_status_decidedAt_idx" ON "ReviewResult"("status", "decidedAt");
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
