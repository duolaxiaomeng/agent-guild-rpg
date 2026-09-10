CREATE TABLE "StudentCohort" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "StudentCohort_name_key" ON "StudentCohort"("name");

ALTER TABLE "User"
ADD COLUMN "cohortId" TEXT
REFERENCES "StudentCohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_cohortId_role_idx" ON "User"("cohortId", "role");
