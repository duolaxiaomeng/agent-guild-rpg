import { describe, expect, it } from "vitest";
import config from "./playwright.config";

describe("playwright config", () => {
  it("uses a dedicated production e2e server without touching the api port", () => {
    expect(config.use?.baseURL).toBe("http://localhost:3100");

    expect(config.webServer).toEqual([
      expect.objectContaining({
        command: "bash ../../scripts/start-e2e-api.sh",
        url: "http://localhost:3101/health"
      }),
      expect.objectContaining({
        command: "NEXT_PUBLIC_API_BASE_URL=http://localhost:3101 ALLOW_INSECURE_LOCALHOST=1 pnpm e2e:server",
        url: "http://localhost:3100"
      })
    ]);

    expect(config.use?.baseURL).not.toContain("3001");
    expect(JSON.stringify(config.webServer)).not.toContain("3001");
  });
});
