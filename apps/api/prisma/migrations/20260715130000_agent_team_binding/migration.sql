-- Persist one selected Agent identity per student without coupling it to task execution.
CREATE TABLE "AgentTeamBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentTeamBinding_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentTeamBinding_studentId_key"
  ON "AgentTeamBinding"("studentId");
CREATE INDEX "AgentTeamBinding_roleKey_updatedAt_idx"
  ON "AgentTeamBinding"("roleKey", "updatedAt");
