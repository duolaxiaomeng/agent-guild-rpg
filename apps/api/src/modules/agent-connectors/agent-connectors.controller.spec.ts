import { describe, expect, it } from "vitest";
import { resolveConnectorPublicApiUrl } from "./agent-connectors.controller";

describe("resolveConnectorPublicApiUrl", () => {
  it("replaces a localhost credential origin with the classroom LAN address", () => {
    expect(resolveConnectorPublicApiUrl({
      protocol: "http",
      host: "localhost:3001",
      localIpv4Addresses: ["192.168.3.22"],
    })).toBe("http://192.168.3.22:3001");
  });

  it("keeps the LAN host used by a student browser", () => {
    expect(resolveConnectorPublicApiUrl({
      protocol: "http",
      host: "192.168.3.22:3001",
      localIpv4Addresses: ["192.168.3.22"],
    })).toBe("http://192.168.3.22:3001");
  });

  it("prefers an explicitly configured public connector URL", () => {
    expect(resolveConnectorPublicApiUrl({
      configured: "https://agents.example.com",
      protocol: "http",
      host: "localhost:3001",
      localIpv4Addresses: ["192.168.3.22"],
    })).toBe("https://agents.example.com");
  });
});
