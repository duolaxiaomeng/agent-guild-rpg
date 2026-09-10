CREATE TABLE "AgentTeamBinding" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentTeamBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentTeamBinding_studentId_key"
  ON "AgentTeamBinding"("studentId");
CREATE INDEX "AgentTeamBinding_roleKey_updatedAt_idx"
  ON "AgentTeamBinding"("roleKey", "updatedAt");

ALTER TABLE "AgentTeamBinding"
ADD CONSTRAINT "AgentTeamBinding_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
