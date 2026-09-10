CREATE TABLE "AgentWorldState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "currentZone" TEXT NOT NULL DEFAULT 'workstations',
    "positionX" REAL NOT NULL,
    "positionY" REAL NOT NULL,
    "facing" TEXT NOT NULL DEFAULT 'down',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentWorldState_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentWorldState_studentId_key"
  ON "AgentWorldState"("studentId");
CREATE INDEX "AgentWorldState_currentZone_updatedAt_idx"
  ON "AgentWorldState"("currentZone", "updatedAt");
