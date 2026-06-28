import { describe, expect, it } from "vitest";
import config from "./playwright.config";

describe("playwright config", () => {
  it("uses a dedicated e2e port without touching the api port", () => {
    expect(config.use?.baseURL).toBe("http://localhost:3100");

    expect(config.webServer).toMatchObject({
      command: "pnpm dev:e2e",
      url: "http://localhost:3100"
    });

    expect(config.use?.baseURL).not.toContain("3001");
    expect(config.webServer?.url).not.toContain("3001");
  });
});
