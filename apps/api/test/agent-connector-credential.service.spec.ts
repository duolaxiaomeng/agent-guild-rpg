import { BadRequestException } from "@nestjs/common";
import { AgentConnectorStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AgentConnectorsService } from "../src/modules/agent-connectors/agent-connectors.service";

describe("Agent connector credentials", () => {
  it("binds one signed credential to the server address and student before exchanging it", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const transaction = {
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          role: "student",
          agentTeamBinding: null,
        }),
      },
      agentSession: { create: vi.fn().mockResolvedValue({ id: "session-new" }) },
      agentConnector: {
        create: vi.fn().mockResolvedValue({
          id: "connector-new",
          agentSessionId: "session-new",
          provider: "codex-cli",
          clientName: "lin-mac",
          status: AgentConnectorStatus.online,
          capabilities: ["events"],
          connectedAt: now,
          lastSeenAt: now
        })
      },
      agentPairing: { update: vi.fn().mockResolvedValue(undefined) }
    };
    const prisma = {
      agentPairing: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ expiresAt }),
        findUnique: vi.fn().mockResolvedValue({
          id: "pairing-new",
          studentId: "student-1",
          usedAt: null,
          expiresAt
        })
      },
      $transaction: vi.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction))
    };
    const service = new AgentConnectorsService(prisma as never);

    const issued = await service.createPairing("student-1", "https://academy.example.com");
    const encodedPayload = issued.connectionCredential.split(".")[1];
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );
    expect(payload).toMatchObject({
      version: 1,
      serverUrl: "https://academy.example.com",
      studentId: "student-1"
    });
    expect(payload.pairingSecret).not.toMatch(/^.{8}$/);

    const connected = await service.connect({
      connectionCredential: issued.connectionCredential,
      provider: "codex-cli",
      clientName: "lin-mac",
      capabilities: ["events"]
    });

    expect(connected).toMatchObject({
      connectorId: "connector-new",
      agentSessionId: "session-new",
      status: "online"
    });
    expect(transaction.agentPairing.update).toHaveBeenCalledWith({
      where: { id: "pairing-new" },
      data: { usedAt: expect.any(Date) }
    });
  });

  it("rejects credentials whose signed payload was altered", async () => {
    const service = new AgentConnectorsService({} as never);

    await expect(
      service.connect({
        connectionCredential: "agc1.eyJ2ZXJzaW9uIjoxfQ.invalid-signature",
        provider: "codex-cli",
        clientName: "lin-mac",
        capabilities: ["events"]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
