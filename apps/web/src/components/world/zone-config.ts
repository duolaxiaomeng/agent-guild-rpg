export type ZoneId = "lobby" | "workstations" | "collab-room" | "review-station";

export type OfficeOutfit =
  | "blue-shirt"
  | "green-jacket"
  | "purple-shirt"
  | "orange-jacket"
  | "navy-lead"
  | "teal-staff"
  | "gray-visitor";

export type OfficeArchetype = "maker" | "operator" | "lead" | "staff" | "visitor";

export type NpcDef = {
  id: string;
  name: string;
  x: number;
  y: number;
  tooltip: string;
  color: string;
  pose?: "walking" | "standing" | "talking" | "lounging";
  facing?: "left" | "right" | "up" | "down";
  archetype?: OfficeArchetype;
  outfit?: OfficeOutfit;
};

export type AgentDef = {
  id: string;
  label: string;
  badgeNum: number;
  x: number;
  y: number;
  tooltip: string;
  shirtColor: string;
  hairColor: string;
  statusIcon?: "search" | "warning" | "notify" | "ok";
  seated?: boolean;
  pose?: "typing" | "focus" | "standing" | "walking" | "talking";
  facing?: "left" | "right" | "up" | "down";
  archetype?: OfficeArchetype;
  outfit?: OfficeOutfit;
};

export type ZoneDef = {
  id: ZoneId;
  label: string;
  emoji: string;
  bgColor: string;
  pathColor: string;
  npcs: NpcDef[];
  agents: AgentDef[];
  landmarks: { label: string; x: number; y: number; color: string }[];
  /** Tile indices for floor rendering */
  baseTile: number;
  varTile: number;
  pathTile: number;
  /** Whether to render edge trees (legacy outdoor zones) */
  trees: boolean;
  decorations: { frame: number; x: number; y: number; scaleX?: number; scaleY?: number }[];
  /** Office-specific: work area floor type */
  floorStyle: "gray-tile" | "wood" | "mixed";
};

/* ------------------------------------------------------------------ */
/*  Kenney roguelike-rpg-pack tile indices (spritesheet frame numbers) */
/*  Sheet: 57 cols × 31 rows, 16×16 px, 1px margin/spacing           */
/*  index = row * 57 + col                                            */
/* ------------------------------------------------------------------ */
export const T = {
  // Ground / terrain
  GRASS: 60,
  GRASS_LIGHT: 61,
  GRASS_DARK: 62,
  DIRT: 117,
  DIRT_LIGHT: 118,
  SAND: 114,

  // Stone — used as office gray tile floor
  STONE: 171,
  STONE_ALT: 172,
  COBBLE: 174,

  // Wood — used as warm wood floor
  WOOD: 228,
  WOOD_ALT: 229,

  // Water
  WATER: 286,
  WATER_DARK: 287,

  // Indoor floor — clean office tile
  FLOOR: 342,
  FLOOR_ALT: 343,

  // Path / road — corridor tiles
  ROAD: 399,
  ROAD_ALT: 400,

  // Dark ground
  DARK_GROUND: 456,
  DARK_GROUND_ALT: 457,

  // Decoration sprites (right side of sheet)
  TREE_GREEN: 1719,
  TREE_ORANGE: 1722,
  TREE_DARK: 1725,
  CHEST_BROWN: 1605,
  CHEST_GRAY: 1608,
  DOOR_BROWN: 1735,
  DOOR_GRAY: 1738,
  BARREL: 1548,
  CRATE: 1550,
  BUSH: 1491,
  TORCH: 1035,
  LANTERN: 1092,
  SIGNPOST: 978,
  FENCE: 684,
  BANNER_RED: 513,
  BANNER_BLUE: 515,
} as const;

