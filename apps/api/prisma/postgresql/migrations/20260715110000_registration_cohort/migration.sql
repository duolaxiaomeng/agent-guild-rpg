CREATE TABLE "StudentCohort" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentCohort_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentCohort_name_key" ON "StudentCohort"("name");

ALTER TABLE "User" ADD COLUMN "cohortId" TEXT;

CREATE INDEX "User_cohortId_role_idx" ON "User"("cohortId", "role");

ALTER TABLE "User"
ADD CONSTRAINT "User_cohortId_fkey"
FOREIGN KEY ("cohortId") REFERENCES "StudentCohort"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
