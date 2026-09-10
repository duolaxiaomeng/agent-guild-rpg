import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { AgentConnectorStatus, Prisma, UserRole } from "@prisma/client";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

const AGENT_ONLINE_WINDOW_MS = 75 * 1000;

export type LotteryActor = {
  id: string;
  role: UserRole;
};

export type LotteryOptionInput = {
  label: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export type LotteryOptionUpdateInput = Partial<LotteryOptionInput>;

@Injectable()
export class WebsiteLotteryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getDayLottery(dayId: string, actor: LotteryActor) {
    await this.requireDay(dayId);
    const agentOnline = actor.role === UserRole.student
      ? await this.hasOnlineAgent(actor.id)
      : false;
    const options = await this.prisma.websiteLotteryOption.findMany({
      where: actor.role === UserRole.teacher ? { dayId } : { dayId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
    const drawnOptionIds = actor.role === UserRole.student
      ? new Set(
          (await this.prisma.websiteLotteryDraw.findMany({
            where: { dayId },
            select: { optionId: true }
          })).map((item) => item.optionId)
        )
      : new Set<string>();
    const draw = actor.role === UserRole.student
      ? await this.prisma.websiteLotteryDraw.findUnique({
          where: { dayId_studentId: { dayId, studentId: actor.id } },
          include: { option: true }
        })
      : null;

    return {
      dayId,
      agentOnline,
      options: options
        .filter((option) => !drawnOptionIds.has(option.id) || (draw && draw.option.id === option.id))
        .map((option) => this.toOption(option)),
      draw: draw ? this.toDraw(draw) : null
    };
  }

  async createOption(dayId: string, actor: LotteryActor, input: LotteryOptionInput) {
    this.requireTeacher(actor);
    await this.requireDay(dayId);
    const label = input.label.trim();
    if (!label) throw new BadRequestException("Lottery option label is required");
    const option = await this.prisma.websiteLotteryOption.create({
      data: {
        dayId,
        label,
        description: input.description?.trim() ?? "",
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        createdById: actor.id
      }
    });
    return this.toOption(option);
  }

  async updateOption(
    dayId: string,
    optionId: string,
    actor: LotteryActor,
    input: LotteryOptionUpdateInput
  ) {
    this.requireTeacher(actor);
    const existing = await this.prisma.websiteLotteryOption.findFirst({
      where: { id: optionId, dayId }
    });
    if (!existing) {
      throw new NotFoundException("Lottery option not found");
    }
    if (input.label !== undefined && !input.label.trim()) {
      throw new BadRequestException("Lottery option label is required");
    }

    const option = await this.prisma.websiteLotteryOption.update({
      where: { id: optionId },
      data: {
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {})
      }
    });
    return this.toOption(option);
  }

  async deleteOption(dayId: string, optionId: string, actor: LotteryActor) {
    this.requireTeacher(actor);
    const existing = await this.prisma.websiteLotteryOption.findFirst({
      where: { id: optionId, dayId },
      select: { id: true }
    });
    if (!existing) {
      throw new NotFoundException("Lottery option not found");
    }

    const drawCount = await this.prisma.websiteLotteryDraw.count({
      where: { optionId }
    });
    if (drawCount > 0) {
      throw new ConflictException("Lottery option already has draw records; disable it instead");
    }
    await this.prisma.websiteLotteryOption.delete({ where: { id: optionId } });
    return { id: optionId, deleted: true };
  }

  async draw(dayId: string, actor: LotteryActor) {
    if (actor.role !== UserRole.student) {
      throw new ForbiddenException("Only students can draw a website topic");
    }
    await this.requireOnlineAgent(actor.id);
    await this.requireDay(dayId);
    const existing = await this.prisma.websiteLotteryDraw.findUnique({
      where: { dayId_studentId: { dayId, studentId: actor.id } },
      include: { option: true }
    });
    if (existing) {
      return { alreadyDrawn: true, draw: this.toDraw(existing) };
    }

    const availableOptions = await this.getAvailableOptions(dayId);
    if (availableOptions.length === 0) {
      throw new BadRequestException("No remaining website lottery options for this day");
    }

    while (availableOptions.length > 0) {
      const selected = availableOptions[crypto.randomInt(0, availableOptions.length)];
      try {
        const draw = await this.prisma.websiteLotteryDraw.create({
          data: { dayId, studentId: actor.id, optionId: selected.id },
          include: { option: true }
        });
        return { alreadyDrawn: false, draw: this.toDraw(draw) };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
          throw error;
        }
        const concurrentDraw = await this.prisma.websiteLotteryDraw.findUnique({
          where: { dayId_studentId: { dayId, studentId: actor.id } },
          include: { option: true }
        });
        if (concurrentDraw) {
          return { alreadyDrawn: true, draw: this.toDraw(concurrentDraw) };
        }
        const selectedIndex = availableOptions.findIndex((option) => option.id === selected.id);
        if (selectedIndex >= 0) {
          availableOptions.splice(selectedIndex, 1);
        }
      }
    }
    throw new BadRequestException("No remaining website lottery options for this day");
  }

  async redraw(dayId: string, actor: LotteryActor) {
    if (actor.role !== UserRole.student) {
      throw new ForbiddenException("Only students can redraw a website topic");
    }
    await this.requireOnlineAgent(actor.id);
    await this.requireDay(dayId);
    const existing = await this.prisma.websiteLotteryDraw.findUnique({
      where: { dayId_studentId: { dayId, studentId: actor.id } },
      include: { option: true }
    });
    if (!existing) {
      return this.draw(dayId, actor);
    }

    const availableOptions = await this.getAvailableOptions(dayId);
    const redrawOptions = availableOptions.filter((option) => option.id !== existing.optionId);
    if (redrawOptions.length === 0) {
      throw new BadRequestException("No remaining website lottery options for this day");
    }

    while (redrawOptions.length > 0) {
      const selected = redrawOptions[crypto.randomInt(0, redrawOptions.length)];
      try {
        const draw = await this.prisma.$transaction(async (tx) => {
          await tx.websiteLotteryDraw.delete({
            where: { dayId_studentId: { dayId, studentId: actor.id } }
          });
          return tx.websiteLotteryDraw.create({
            data: { dayId, studentId: actor.id, optionId: selected.id },
            include: { option: true }
          });
        });
        return { alreadyDrawn: false, draw: this.toDraw(draw) };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
          throw error;
        }
        const selectedIndex = redrawOptions.findIndex((option) => option.id === selected.id);
        if (selectedIndex >= 0) {
          redrawOptions.splice(selectedIndex, 1);
        }
      }
    }

    throw new BadRequestException("No remaining website lottery options for this day");
  }

  private async requireDay(dayId: string) {
    const day = await this.prisma.questDay.findUnique({
      where: { id: dayId },
      select: { id: true }
    });
    if (!day) throw new NotFoundException("Quest day not found");
  }

  private async hasOnlineAgent(studentId: string) {
    const connector = await this.prisma.agentConnector.findFirst({
      where: {
        studentId,
        status: AgentConnectorStatus.online,
        lastSeenAt: {
          gt: new Date(Date.now() - AGENT_ONLINE_WINDOW_MS)
        }
      },
      select: { id: true }
    });
    return connector !== null;
  }

  private async requireOnlineAgent(studentId: string) {
    if (!(await this.hasOnlineAgent(studentId))) {
      throw new ForbiddenException("An online Agent is required to draw a website topic");
    }
  }

  private async getAvailableOptions(dayId: string, excludedOptionIds: string[] = []) {
    const drawnOptionIds = new Set(
      (await this.prisma.websiteLotteryDraw.findMany({
        where: { dayId },
        select: { optionId: true }
      })).map((item) => item.optionId)
    );
    const blockedOptionIds = new Set([...drawnOptionIds, ...excludedOptionIds]);
    return this.prisma.websiteLotteryOption.findMany({
      where: { dayId, isActive: true, id: { notIn: [...blockedOptionIds] } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
  }

  private requireTeacher(actor: LotteryActor) {
    if (actor.role !== UserRole.teacher) {
      throw new ForbiddenException("Only teachers can manage website lottery options");
    }
  }

  private toOption(option: {
    id: string;
    dayId: string;
    label: string;
    description: string;
    isActive: boolean;
    sortOrder: number;
  }) {
    return {
      id: option.id,
      dayId: option.dayId,
      label: option.label,
      description: option.description,
      isActive: option.isActive,
      sortOrder: option.sortOrder
    };
  }

  private toDraw(draw: {
    id: string;
    dayId: string;
    studentId: string;
    drawnAt: Date;
    option: { id: string; dayId: string; label: string; description: string; isActive: boolean; sortOrder: number };
  }) {
    return {
      id: draw.id,
      dayId: draw.dayId,
      studentId: draw.studentId,
      drawnAt: draw.drawnAt.toISOString(),
      option: this.toOption(draw.option)
    };
  }
}
