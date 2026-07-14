import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { WebsiteLotteryService } from "../src/modules/website-lottery/website-lottery.service";

const option = {
  id: "option-1",
  dayId: "day-1",
  label: "个人作品集网站",
  description: "展示项目和联系方式",
  isActive: true,
  sortOrder: 1,
  createdAt: new Date()
};

const optionTwo = {
  id: "option-2",
  dayId: "day-1",
  label: "Agent 短视频选题网站",
  description: "让 Agent 根据关键词和热点生成选题池",
  isActive: true,
  sortOrder: 2,
  createdAt: new Date()
};

describe("WebsiteLotteryService", () => {
  it("lets a teacher add an arbitrary custom website option", async () => {
    const create = vi.fn().mockResolvedValue(option);
    const service = new WebsiteLotteryService({
      questDay: { findUnique: vi.fn().mockResolvedValue({ id: "day-1" }) },
      websiteLotteryOption: { create }
    } as never);

    await expect(service.createOption("day-1", { id: "teacher-1", role: UserRole.teacher }, {
      label: " 宠物领养网站 ",
      description: "列表、筛选和领养申请"
    })).resolves.toMatchObject({ label: option.label });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        dayId: "day-1",
        label: "宠物领养网站",
        createdById: "teacher-1"
      })
    }));
  });

  it("allows one student draw and persists the selected website type", async () => {
    const draw = {
      id: "draw-1",
      dayId: "day-1",
      studentId: "student-1",
      drawnAt: new Date("2026-07-14T10:00:00.000Z"),
      option
    };
    const create = vi.fn().mockResolvedValue(draw);
    const service = new WebsiteLotteryService({
      questDay: { findUnique: vi.fn().mockResolvedValue({ id: "day-1" }) },
      websiteLotteryDraw: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create
      },
      websiteLotteryOption: { findMany: vi.fn().mockResolvedValue([option]) }
    } as never);

    await expect(service.draw("day-1", { id: "student-1", role: UserRole.student })).resolves.toMatchObject({
      alreadyDrawn: false,
      draw: { option: { id: "option-1", label: "个人作品集网站" } }
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: { dayId: "day-1", studentId: "student-1", optionId: "option-1" }
    }));
  });

  it("does not allow a teacher to draw for a student", async () => {
    const service = new WebsiteLotteryService({} as never);
    await expect(service.draw("day-1", { id: "teacher-1", role: UserRole.teacher }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it("draws without repeating a topic in the same day", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({
        id: "draw-1",
        dayId: "day-1",
        studentId: "student-1",
        drawnAt: new Date("2026-07-14T10:00:00.000Z"),
        option
      })
      .mockResolvedValueOnce({
        id: "draw-2",
        dayId: "day-1",
        studentId: "student-2",
        drawnAt: new Date("2026-07-14T10:05:00.000Z"),
        option: optionTwo
      });
    const service = new WebsiteLotteryService({
      questDay: { findUnique: vi.fn().mockResolvedValue({ id: "day-1" }) },
      websiteLotteryDraw: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ optionId: option.id }]),
        create
      },
      websiteLotteryOption: {
        findMany: vi.fn()
          .mockResolvedValueOnce([option, optionTwo])
          .mockResolvedValueOnce([optionTwo])
      }
    } as never);

    await expect(service.draw("day-1", { id: "student-1", role: UserRole.student })).resolves.toMatchObject({
      alreadyDrawn: false,
      draw: { option: { id: "option-1" } }
    });
    await expect(service.draw("day-1", { id: "student-2", role: UserRole.student })).resolves.toMatchObject({
      alreadyDrawn: false,
      draw: { option: { id: "option-2" } }
    });
  });

  it("hides already drawn topics from the remaining student pool", async () => {
    const service = new WebsiteLotteryService({
      questDay: { findUnique: vi.fn().mockResolvedValue({ id: "day-1" }) },
      websiteLotteryDraw: {
        findMany: vi.fn().mockResolvedValue([{ optionId: "option-1" }]),
        findUnique: vi.fn().mockResolvedValue(null)
      },
      websiteLotteryOption: {
        findMany: vi.fn().mockResolvedValue([option, optionTwo])
      }
    } as never);

    await expect(service.getDayLottery("day-1", { id: "student-1", role: UserRole.student })).resolves.toMatchObject({
      dayId: "day-1",
      options: [{ id: "option-2" }],
      draw: null
    });
  });
});
