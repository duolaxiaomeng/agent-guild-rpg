import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function requireLocalCapacityOptIn({ writes }) {
  if (process.env.CAPACITY_TEST_OPT_IN !== "I_UNDERSTAND_THIS_IS_A_LOAD_TEST") {
    throw new Error("Set CAPACITY_TEST_OPT_IN=I_UNDERSTAND_THIS_IS_A_LOAD_TEST to run capacity tests");
  }
  if (process.env.CAPACITY_TARGET_IS_EPHEMERAL !== "1") {
    throw new Error("Capacity tests require CAPACITY_TARGET_IS_EPHEMERAL=1");
  }
  if (writes && process.env.CAPACITY_ALLOW_WRITES !== "1") {
    throw new Error("This capacity test writes data; set CAPACITY_ALLOW_WRITES=1 explicitly");
  }

  const baseUrl = new URL(process.env.CAPACITY_API_BASE_URL ?? "http://127.0.0.1:3001");
  if (!LOCAL_HOSTS.has(baseUrl.hostname) || !["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("Capacity tests are restricted to localhost targets");
  }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error("CAPACITY_API_BASE_URL must not contain credentials, query parameters, or fragments");
  }
  return baseUrl.origin;
}

export async function readFixtureArray(envName, expectedCount) {
  const fixturePath = process.env[envName];
  if (!fixturePath) {
    throw new Error(`${envName} must point to a local JSON fixture file`);
  }
  const parsed = JSON.parse(await readFile(resolve(fixturePath), "utf8"));
  if (!Array.isArray(parsed) || parsed.length !== expectedCount) {
    throw new Error(`${envName} must contain exactly ${expectedCount} entries`);
  }
  return parsed;
}

export function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index];
}

export async function postJson(url, { token, connectorToken, body, timeoutMs = 10_000 }) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    if (connectorToken) headers["x-agent-connector-token"] = connectorToken;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    await response.arrayBuffer();
    return { status: response.status, durationMs: performance.now() - startedAt };
  } catch {
    return { status: 0, durationMs: performance.now() - startedAt };
  } finally {
    clearTimeout(timeoutId);
  }
}
