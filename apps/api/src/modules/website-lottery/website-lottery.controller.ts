import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { WebsiteLotteryService } from "./website-lottery.service";

class LotteryOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

type LotteryUser = { id: string; role: UserRole };

@ApiTags("website-lottery")
@ApiBearerAuth()
@Controller("website-lottery")
@UseGuards(AuthGuard)
export class WebsiteLotteryController {
  constructor(@Inject(WebsiteLotteryService) private readonly service: WebsiteLotteryService) {}

  @Get("days/:dayId")
  @ApiOperation({ summary: "读取某个 Day 的网站类型抽奖配置与当前学生结果" })
  getDay(@Param("dayId") dayId: string, @CurrentUser() user: LotteryUser) {
    return this.service.getDayLottery(dayId, user);
  }

  @Post("days/:dayId/draw")
  @ApiOperation({ summary: "学生通过在线 Agent 抽取一次网站类型" })
  draw(@Param("dayId") dayId: string, @CurrentUser() user: LotteryUser) {
    return this.service.draw(dayId, user);
  }

  @Post("days/:dayId/redraw")
  @ApiOperation({ summary: "学生通过在线 Agent 退回当前抽签并重新抽取" })
  redraw(@Param("dayId") dayId: string, @CurrentUser() user: LotteryUser) {
    return this.service.redraw(dayId, user);
  }

  @Post("days/:dayId/options")
  @ApiOperation({ summary: "老师新增自定义网站类型抽奖项" })
  createOption(@Param("dayId") dayId: string, @Body() body: LotteryOptionDto, @CurrentUser() user: LotteryUser) {
    return this.service.createOption(dayId, user, { ...body, label: body.label ?? "" });
  }

  @Patch("days/:dayId/options/:optionId")
  @ApiOperation({ summary: "老师编辑网站类型抽奖项" })
  updateOption(@Param("dayId") dayId: string, @Param("optionId") optionId: string, @Body() body: LotteryOptionDto, @CurrentUser() user: LotteryUser) {
    return this.service.updateOption(dayId, optionId, user, body);
  }

  @Delete("days/:dayId/options/:optionId")
  @ApiOperation({ summary: "老师删除未被抽取的网站类型项" })
  deleteOption(@Param("dayId") dayId: string, @Param("optionId") optionId: string, @CurrentUser() user: LotteryUser) {
    return this.service.deleteOption(dayId, optionId, user);
  }
}