export const ZONE_DEFS: ZoneDef[] = [
  {
    id: "lobby",
    label: "工作室大厅",
    emoji: "🏢",
    bgColor: "#e5e7eb",
    pathColor: "#d1d5db",
    baseTile: T.STONE,
    varTile: T.STONE_ALT,
    pathTile: T.FLOOR,
    trees: false,
    floorStyle: "mixed",
    decorations: [
      // Potted plants (use bush sprite as plant)
      { frame: T.BUSH, x: 4, y: 4 },
      { frame: T.BUSH, x: 40, y: 4 },
      { frame: T.BUSH, x: 4, y: 25 },
      { frame: T.BUSH, x: 40, y: 25 },
      // Lanterns as ceiling lights
      { frame: T.LANTERN, x: 12, y: 3 },
      { frame: T.LANTERN, x: 32, y: 3 },
      { frame: T.LANTERN, x: 12, y: 26 },
      { frame: T.LANTERN, x: 32, y: 26 },
      // Signpost as studio sign
      { frame: T.SIGNPOST, x: 22, y: 6 },
    ],
    npcs: [
      { id: "receptionist", name: "前台接待", x: 480, y: 200, tooltip: "欢迎来到工作室！", color: "#3b82f6" },
      { id: "manager", name: "管理员", x: 700, y: 320, tooltip: "今日公告已更新", color: "#8b5cf6" },
    ],
    agents: [],
    landmarks: [
      { label: "公告板", x: 200, y: 280, color: "#92400e" },
      { label: "咖啡角", x: 750, y: 180, color: "#78716c" },
    ],
  },
  {
    id: "workstations",
    label: "工位区",
    emoji: "💻",
    bgColor: "#f3f4f6",
    pathColor: "#d1d5db",
    baseTile: T.STONE,
    varTile: T.FLOOR,
    pathTile: T.WOOD,
    trees: false,
    floorStyle: "mixed",
    decorations: [],
    npcs: [
      { id: "walker-a", name: "巡场同事", x: 744, y: 188, tooltip: "去会议角聊一下", color: "#0f766e", pose: "walking", facing: "left", archetype: "staff", outfit: "teal-staff" },
      { id: "walker-b", name: "访客", x: 816, y: 214, tooltip: "刚从休息区路过", color: "#334155", pose: "talking", facing: "left", archetype: "visitor", outfit: "gray-visitor" },
    ],
    agents: [
      {
        id: "browser-agent",
        label: "Browser",
        badgeNum: 1,
        x: 196,
        y: 246,
        tooltip: "正在整理方案...",
        shirtColor: "#3b82f6",
        hairColor: "#92400e",
        statusIcon: "search",
        seated: true,
        pose: "focus",
        facing: "right",
        archetype: "maker",
        outfit: "blue-shirt",
      },
      {
        id: "coding-agent",
        label: "Coder",
        badgeNum: 2,
        x: 332,
        y: 246,
        tooltip: "正在实现界面...",
        shirtColor: "#22c55e",
        hairColor: "#1e293b",
        statusIcon: "ok",
        seated: true,
        pose: "typing",
        facing: "left",
        archetype: "maker",
        outfit: "green-jacket",
      },
      {
        id: "files-agent",
        label: "Files",
        badgeNum: 3,
        x: 196,
        y: 344,
        tooltip: "正在整理文件...",
        shirtColor: "#a855f7",
        hairColor: "#78350f",
        statusIcon: "notify",
        seated: true,
        pose: "focus",
        facing: "right",
        archetype: "operator",
        outfit: "purple-shirt",
      },
      {
        id: "ops-agent",
        label: "Ops",
        badgeNum: 4,
        x: 332,
        y: 344,
        tooltip: "正在关注异常提醒...",
        shirtColor: "#f97316",
        hairColor: "#7c2d12",
        statusIcon: "warning",
        seated: true,
        pose: "typing",
        facing: "left",
        archetype: "operator",
        outfit: "orange-jacket",
      },
      {
        id: "focus-agent",
        label: "Lead",
        badgeNum: 5,
        x: 512,
        y: 426,
        tooltip: "正在协调任务...",
        shirtColor: "#2563eb",
        hairColor: "#6b21a8",
        seated: false,
        pose: "standing",
        facing: "down",
        archetype: "lead",
        outfit: "navy-lead",
      },
    ],
    landmarks: [
      { label: "顶部展示墙", x: 480, y: 72, color: "#475569" },
      { label: "中心工位", x: 480, y: 404, color: "#334155" },
      { label: "休息区", x: 786, y: 402, color: "#78716c" },
    ],
  },
  {
    id: "collab-room",
    label: "协作室",
    emoji: "🤝",
    bgColor: "#fef3c7",
    pathColor: "#fde68a",
    baseTile: T.WOOD,
    varTile: T.WOOD_ALT,
    pathTile: T.FLOOR,
    trees: false,
    floorStyle: "wood",
    decorations: [
      // Plants
      { frame: T.BUSH, x: 5, y: 5 },
      { frame: T.BUSH, x: 39, y: 5 },
      { frame: T.BUSH, x: 5, y: 24 },
      { frame: T.BUSH, x: 39, y: 24 },
      // Lights
      { frame: T.LANTERN, x: 14, y: 3 },
      { frame: T.LANTERN, x: 30, y: 3 },
      { frame: T.LANTERN, x: 14, y: 26 },
      { frame: T.LANTERN, x: 30, y: 26 },
    ],
    npcs: [
      { id: "pm", name: "项目经理", x: 300, y: 200, tooltip: "冲刺任务进行中", color: "#ea580c" },
      { id: "designer", name: "设计师", x: 680, y: 280, tooltip: "原型已更新", color: "#ec4899" },
    ],
    agents: [],
    landmarks: [
      { label: "协作白板", x: 480, y: 120, color: "#f8fafc" },
      { label: "圆桌会议", x: 480, y: 340, color: "#92400e" },
    ],
  },
  {
    id: "review-station",
    label: "评审区",
    emoji: "✅",
    bgColor: "#eff6ff",
    pathColor: "#bfdbfe",
    baseTile: T.STONE,
    varTile: T.STONE_ALT,
    pathTile: T.ROAD_ALT,
    trees: false,
    floorStyle: "gray-tile",
    decorations: [
      // Crates as supply boxes
      { frame: T.CRATE, x: 5, y: 8, scaleX: 2, scaleY: 2 },
      { frame: T.CRATE, x: 39, y: 8, scaleX: 2, scaleY: 2 },
      // Barrels as recycling bins
      { frame: T.BARREL, x: 5, y: 22, scaleX: 2, scaleY: 2 },
      { frame: T.BARREL, x: 39, y: 22, scaleX: 2, scaleY: 2 },
      // Lights
      { frame: T.LANTERN, x: 10, y: 4 },
      { frame: T.LANTERN, x: 34, y: 4 },
      { frame: T.LANTERN, x: 10, y: 25 },
      { frame: T.LANTERN, x: 34, y: 25 },
      // Sign at entrance
      { frame: T.SIGNPOST, x: 22, y: 6 },
    ],
    npcs: [
      { id: "reviewer", name: "评审员", x: 480, y: 180, tooltip: "新提交待审核", color: "#dc2626" },
      { id: "qa", name: "质检员", x: 250, y: 350, tooltip: "测试报告已生成", color: "#0891b2" },
    ],
    agents: [],
    landmarks: [
      { label: "任务看板", x: 480, y: 120, color: "#92400e" },
      { label: "评审工作台", x: 250, y: 300, color: "#64748b" },
    ],
  },
];
