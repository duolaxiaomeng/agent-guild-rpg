import { afterEach, describe, expect, it, vi } from "vitest";
import { getWorldPayload } from "./api-client";

describe("getWorldPayload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the world payload without cache", async () => {
    const mockPayload = {
      currentDay: 1,
      location: "main_city",
      homesteads: []
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => mockPayload
    } as Response);

    await expect(getWorldPayload()).resolves.toEqual(mockPayload);
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/world", {
      cache: "no-store"
    });
  });
});
