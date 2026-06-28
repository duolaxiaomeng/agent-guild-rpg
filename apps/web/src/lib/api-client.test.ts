import { afterEach, describe, expect, it, vi } from "vitest";
import { getGuildList, getQuestList, getWorldPayload } from "./api-client";

describe("api client", () => {
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

  it("requests the guild list without cache", async () => {
    const mockPayload = [
      {
        id: "guild-1",
        name: "Morning Forge",
        memberCount: 3,
        collaborationPoints: 12
      }
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => mockPayload
    } as Response);

    await expect(getGuildList()).resolves.toEqual(mockPayload);
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/guilds", {
      cache: "no-store"
    });
  });

  it("requests the quest list without cache", async () => {
    const mockPayload = [
      { id: "day-1", title: "First Agent Session", status: "completed" }
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => mockPayload
    } as Response);

    await expect(getQuestList()).resolves.toEqual(mockPayload);
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/quests", {
      cache: "no-store"
    });
  });
});
