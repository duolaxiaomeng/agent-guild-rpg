export type WebsiteLotteryDifficulty = "easy" | "medium" | "hard";

export type WebsiteLotteryBankOption = {
  id: string;
  label: string;
  description: string;
  difficulty: WebsiteLotteryDifficulty;
};

export type WebsiteLotteryBankCategory = {
  id: string;
  label: string;
  description: string;
  options: WebsiteLotteryBankOption[];
};

export const websiteLotteryBankCategories: WebsiteLotteryBankCategory[] = [
  {
    id: "personal-growth",
    label: "个人成长 Agent",
    description: "适合做个人学习、习惯和思考记录类 Agent 网站。",
    options: [
      { id: "learning-habit-site", label: "Agent 学习习惯网站", description: "让 Agent 记录每天的学习节奏、专注时间和完成情况。", difficulty: "easy" },
      { id: "reading-log-site", label: "Agent 读书记录网站", description: "让 Agent 汇总读过的书、摘录内容和阅读进度。", difficulty: "easy" },
      { id: "goal-review-site", label: "Agent 目标复盘网站", description: "让 Agent 按周目标、月目标和复盘记录生成反馈。", difficulty: "medium" },
      { id: "knowledge-card-site", label: "Agent 知识卡片网站", description: "让 Agent 把碎片知识整理成卡片、标签和分类。", difficulty: "medium" }
    ]
  },
  {
    id: "daily-life",
    label: "日常生活 Agent",
    description: "适合做日程、消费和生活管理类 Agent 网站。",
    options: [
      { id: "schedule-site", label: "Agent 生活日程网站", description: "让 Agent 统一整理日程安排、提醒和待办任务。", difficulty: "easy" },
      { id: "expense-site", label: "Agent 消费记账网站", description: "让 Agent 记录日常支出、分类统计和预算管理。", difficulty: "easy" },
      { id: "todo-site", label: "Agent 待办清单网站", description: "让 Agent 帮你添加、勾选、分类和排序待办事项。", difficulty: "easy" },
      { id: "storage-site", label: "Agent 物品收纳网站", description: "让 Agent 记录物品位置、分类和收纳状态。", difficulty: "medium" }
    ]
  },
  {
    id: "health",
    label: "健康状态 Agent",
    description: "适合做运动、睡眠和情绪记录类 Agent 网站。",
    options: [
      { id: "exercise-site", label: "Agent 运动打卡网站", description: "让 Agent 记录运动项目、次数、时长和打卡情况。", difficulty: "easy" },
      { id: "sleep-site", label: "Agent 睡眠记录网站", description: "让 Agent 整理睡眠时间、睡眠质量和作息规律。", difficulty: "easy" },
      { id: "water-site", label: "Agent 饮水提醒网站", description: "让 Agent 提醒饮水次数、时间和完成状态。", difficulty: "easy" },
      { id: "mood-site", label: "Agent 情绪记录网站", description: "让 Agent 记录每天心情变化和简单原因说明。", difficulty: "easy" }
    ]
  },
  {
    id: "hobby",
    label: "兴趣爱好 Agent",
    description: "适合做收藏、展示和兴趣整理类 Agent 网站。",
    options: [
      { id: "movie-site", label: "Agent 电影收藏网站", description: "让 Agent 记录想看、在看、看过的电影列表。", difficulty: "easy" },
      { id: "music-site", label: "Agent 音乐记录网站", description: "让 Agent 整理喜欢的歌单、歌手和播放记录。", difficulty: "easy" },
      { id: "game-site", label: "Agent 游戏档案网站", description: "让 Agent 记录游戏角色、成就和游玩进度。", difficulty: "easy" },
      { id: "journal-site", label: "Agent 手账展示网站", description: "让 Agent 展示手账照片、排版和记录主题。", difficulty: "easy" }
    ]
  },
  {
    id: "creation",
    label: "个人创作 Agent",
    description: "适合做内容创作、素材整理和作品展示类 Agent 网站。",
    options: [
      { id: "inspiration-site", label: "Agent 灵感收集网站", description: "让 Agent 收集灵感、参考图和临时想法。", difficulty: "medium" },
      { id: "portfolio-site", label: "Agent 图文作品集网站", description: "让 Agent 展示图片、文章、设计稿或项目成果。", difficulty: "medium" },
      { id: "article-site", label: "Agent 文章发布网站", description: "让 Agent 支持文章列表、详情页和分类标签。", difficulty: "medium" },
      { id: "asset-site", label: "Agent 素材整理网站", description: "让 Agent 管理图片、字体、图标和素材分类。", difficulty: "medium" }
    ]
  },
  {
    id: "efficiency",
    label: "自由工作与效率 Agent",
    description: "适合做任务、项目和时间管理类 Agent 网站。",
    options: [
      { id: "task-site", label: "Agent 任务管理网站", description: "让 Agent 支持任务添加、状态更新和优先级管理。", difficulty: "medium" },
      { id: "project-site", label: "Agent 项目进度网站", description: "让 Agent 展示阶段、里程碑和当前进展。", difficulty: "medium" },
      { id: "time-site", label: "Agent 时间规划网站", description: "让 Agent 记录每日时间块和专注安排。", difficulty: "medium" },
      { id: "meeting-site", label: "Agent 会议记录网站", description: "让 Agent 整理会议纪要、待办和结论。", difficulty: "medium" }
    ]
  },
  {
    id: "community",
    label: "社区与轻社交 Agent",
    description: "适合做活动、互助和轻社交类 Agent 网站。",
    options: [
      { id: "class-event-site", label: "Agent 班级活动网站", description: "让 Agent 展示活动通知、报名和安排信息。", difficulty: "easy" },
      { id: "neighbor-site", label: "Agent 邻里互助网站", description: "让 Agent 发布求助、帮助和生活交流信息。", difficulty: "medium" },
      { id: "interest-group-site", label: "Agent 兴趣小组网站", description: "让 Agent 围绕活动、成员和讨论组织内容。", difficulty: "medium" },
      { id: "resource-share-site", label: "Agent 资源分享网站", description: "让 Agent 整理可分享资源、标签和下载入口。", difficulty: "easy" }
    ]
  },
  {
    id: "family",
    label: "家庭与关系 Agent",
    description: "适合做家庭事务、纪念提醒和联系管理类 Agent 网站。",
    options: [
      { id: "family-schedule-site", label: "Agent 家庭日程网站", description: "让 Agent 管理家庭成员共同的日程安排。", difficulty: "easy" },
      { id: "anniversary-site", label: "Agent 纪念日提醒网站", description: "让 Agent 记录生日、纪念日和重要日期提醒。", difficulty: "easy" },
      { id: "family-ledger-site", label: "Agent 家庭账本网站", description: "让 Agent 记录家庭共同支出和分类统计。", difficulty: "medium" },
      { id: "contacts-site", label: "Agent 亲友联系网站", description: "让 Agent 整理联系人、备注和联系频率。", difficulty: "medium" }
    ]
  },
  {
    id: "organization",
    label: "工具与信息整理 Agent",
    description: "适合做收集、分类、导航和检索类 Agent 网站。",
    options: [
      { id: "bookmark-site", label: "Agent 收藏夹整理网站", description: "让 Agent 按主题整理收藏链接和常用入口。", difficulty: "easy" },
      { id: "archive-site", label: "Agent 文件归档网站", description: "让 Agent 记录文件分类、状态和归档位置。", difficulty: "medium" },
      { id: "nav-site", label: "Agent 网址导航网站", description: "让 Agent 把常用网站按功能分组展示。", difficulty: "easy" },
      { id: "qa-site", label: "Agent 问题问答网站", description: "让 Agent 整理常见问题、答案和分类检索。", difficulty: "medium" }
    ]
  },
  {
    id: "campus",
    label: "校园与学习生活 Agent",
    description: "适合做作业、课程、小组协作类 Agent 网站。",
    options: [
      { id: "homework-site", label: "Agent 作业记录网站", description: "让 Agent 记录作业内容、提交状态和截止时间。", difficulty: "easy" },
      { id: "notes-site", label: "Agent 课程笔记网站", description: "让 Agent 按课程和章节整理学习笔记。", difficulty: "easy" },
      { id: "review-plan-site", label: "Agent 复习计划网站", description: "让 Agent 围绕考试、章节和阶段复习来设计。", difficulty: "medium" },
      { id: "group-work-site", label: "Agent 小组协作网站", description: "让 Agent 展示分工、进度和协作记录。", difficulty: "medium" }
    ]
  },
  {
    id: "social-content",
    label: "抖音小红书 Agent 项目",
    description: "适合个人做抖音、小红书内容规划与辅助生成类网站，不直接依赖平台接口。",
    options: [
      { id: "short-video-topic-site", label: "Agent 短视频选题网站", description: "让 Agent 根据关键词、热点和个人定位生成选题池。", difficulty: "hard" },
      { id: "xhs-note-site", label: "Agent 小红书笔记网站", description: "让 Agent 生成标题、封面文案、正文结构和标签建议。", difficulty: "hard" },
      { id: "script-breakdown-site", label: "Agent 视频脚本拆解网站", description: "让 Agent 把一个创意拆成开场、节奏和镜头提示。", difficulty: "hard" },
      { id: "content-calendar-site", label: "Agent 内容排期网站", description: "让 Agent 管理选题、发布时间和发布节奏。", difficulty: "hard" }
    ]
  }
];
