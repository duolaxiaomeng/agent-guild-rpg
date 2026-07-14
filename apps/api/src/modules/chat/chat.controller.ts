import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags
} from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ChatService } from "./chat.service";

/**
 * DTO for creating a chat message.
 *
 * The `content` field is the preferred name for the message text (A-012).
 * The deprecated `body` field is accepted for backward compatibility and
 * mapped to `content` if `content` is not provided.
 */
class CreateChatMessageDto {
  @ApiProperty({ description: "聊天房间 ID", example: "room-chat-student-1" })
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @ApiProperty({
    description: "消息内容（最大 2000 字符）",
    example: "Hello!",
    required: false
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content?: string;

  @ApiProperty({
    description: "消息内容（已废弃，请使用 content）",
    required: false
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body?: string;
}

@ApiTags("chat")
@ApiBearerAuth()
@Controller("chat")
@UseGuards(AuthGuard)
export class ChatController {
  constructor(@Inject(ChatService) private readonly chatService: ChatService) {}

  // ── A-010: Split endpoints for clearer semantics ──

  @ApiOperation({
    summary: "获取聊天房间列表",
    description: "教师获取所有学生聊天房间概览（含最新消息预览）；学生获取自己的房间"
  })
  @Get("rooms")
  getRoomsList(
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    return this.chatService.getRoomsList(user);
  }

  @ApiOperation({
    summary: "获取聊天房间详情",
    description: "获取指定房间的完整信息（含消息、会话摘要等）。支持 before 游标分页"
  })
  @ApiQuery({
    name: "before",
    required: false,
    description: "游标：返回此时间之前的消息（ISO 8601）"
  })
  @Get("rooms/:roomId")
  getRoomDetail(
    @Param("roomId") roomId: string,
    @Query("before") before: string | undefined,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    return this.chatService.getRoomDetail(roomId, before, user);
  }

  // ── Backward-compatible endpoint (A-010) ──

  @ApiOperation({
    summary: "获取聊天房间信息（兼容端点）",
    description:
      "学生获取自己的聊天房间，教师指定 roomId 获取特定房间，或无参数时获取房间列表概览。建议使用 /chat/rooms 和 /chat/rooms/:roomId"
  })
  @Get()
  async getOverview(
    @Query("studentId") requestedStudentId: string | undefined,
    @Query("roomId") requestedRoomId: string | undefined,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    return this.chatService.getRoomPayload(
      requestedStudentId,
      requestedRoomId,
      user
    );
  }

  @ApiOperation({
    summary: "发送聊天消息",
    description: "在指定聊天房间中发送一条新消息。仅学生（含协作者）可发送，教师为只读"
  })
  @Post("messages")
  createMessage(
    @Body() dto: CreateChatMessageDto,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    // A-012: Prefer 'content', fall back to deprecated 'body'
    const content = dto.content ?? dto.body;

    if (!content) {
      throw new BadRequestException("Message content is required");
    }

    if (user.role !== UserRole.student && user.role !== UserRole.teacher) {
      throw new ForbiddenException("Student or teacher access required");
    }

    return this.chatService.createMessage(dto.roomId, content, user);
  }
}
