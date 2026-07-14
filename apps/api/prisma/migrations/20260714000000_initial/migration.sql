-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CourseWorld" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "currentDay" INTEGER NOT NULL,
    "isUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Homestead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    CONSTRAINT "Homestead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "collaborationPoints" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Guild_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "GuildMembership_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GuildMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "homesteadId" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Room_homesteadId_fkey" FOREIGN KEY ("homesteadId") REFERENCES "Homestead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoomAccessGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseWorldId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "homework" TEXT NOT NULL DEFAULT '',
    "acceptanceCriteria" JSONB NOT NULL DEFAULT [],
    "dueAt" DATETIME,
    "publishedAt" DATETIME,
    "teacherId" TEXT,
    CONSTRAINT "QuestDay_courseWorldId_fkey" FOREIGN KEY ("courseWorldId") REFERENCES "CourseWorld" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QuestDay_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebsiteLotteryOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WebsiteLotteryOption_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "QuestDay" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WebsiteLotteryOption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebsiteLotteryDraw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "drawnAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebsiteLotteryDraw_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "QuestDay" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WebsiteLotteryDraw_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WebsiteLotteryDraw_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "WebsiteLotteryOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentPairing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentPairing_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentConnector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "agentSessionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "capabilities" JSONB NOT NULL,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentConnector_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentConnector_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "AgentSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
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

-- CreateTable
CREATE TABLE "AgentSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
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

-- CreateTable
CREATE TABLE "ReviewResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "reviewerId" TEXT,
    "suggestedScore" INTEGER,
    "finalScore" INTEGER,
    "decision" TEXT,
    "rationale" TEXT,
    "aiReviewedAt" DATETIME,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AgentSubmission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReviewResult_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContributionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContributionLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ContributionLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "courseWorldId" TEXT,
    "roomId" TEXT,
    "agentSessionId" TEXT,
    "taskId" TEXT,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" TEXT,
    "importance" REAL NOT NULL DEFAULT 1.0,
    "sourceType" TEXT NOT NULL DEFAULT 'student',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentMemory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentRunSnapshot" (
    "runId" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "input" JSONB,
    "dependencies" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "previousStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassroomSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseWorldId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currentStageId" TEXT,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClassroomSession_courseWorldId_fkey" FOREIGN KEY ("courseWorldId") REFERENCES "CourseWorld" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassroomSession_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "QuestDay" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassroomSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassroomStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "extensionSeconds" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "pausedAt" DATETIME,
    "accumulatedPauseSeconds" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClassroomStage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassroomStaffAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassroomStaffAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassroomStaffAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HelpRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assigneeId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" DATETIME,
    "resolvedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "HelpRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HelpRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HelpRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassroomEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "targetId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassroomEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassroomEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Homestead_ownerId_key" ON "Homestead"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_name_key" ON "Guild"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GuildMembership_guildId_userId_key" ON "GuildMembership"("guildId", "userId");

-- CreateIndex
CREATE INDEX "RoomAccessGrant_roomId_createdAt_idx" ON "RoomAccessGrant"("roomId", "createdAt");

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
CREATE INDEX "AgentEvent_studentId_dayId_occurredAt_idx" ON "AgentEvent"("studentId", "dayId", "occurredAt");

-- CreateIndex
CREATE INDEX "AgentEvent_connectorId_createdAt_idx" ON "AgentEvent"("connectorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewResult_submissionId_key" ON "ReviewResult"("submissionId");

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
CREATE UNIQUE INDEX "UserSession_token_key" ON "UserSession"("token");

-- CreateIndex
CREATE INDEX "UserSession_userId_createdAt_idx" ON "UserSession"("userId", "createdAt");

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

