import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import { ClassroomsController } from "./classrooms.controller";
import { ClassroomsService } from "./classrooms.service";
import { RoomsService } from "../rooms/rooms.service";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [ClassroomsController],
  providers: [ClassroomsService, AuthService, AuthGuard, RoomsService],
  exports: [ClassroomsService]
})
export class ClassroomsModule {}
