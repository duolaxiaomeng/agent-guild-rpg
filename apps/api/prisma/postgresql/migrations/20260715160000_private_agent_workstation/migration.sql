CREATE TABLE "AgentWorldState" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "currentZone" TEXT NOT NULL DEFAULT 'workstations',
  "positionX" DOUBLE PRECISION NOT NULL,
  "positionY" DOUBLE PRECISION NOT NULL,
  "facing" TEXT NOT NULL DEFAULT 'down',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentWorldState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentWorldState_studentId_key"
  ON "AgentWorldState"("studentId");
CREATE INDEX "AgentWorldState_currentZone_updatedAt_idx"
  ON "AgentWorldState"("currentZone", "updatedAt");

ALTER TABLE "AgentWorldState"
ADD CONSTRAINT "AgentWorldState_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
