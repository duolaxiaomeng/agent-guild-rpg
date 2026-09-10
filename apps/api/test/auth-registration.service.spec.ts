import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/modules/auth/auth.service";

describe("AuthService registration", () => {
  it("rejects registration before touching the database when the internal code is invalid", async () => {
    const findUnique = vi.fn();
    const service = new AuthService({ user: { findUnique } } as never);

    await expect(
      service.register({
        displayName: "新同学",
        email: "new@academy.test",
        password: "student-pass-123",
        registrationCode: "wrong-code"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("creates a student, homestead, chat room and session after code verification", async () => {
    const tx = {
      studentCohort: {
        upsert: vi.fn().mockResolvedValue({
          id: "cohort-chuangshuo-agent-1",
          name: "船说agent第一期班"
        })
      },
      user: {
        create: vi.fn().mockResolvedValue({
          id: "student-new",
          role: UserRole.student,
          displayName: "新同学"
        })
      },
      homestead: {
        create: vi.fn().mockResolvedValue({ id: "home-new" })
      },
      room: { create: vi.fn().mockResolvedValue({ id: "room-chat-student-new" }) }
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
      userSession: {
        create: vi.fn().mockResolvedValue({
          expiresAt: new Date("2026-07-14T08:00:00.000Z")
        })
      }
    };
    const service = new AuthService(prisma as never);

    const result = await service.register({
      displayName: " 新同学 ",
      email: " NEW@academy.test ",
      password: "student-pass-123",
      registrationCode: "chuangshuo_agent_one"
    });

    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        cohortId: "cohort-chuangshuo-agent-1",
        email: "new@academy.test",
        displayName: "新同学",
        role: UserRole.student
      })
    }));
    expect(tx.studentCohort.upsert).toHaveBeenCalledWith({
      where: { id: "cohort-chuangshuo-agent-1" },
      update: { isActive: true, name: "船说agent第一期班" },
      create: {
        id: "cohort-chuangshuo-agent-1",
        isActive: true,
        name: "船说agent第一期班"
      }
    });
    expect(tx.homestead.create).toHaveBeenCalledWith({
      data: { ownerId: "student-new", title: "新同学 的工坊" }
    });
    expect(tx.room.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: "room-chat-student-new",
        homesteadId: "home-new",
        type: "chat_room"
      })
    }));
    expect(result).toMatchObject({
      token: expect.stringMatching(/^session_/),
      user: {
        id: "student-new",
        role: "student",
        displayName: "新同学",
        cohort: {
          id: "cohort-chuangshuo-agent-1",
          name: "船说agent第一期班"
        }
      }
    });
  });
});
