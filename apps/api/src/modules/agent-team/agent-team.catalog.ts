export const GLOBAL_AGENT_TEAM_ROLE_KEYS = [
  "ta",
  "reviewer",
  "mentor",
  "qa",
  "philosophy-design-mentor",
  "software-architect",
  "deployment-release",
  "frontend-developer",
  "backend-developer",
  "operations-architect",
] as const;

export type GlobalAgentTeamRoleKey =
  (typeof GLOBAL_AGENT_TEAM_ROLE_KEYS)[number];

export interface AgentTeamRoleDefinition {
  name: string;
  description: string;
  capabilities: string[];
  parallelResponsibilities: string[];
}

export const AGENT_TEAM_ROLE_DIRECTORY: Record<
  GlobalAgentTeamRoleKey,
  AgentTeamRoleDefinition
> = {
  ta: {
    name: "助教 Agent",
    description: "辅助教学，负责解答学生疑问和提供学习建议",
    capabilities: ["学生辅导", "学习建议", "路径推荐"],
    parallelResponsibilities: ["学生答疑", "学习路径建议", "评审结果学习建议"],
  },
  reviewer: {
    name: "评审 Agent",
    description: "自动初评学生提交，给出结构化评审意见",
    capabilities: ["提交初评", "评分建议", "风险标签"],
    parallelResponsibilities: ["提交评审", "风险识别", "评分建议生成"],
  },
  mentor: {
    name: "答疑 Agent",
    description: "深度答疑，针对学生困惑提供详细解析",
    capabilities: ["技术答疑", "概念解析", "实例说明"],
    parallelResponsibilities: ["关卡技术答疑", "复杂概念解释", "常见问题准备"],
  },
  qa: {
    name: "测试专家 Agent",
    description: "负责测试验证、边界检查和回归质量保障",
    capabilities: ["测试设计", "边界检查", "回归验证"],
    parallelResponsibilities: ["测试用例设计", "异常路径验证", "回归结果汇总"],
  },
  "philosophy-design-mentor": {
    name: "哲学与设计思维导师 Agent",
    description: "引导从价值、原则和用户体验出发思考系统设计",
    capabilities: ["哲学思考", "设计思维", "价值澄清"],
    parallelResponsibilities: ["设计原则梳理", "用户价值分析", "方案反思"],
  },
  "software-architect": {
    name: "软件设计架构师 Agent",
    description: "负责系统分层、模块边界和技术架构决策",
    capabilities: ["软件设计", "架构设计", "模块拆分"],
    parallelResponsibilities: ["架构评审", "边界定义", "技术方案设计"],
  },
  "deployment-release": {
    name: "部署发布专家 Agent",
    description: "负责部署配置、发布流程和版本交付",
    capabilities: ["部署", "发布", "环境配置"],
    parallelResponsibilities: ["发布计划制定", "环境检查", "版本交付"],
  },
  "frontend-developer": {
    name: "前端开发专家 Agent",
    description: "负责用户界面、交互体验和前端实现",
    capabilities: ["前端开发", "界面实现", "交互开发"],
    parallelResponsibilities: ["页面实现", "交互调试", "前端验收"],
  },
  "backend-developer": {
    name: "后端开发专家 Agent",
    description: "负责服务端接口、业务逻辑和数据访问实现",
    capabilities: ["后端开发", "接口设计", "业务逻辑"],
    parallelResponsibilities: ["接口实现", "业务规则落地", "服务端测试"],
  },
  "operations-architect": {
    name: "运维架构专家 Agent",
    description: "负责运行保障、可观测性和运维体系设计",
    capabilities: ["运维", "可观测性", "架构设计"],
    parallelResponsibilities: ["监控方案设计", "故障预案", "运行指标梳理"],
  },
};
