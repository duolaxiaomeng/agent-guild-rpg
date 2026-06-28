# Prisma Quests Submissions Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `/quests`, `/submissions`, and `/reviews/decide` responses with real Prisma reads and writes, including full submission payload persistence.

**Architecture:** Keep Nest controllers thin and use the existing `PrismaService` as the source of truth. Extend the Prisma schema just enough to persist full submission payloads, seed a minimal session-backed teaching world, and prove behavior through integration tests that verify write-after-read and persisted review decisions.

**Tech Stack:** NestJS, Prisma, SQLite test databases, Vitest, Supertest, pnpm

---

## File Structure

- `apps/api/prisma/schema.prisma` - extend submission persistence fields while keeping review and quest relations intact
- `apps/api/prisma/seed.ts` - seed a valid `AgentSession` and a reusable starter submission context
- `apps/api/src/modules/quests/quests.controller.ts` - query `QuestDay` rows from Prisma instead of returning literals
- `apps/api/src/modules/submissions/submissions.controller.ts` - create `AgentSubmission` and `ReviewResult`, enqueue review, return persisted payload
- `apps/api/src/modules/reviews/reviews.controller.ts` - update persisted `ReviewResult` for teacher decisions
- `apps/api/test/world-api.spec.ts` - prove `/quests` reads seeded Prisma data
- `apps/api/test/submission-flow.spec.ts` - prove submission payload is persisted and review decision survives a later read
- `apps/api/test/contracts/database-shape.spec.ts` - lock schema/seed expectations for new persisted fields
- `AGENTS.md` - capture the reusable method learned from this Prisma hardcode-to-persistence migration

## Task 1: Extend Schema And Seed

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.ts`
- Test: `apps/api/test/contracts/database-shape.spec.ts`

- [ ] **Step 1: Write the failing schema expectation**

Add assertions for `artifacts`, `agentEvaluationHints`, and `submittedAt`, then run:

```bash
pnpm --filter api test -- database-shape
```

Expected: FAIL because the schema does not contain the new persisted submission fields yet.

- [ ] **Step 2: Extend the schema and seed**

Add JSON-backed submission fields and a seeded `AgentSession` linked to `student-1`.

- [ ] **Step 3: Verify the schema contract**

Run:

```bash
pnpm --filter api exec prisma format
pnpm --filter api exec prisma generate
pnpm --filter api test -- database-shape
```

Expected: PASS and Prisma client regenerates successfully.

## Task 2: Red-Green `/quests`

**Files:**
- Modify: `apps/api/test/world-api.spec.ts`
- Modify: `apps/api/src/modules/quests/quests.controller.ts`

- [ ] **Step 1: Tighten the integration test**

Keep the existing seeded quest assertions and ensure the test database is the only source of truth.

- [ ] **Step 2: Run the focused test and watch the hardcoded controller fail the intent**

Run:

```bash
pnpm --filter api test -- world-api
```

Expected: RED if the controller no longer satisfies the stronger Prisma-backed expectation.

- [ ] **Step 3: Implement the minimal Prisma read**

Query `questDay.findMany({ orderBy: { id: "asc" } })` and map enum values to the API shape.

- [ ] **Step 4: Verify green**

Run:

```bash
pnpm --filter api test -- world-api
```

Expected: PASS.

## Task 3: Red-Green `/submissions` And `/reviews/decide`

**Files:**
- Modify: `apps/api/test/submission-flow.spec.ts`
- Modify: `apps/api/src/modules/submissions/submissions.controller.ts`
- Modify: `apps/api/src/modules/reviews/reviews.controller.ts`

- [ ] **Step 1: Write failing persistence assertions**

Extend the submission flow test so it:

```ts
expect(response.body.submission.id).toEqual(expect.any(String));
expect(response.body.submission.artifacts).toEqual([
  { kind: "doc", label: "README", url: "https://example.com/readme" }
]);
```

Then query Prisma after the POST to assert:

```ts
const persistedSubmission = await prisma.agentSubmission.findUniqueOrThrow({
  where: { id: response.body.submission.id },
  include: { reviewResult: true }
});
```

and later assert the teacher decision is persisted after `/reviews/decide`.

- [ ] **Step 2: Run the focused flow test**

Run:

```bash
pnpm --filter api test -- submission-flow
```

Expected: FAIL because the controller still returns hardcoded IDs and does not write to Prisma.

- [ ] **Step 3: Implement the minimal write path**

Create the submission and suggested review inside a Prisma transaction, return the persisted payload, and update the existing review row on `/reviews/decide`.

- [ ] **Step 4: Verify green**

Run:

```bash
pnpm --filter api test -- submission-flow
```

Expected: PASS and the test proves write-after-read plus review persistence.

## Task 4: Full Verification And Method Capture

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Run the package quality gate**

Run:

```bash
pnpm --filter api test
pnpm --filter api build
```

Expected: PASS for the API workspace.

- [ ] **Step 2: Record the reusable method**

Add a concise methodology entry to `AGENTS.md` summarizing how to migrate a teaching API endpoint from hardcoded controller output to Prisma truth using TDD.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md apps/api docs/superpowers/plans/2026-06-29-prisma-quests-submissions-reviews-implementation.md
git commit -m "feat(api): back quests submissions and reviews with prisma"
```
