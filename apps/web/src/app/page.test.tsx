import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getWorldPayload } from "../lib/api-client";
import HomePage from "./page";

vi.mock("../lib/api-client", () => ({
  getWorldPayload: vi.fn()
}));

describe("home page", () => {
  it("renders the main city heading with live world data", async () => {
    vi.mocked(getWorldPayload).mockResolvedValue({
      currentDay: 1,
      location: "main_city",
      homesteads: [
        {
          ownerId: "student-1",
          displayName: "Lin",
          location: "homestead",
          isOnline: true
        },
        {
          ownerId: "student-2",
          displayName: "Mo",
          location: "homestead",
          isOnline: false
        },
        {
          ownerId: "student-3",
          displayName: "Kai",
          location: "homestead",
          isOnline: true
        }
      ]
    });

    render(await HomePage());

    expect(screen.getByText("主城区")).toBeInTheDocument();
    expect(screen.getByText("第 1 天教学世界")).toBeInTheDocument();
    expect(screen.getByText("在线家园 2 / 3")).toBeInTheDocument();
  });
});
