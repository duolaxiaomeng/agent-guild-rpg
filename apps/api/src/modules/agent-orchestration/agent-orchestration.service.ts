import { Inject, Injectable } from "@nestjs/common";
import {
  AgentTaskService,
  type CreateDatabaseAgentTaskInput,
} from "./agent-task.service";

/**
 * 教师控制面的稳定门面。运行状态由 AgentTask 表持久化，不再依赖单进程内存。
 */
@Injectable()
export class AgentOrchestrationService {
  constructor(
    @Inject(AgentTaskService) private readonly tasks: AgentTaskService,
  ) {}

  create(input: CreateDatabaseAgentTaskInput) {
    return this.tasks.create(input);
  }

  list() {
    return this.tasks.list();
  }

  listForStudent(studentId: string) {
    return this.tasks.listForStudent(studentId);
  }

  get(runId: string) {
    return this.tasks.get(runId);
  }

  schedule() {
    return this.tasks.schedule();
  }

  pause(runId: string) {
    return this.tasks.pause(runId);
  }

  resume(runId: string) {
    return this.tasks.resume(runId);
  }

  cancel(runId: string) {
    return this.tasks.cancel(runId);
  }
}
