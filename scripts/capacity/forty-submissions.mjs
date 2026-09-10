import {
  percentile,
  postJson,
  readFixtureArray,
  requireLocalCapacityOptIn
} from "./guard.mjs";

const baseUrl = requireLocalCapacityOptIn({ writes: true });
const submissions = await readFixtureArray("CAPACITY_SUBMISSIONS_FILE", 40);

const health = await fetch(`${baseUrl}/health/ready`);
if (!health.ok) throw new Error(`Target is not ready: HTTP ${health.status}`);

const results = await Promise.all(submissions.map((entry) => {
  if (!entry || typeof entry.token !== "string" || typeof entry.body !== "object") {
    throw new Error("Each submission fixture requires token and body");
  }
  return postJson(`${baseUrl}/submissions`, entry);
}));

const durations = results.map((result) => result.durationMs);
const serverErrors = results.filter((result) => result.status >= 500 || result.status === 0).length;
const successful = results.filter((result) => result.status >= 200 && result.status < 300).length;
const summary = {
  total: results.length,
  successful,
  serverErrors,
  p50Ms: Math.round(percentile(durations, 0.5)),
  p95Ms: Math.round(percentile(durations, 0.95))
};
console.log(JSON.stringify(summary));

if (successful !== 40 || serverErrors > 0 || summary.p95Ms >= 800) {
  process.exitCode = 1;
}
