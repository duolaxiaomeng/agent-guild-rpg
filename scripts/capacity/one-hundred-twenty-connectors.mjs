import {
  percentile,
  postJson,
  readFixtureArray,
  requireLocalCapacityOptIn
} from "./guard.mjs";
import { randomUUID } from "node:crypto";

const baseUrl = requireLocalCapacityOptIn({ writes: true });
const connectors = await readFixtureArray("CAPACITY_CONNECTORS_FILE", 120);
const durationSeconds = Number(process.env.CAPACITY_DURATION_SECONDS ?? 1_800);
const dayId = process.env.CAPACITY_DAY_ID;
if (!Number.isInteger(durationSeconds) || durationSeconds < 30 || durationSeconds > 1_800) {
  throw new Error("CAPACITY_DURATION_SECONDS must be an integer between 30 and 1800");
}
if (!dayId) {
  throw new Error("CAPACITY_DAY_ID is required for batch event validation");
}
for (const entry of connectors) {
  if (!entry || typeof entry.connectorToken !== "string") {
    throw new Error("Each connector fixture requires connectorToken");
  }
}

const health = await fetch(`${baseUrl}/health/ready`);
if (!health.ok) throw new Error(`Target is not ready: HTTP ${health.status}`);

const endAt = Date.now() + durationSeconds * 1_000;
const nextHeartbeatAt = connectors.map(() => 0);
const results = [];
const runId = randomUUID();
let eventSequence = 0;

while (Date.now() < endAt) {
  const now = Date.now();
  const dueIndexes = nextHeartbeatAt
    .map((scheduledAt, index) => scheduledAt <= now ? index : -1)
    .filter((index) => index >= 0);
  if (dueIndexes.length > 0) {
    const batch = await Promise.all(dueIndexes.map(async (index) => {
      nextHeartbeatAt[index] = now + 25_000 + Math.floor(Math.random() * 10_001);
      const connectorToken = connectors[index].connectorToken;
      const sequence = eventSequence++;
      return Promise.all([
        postJson(`${baseUrl}/agent-connectors/heartbeat`, {
          connectorToken,
          body: { status: "online" }
        }).then((result) => ({ kind: "heartbeat", ...result })),
        postJson(`${baseUrl}/agent-connectors/tasks/claim`, {
          connectorToken,
          body: { lightCapacity: 1, heavyCapacity: 1, waitSeconds: 25 },
          timeoutMs: 35_000
        }).then((result) => ({ kind: "claim", ...result })),
        postJson(`${baseUrl}/agent-connectors/events/batch`, {
          connectorToken,
          body: {
            events: [{
              eventId: `${runId}:${index}:${sequence}`,
              dayId,
              type: "capacity.heartbeat",
              payload: { runId, connectorIndex: index },
              occurredAt: new Date().toISOString()
            }]
          }
        }).then((result) => ({ kind: "event", ...result }))
      ]);
    }));
    results.push(...batch.flat());
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const interactiveDurations = results
  .filter((result) => result.kind !== "claim")
  .map((result) => result.durationMs);
const claimDurations = results
  .filter((result) => result.kind === "claim")
  .map((result) => result.durationMs);
const serverErrors = results.filter((result) => result.status >= 500 || result.status === 0).length;
const nonSuccess = results.filter((result) => result.status < 200 || result.status >= 300).length;
const summary = {
  connectors: connectors.length,
  requests: results.length,
  nonSuccess,
  serverErrors,
  interactiveP50Ms: Math.round(percentile(interactiveDurations, 0.5)),
  interactiveP95Ms: Math.round(percentile(interactiveDurations, 0.95)),
  claimP95Ms: Math.round(percentile(claimDurations, 0.95)),
  durationSeconds
};
console.log(JSON.stringify(summary));

// Empty task claims intentionally use a 25-second long poll. Keep their
// latency separate from heartbeat/event writes instead of making every valid
// long poll fail the interactive p95 threshold.
if (
  nonSuccess > 0 ||
  serverErrors > 0 ||
  summary.interactiveP95Ms >= 800 ||
  summary.claimP95Ms >= 30_000
) {
  process.exitCode = 1;
}
