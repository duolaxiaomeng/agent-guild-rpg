import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { scoreImportance, generateReflections } from "./llm/ark-adapter";

const REFLECTION_THRESHOLD = 150.0;
const REFLECTION_FOCAL_COUNT = 3;
const REFLECTION_INSIGHT_COUNT = 5;
const DEFAULT_RETRIEVE_LIMIT = 30;
const REFLECT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

const VALID_TYPES = new Set(["observation", "reflection", "plan"]);

export type MemoryScope = {
  courseWorldId?: string;
  roomId?: string;
  agentSessionId?: string;
  taskId?: string;
};

/**
 * R-030: Simple LRU cache with max size to prevent unbounded growth.
 * Uses Map insertion order to evict least-recently-used entries.
 */
class SimpleLRU<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxSize: number = 1000) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
    this.map.set(key, value);
  }
}

export type MemoryNode = {
  id: string;
  studentId: string;
  type: string;
  content: string;
  importance: number;
  courseWorldId: string | null;
  roomId: string | null;
  agentSessionId: string | null;
  taskId: string | null;
  createdAt: string;
  lastAccessedAt: string;
  score: number;
};

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  // R-030: Use LRU cache instead of unbounded Map
  private lastReflectTime = new SimpleLRU<string, number>(500);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async observe(
    studentId: string,
    type: string,
    content: string,
    importance?: number,
    sourceType: string = "student",
    scope: MemoryScope = {}
  ) {
    // R-033: Use BadRequestException instead of generic Error
    if (!VALID_TYPES.has(type)) {
      throw new BadRequestException(`Invalid memory type: ${type}`);
    }

    const finalImportance =
      importance !== undefined ? importance : await scoreImportance(content);

    const memory = await this.prisma.agentMemory.create({
      data: {
        studentId,
        type,
        content,
        importance: finalImportance,
        sourceType,
        ...scope
      }
    });

    // Auto-trigger reflection when cumulative importance exceeds threshold
    if (type === "observation") {
      // R-017: use .catch instead of queueMicrotask + void
      this.maybeAutoReflect(studentId, scope).catch((err: unknown) => {
        this.logger.error(
          `Auto-reflect failed for ${studentId}: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }

    return memory;
  }

  async retrieve(
    studentId: string,
    query: string,
    limit: number = DEFAULT_RETRIEVE_LIMIT,
    scope: MemoryScope = {}
  ): Promise<MemoryNode[]> {
    // Use a generous pre-limit to reduce data transfer while keeping scoring accuracy.
    // Factor 4 ensures we capture enough candidates for relevance scoring.
    const preLimit = limit * 4;

    const memories = await this.prisma.agentMemory.findMany({
      where: { studentId, ...scope },
      orderBy: [
        { importance: "desc" },
        { createdAt: "desc" }
      ],
      take: preLimit
    });

    const now = Date.now();
    const queryTerms = this.tokenize(query);

    const scored = memories.map((memory) => {
      const hoursSinceCreation =
        (now - memory.createdAt.getTime()) / (1000 * 60 * 60);

      const recency = Math.exp(-0.01 * hoursSinceCreation);

      const relevance = this.computeRelevance(memory.content, queryTerms);

      const normalizedImportance = memory.importance / 10.0;

      const score =
        recency * 0.5 + relevance * 3.0 + normalizedImportance * 2.0;

      return {
        id: memory.id,
        studentId: memory.studentId,
        type: memory.type,
        content: memory.content,
        importance: memory.importance,
        courseWorldId: memory.courseWorldId,
        roomId: memory.roomId,
        agentSessionId: memory.agentSessionId,
        taskId: memory.taskId,
        createdAt: memory.createdAt.toISOString(),
        lastAccessedAt: memory.lastAccessedAt.toISOString(),
        score
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, limit);

    if (top.length > 0) {
      const ids = top.map((m) => m.id);
      await this.prisma.agentMemory.updateMany({
        where: { id: { in: ids } },
        data: { lastAccessedAt: new Date() }
      });
    }

    return top;
  }

  async reflect(
    studentId: string,
    scope: MemoryScope = {}
  ): Promise<{ insights: string[] }> {
    const recentObservations = await this.prisma.agentMemory.findMany({
      where: {
        studentId,
        type: "observation",
        ...scope
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    const cumulativeImportance = recentObservations.reduce(
      (sum, m) => sum + m.importance,
      0
    );

    if (cumulativeImportance < REFLECTION_THRESHOLD) {
      return { insights: [] };
    }

    const focalPoints = this.selectFocalPoints(recentObservations);

    const memoryContents = recentObservations
      .slice(0, 20)
      .map((m) => m.content);

    const relatedMemories = await this.retrieve(
      studentId,
      focalPoints.join(" "),
      20,
      scope
    );
    const allMemoryContents = [
      ...memoryContents,
      ...relatedMemories.map((m) => m.content)
    ];

    const insights = await generateReflections(allMemoryContents, focalPoints);

    if (insights.length === 0) {
      return { insights: [] };
    }

    // R-032: Use createMany instead of individual create calls
    const insightsToStore = insights.slice(0, REFLECTION_INSIGHT_COUNT);
    if (insightsToStore.length > 0) {
      await this.prisma.agentMemory.createMany({
        data: insightsToStore.map((insight) => ({
          studentId,
          type: "reflection",
          content: insight,
          importance: 7.0,
          ...scope
        }))
      });
    }

    return { insights };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s,，。.!！?？;；:：、]+/)
      .filter((token) => token.length > 0);
  }

  private computeRelevance(content: string, queryTerms: string[]): number {
    if (queryTerms.length === 0) {
      return 0;
    }

    const contentLower = content.toLowerCase();
    let matchCount = 0;

    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        matchCount++;
      }
    }

    return matchCount / queryTerms.length;
  }

  /**
   * Check cumulative importance of recent observations and
   * auto-trigger reflection if the threshold is exceeded.
   * Includes a cooldown to prevent repeated reflections within 10 minutes.
   */
  private async maybeAutoReflect(
    studentId: string,
    scope: MemoryScope
  ): Promise<void> {
    try {
      // Cooldown: skip if a reflection was triggered recently
      const scopeKey = [
        studentId,
        scope.courseWorldId ?? "*",
        scope.roomId ?? "*",
        scope.agentSessionId ?? "*",
        scope.taskId ?? "*"
      ].join(":");
      const lastTime = this.lastReflectTime.get(scopeKey);
      if (lastTime && Date.now() - lastTime < REFLECT_COOLDOWN_MS) {
        return;
      }

      const recentObservations = await this.prisma.agentMemory.findMany({
        where: { studentId, type: "observation", ...scope },
        orderBy: { createdAt: "desc" },
        take: 50
      });

      const cumulativeImportance = recentObservations.reduce(
        (sum, m) => sum + m.importance,
        0
      );

      if (cumulativeImportance >= REFLECTION_THRESHOLD) {
        await this.reflect(studentId, scope);
        this.lastReflectTime.set(scopeKey, Date.now());
      }
    } catch (err: unknown) {
      // Silently ignore auto-reflection errors to avoid disrupting observe()
      this.logger.error(
        `Auto-reflect error for ${studentId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private selectFocalPoints(
    observations: Array<{ content: string; importance: number }>
  ): string[] {
    const sorted = [...observations].sort(
      (a, b) => b.importance - a.importance
    );

    return sorted
      .slice(0, REFLECTION_FOCAL_COUNT)
      .map((o) => o.content.slice(0, 50));
  }
}
