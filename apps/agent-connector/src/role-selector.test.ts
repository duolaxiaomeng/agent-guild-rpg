import { describe, expect, it, vi } from "vitest";
import { parseRoleSelectionOutput, selectAgentRole } from "./role-selector.js";

const baseOptions = {
  provider: "codex-cli",
  workspaceRoot: process.cwd(),
};

describe("local Agent role selection", () => {
  it("accepts only the exact role-selection JSON protocol", () => {
    expect(parseRoleSelectionOutput('{"roleKey":"qa"}')).toBe("qa");
    expect(() => parseRoleSelectionOutput('result\n{"roleKey":"qa"}')).toThrow(
      /strict JSON/i,
    );
    expect(() => parseRoleSelectionOutput('{"roleKey":"qa","note":"x"}')).toThrow(
      /only roleKey/i,
    );
  });

  it("retries once when the model returns invalid JSON", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ succeeded: true, output: "```json" })
      .mockResolvedValueOnce({ succeeded: true, output: '{"roleKey":"ta"}' });

    await expect(selectAgentRole({ ...baseOptions, run })).resolves.toBe("ta");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("retries once when the model returns an invalid role", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ succeeded: true, output: '{"roleKey":"lead"}' })
      .mockResolvedValueOnce({
        succeeded: true,
        output: '{"roleKey":"frontend-developer"}',
      });

    await expect(selectAgentRole({ ...baseOptions, run })).resolves.toBe(
      "frontend-developer",
    );
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("retries once when the local model times out", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("Provider timed out"))
      .mockResolvedValueOnce({
        succeeded: true,
        output: '{"roleKey":"deployment-release"}',
      });

    await expect(selectAgentRole({ ...baseOptions, run })).resolves.toBe(
      "deployment-release",
    );
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("fails without randomly choosing after two invalid attempts", async () => {
    const run = vi.fn().mockResolvedValue({
      succeeded: true,
      output: '{"roleKey":"unknown"}',
    });

    await expect(selectAgentRole({ ...baseOptions, run })).rejects.toThrow(
      /failed after 2 attempts/i,
    );
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("uses a deterministic fallback after two failed model attempts", async () => {
    const run = vi.fn().mockResolvedValue({
      succeeded: false,
      output: "provider unavailable",
    });
    const onFallback = vi.fn();

    await expect(
      selectAgentRole({
        ...baseOptions,
        run,
        fallback: "qa",
        onFallback,
      }),
    ).resolves.toBe("qa");
    expect(run).toHaveBeenCalledTimes(2);
    expect(onFallback).toHaveBeenCalledWith(
      "role-selection provider process failed",
    );
  });

  it("uses the validated manual takeover without invoking the model", async () => {
    const run = vi.fn();
    await expect(
      selectAgentRole({ ...baseOptions, override: "deployment-release", run }),
    ).resolves.toBe("deployment-release");
    expect(run).not.toHaveBeenCalled();

    await expect(
      selectAgentRole({ ...baseOptions, override: "lead", run }),
    ).rejects.toThrow(/AGENT_GUILD_ROLE_KEY/);
  });
});
