import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { NpcConversationService } from "./npc-conversation.service";
import { NPC_PERSONAS } from "./npc-personas";

type AuthUser = {
  id: string;
  role: string;
  displayName: string;
};

type NpcConversationResponse = {
  npcId: string;
  npcName: string;
  reply: string;
  degraded: boolean;
  llmUsed: boolean;
};

type PostConversationBody = {
  studentId?: string;
  message?: string;
};

@ApiTags("npc")
@ApiBearerAuth()
@Controller("npc")
@UseGuards(AuthGuard)
export class NpcConversationController {
  constructor(
    @Inject(NpcConversationService)
    private readonly conversationService: NpcConversationService,
  ) {}

  /**
   * GET /npc
   *
   * Returns a list of all available NPCs with their id and name.
   */
  @ApiOperation({
    summary: "获取所有 NPC 列表",
    description: "返回所有可用 NPC 的 id 和名称，供客户端展示 NPC 选择列表",
  })
  @Get()
  listNpcs() {
    return {
      npcs: Object.entries(NPC_PERSONAS).map(([id, persona]) => ({
        id,
        name: persona.name,
        zone: persona.zone,
      })),
    };
  }

  /**
   * GET /npc/:npcId/conversation?studentId=...&message=...
   *
   * Retrieve a greeting or a conversational reply from an NPC.
   * - If `message` is provided, the NPC responds to that message.
   * - If `message` is omitted, the NPC produces a greeting.
   * - `studentId` is optional and enables memory-based personalization.
   */
  @ApiOperation({
    summary: "与 NPC 对话",
    description: "获取 NPC 的问候或对话回复。提供 message 参数时 NPC 回复该消息，省略时返回问候语",
  })
  @Get(":npcId/conversation")
  async getConversation(
    @Param("npcId") npcId: string,
    @Query("studentId") studentId?: string,
    @Query("message") message?: string,
    @CurrentUser() user?: AuthUser,
  ): Promise<NpcConversationResponse> {
    // R-021: Verify studentId ownership — students can only use their own ID
    if (user?.role === "student" && studentId && studentId !== user.id) {
      throw new ForbiddenException("无权使用其他学生的 studentId");
    }
    const result = await this.conversationService.getConversation(
      npcId,
      studentId,
      message,
    );
    return result;
  }

  /**
   * POST /npc/:npcId/conversation
   * Body: { studentId?: string, message?: string }
   *
   * Send a message to an NPC and receive a reply.
   * Same behaviour as the GET variant but uses POST for messages
   * that may be long or contain special characters.
   */
  @ApiOperation({
    summary: "向 NPC 发送消息",
    description: "向指定 NPC 发送消息并获取回复，适用于长消息或含特殊字符的消息",
  })
  @Post(":npcId/conversation")
  async postConversation(
    @Param("npcId") npcId: string,
    @Body() body: PostConversationBody,
    @CurrentUser() user?: AuthUser,
  ): Promise<NpcConversationResponse> {
    // R-021: Verify studentId ownership — students can only use their own ID
    if (user?.role === "student" && body.studentId && body.studentId !== user.id) {
      throw new ForbiddenException("无权使用其他学生的 studentId");
    }
    const result = await this.conversationService.getConversation(
      npcId,
      body.studentId,
      body.message,
    );
    return result;
  }
}
