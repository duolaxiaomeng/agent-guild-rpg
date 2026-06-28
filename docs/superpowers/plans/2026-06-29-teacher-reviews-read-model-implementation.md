# Teacher Reviews Read Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real Prisma-backed `GET /reviews` endpoint that returns teacher workbench summary and review items for the existing teaching world.

**Architecture:** Keep the read model inside the existing `ReviewsController` so the API surface stays minimal. Drive the change through integration tests that first prove the list endpoint is missing, then prove the response is built from persisted submissions, reviews, students, quests, and guild memberships rather than hardcoded controller data.

**Tech Stack:** NestJS, Prisma, SQLite test databases, Vitest, Supertest, pnpm

---

## File Structure

- `apps/api/test/submission-flow.spec.ts` - extend the existing teaching flow test with a failing `GET /reviews` read-model assertion
- `apps/api/src/modules/reviews/reviews.controller.ts` - add the Prisma-backed aggregate list endpoint alongside the existing teacher decision endpoint
- `AGENTS.md` - capture the reusable method for adding a teacher-facing read model on top of persisted submission and review truth

### Task 1: Red-Green `GET /reviews`

**Files:**
- Modify: `apps/api/test/submission-flow.spec.ts`
- Modify: `apps/api/src/modules/reviews/reviews.controller.ts`

- [ ] **Step 1: Write the failing list test**

Add a new integration test after the existing `/reviews/decide` flow that:

```ts
const firstSubmission = await request(app.getHttpServer())
  .post("/submissions")
  .send({
    studentId: "student-1",
    courseWorldId: "course-world-1",
    dayId: "day-1",
    agentSessionId: "session-1",
    triggerType: "button",
    conversationSummary: "Student compared expected and actual output, then corrected the prompt.",
    workSummary: "Student produced a README and screenshot.",
    artifacts: [{ kind: "doc", label: "README", url: "https://example.com/readme" }],
    selfReflection: "I learned to tell the agent what success looks like.",
    agentEvaluationHints: ["one correction loop"],
    timestamp: "2026-06-29T08:00:00.000Z"
  });

const secondSubmission = await request(app.getHttpServer())
  .post("/submissions")
  .send({
    studentId: "student-2",
    courseWorldId: "course-world-1",
    dayId: "day-2",
    agentSessionId: "session-2",
    triggerType: "button",
    conversationSummary: "Student prepared a peer review checklist and updated the prompt.",
    workSummary: "Student submitted notes for the next review round.",
    artifacts: [{ kind: "doc", label: "Notes", url: "https://example.com/notes" }],
    selfReflection: "I can now explain why the second draft is better.",
    agentEvaluationHints: ["peer review prep"],
    timestamp: "2026-06-29T09:00:00.000Z"
  });

await request(app.getHttpServer())
  .post("/reviews/decide")
  .send({
    submissionId: secondSubmission.body.submission.id,
    finalScore: 90,
    decision: "adjust"
  });

const response = await request(app.getHttpServer()).get("/reviews");
```

Then assert:

```ts
expect(response.status).toBe(200);
expect(response.body.summary).toEqual({
  pendingCount: 1,
  reviewedToday: 1,
  flaggedCount: 1
});
expect(response.body.items).toEqual([
  {
    submissionId: secondSubmission.body.submission.id,
    studentName: "Mo",
    guildName: "Morning Forge",
    suggestedScore: 85,
    finalScore: 90,
    decision: "adjust",
    rationale: "Clear goal, evidence of correction, and visible artifact.",
    dayLabel: "Day 2",
    submittedAt: "2026-06-29T09:00:00.000Z"
  },
  {
    submissionId: firstSubmission.body.submission.id,
    studentName: "Lin",
    guildName: "Morning Forge",
    suggestedScore: 85,
    finalScore: 85,
    decision: "approve",
    rationale: "Clear goal, evidence of correction, and visible artifact.",
    dayLabel: "Day 1",
    submittedAt: "2026-06-29T08:00:00.000Z"
  }
]);
```

- [ ] **Step 2: Run the focused flow test**

Run:

```bash
pnpm --filter api test -- submission-flow
```

Expected: FAIL with `Cannot GET /reviews` or equivalent because the read endpoint does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Add `@Get()` to `ReviewsController` and query Prisma with:

```ts
const reviews = await this.prisma.reviewResult.findMany({
  include: {
    submission: {
      include: {
        student: {
          include: {
            memberships: {
              where: { status: MembershipStatus.active },
              include: { guild: true },
              orderBy: { id: "asc" }
            }
          }
        },
        day: true
      }
    }
  },
  orderBy: {
    submission: {
      submittedAt: "desc"
    }
  }
});
```

Map each row to:

```ts
{
  submissionId: review.submissionId,
  studentName: review.submission.student.displayName,
  guildName: review.submission.student.memberships[0]?.guild.name ?? "Unguilded",
  suggestedScore: review.suggestedScore,
  finalScore: review.finalScore,
  decision: review.decision,
  rationale: review.rationale,
  dayLabel: `Day ${review.submission.day.id.replace("day-", "")}`,
  submittedAt: review.submission.submittedAt.toISOString()
}
```

Compute summary from the mapped list:

```ts
{
  pendingCount: items.filter((item) => item.decision === "approve").length,
  reviewedToday: items.filter((item) => item.decision !== "approve").length,
  flaggedCount: items.filter((item) => item.decision === "adjust" || item.decision === "reject").length
}
```

Then correct the summary rules to match the intended meaning exposed by the test:
- `pendingCount`: keep items whose `decision` still equals the initial machine suggestion and have not been teacher-updated
- `reviewedToday`: count items whose persisted `finalScore` differs from `suggestedScore` or whose decision differs from the initial suggestion
- `flaggedCount`: count `adjust` and `reject`

- [ ] **Step 4: Verify green**

Run:

```bash
pnpm --filter api test -- submission-flow
```

Expected: PASS and the test proves the teacher list is built from persisted truth.

### Task 2: Verification And Method Capture

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

Append a methodology entry to `AGENTS.md` explaining that teacher-facing list endpoints should be introduced as thin read models over persisted submission and review truth, and that the TDD loop should verify both the aggregate summary and the item list shape before touching controller code.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md apps/api/src/modules/reviews/reviews.controller.ts apps/api/test/submission-flow.spec.ts docs/superpowers/plans/2026-06-29-teacher-reviews-read-model-implementation.md
git commit -m "feat(api): add teacher reviews read model"
```
