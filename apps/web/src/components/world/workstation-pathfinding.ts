import {
  WORKSTATION_WORLD_BOUNDS,
  isWorkstationTargetWalkable,
} from "contracts";

export type WorkstationPoint = { x: number; y: number };

export type WorkstationPath = {
  points: WorkstationPoint[];
  target: WorkstationPoint;
  snapped: boolean;
};

const GRID_SIZE = 12;
const ACTOR_PADDING = 12;

type GridNode = WorkstationPoint & {
  column: number;
  row: number;
  key: string;
};

const DIRECTIONS = [
  { column: -1, row: 0, cost: 1 },
  { column: 1, row: 0, cost: 1 },
  { column: 0, row: -1, cost: 1 },
  { column: 0, row: 1, cost: 1 },
  { column: -1, row: -1, cost: Math.SQRT2 },
  { column: 1, row: -1, cost: Math.SQRT2 },
  { column: -1, row: 1, cost: Math.SQRT2 },
  { column: 1, row: 1, cost: Math.SQRT2 },
] as const;

const GRID = buildGrid();
const GRID_BY_KEY = new Map(GRID.map((node) => [node.key, node]));

/** Convert Phaser world coordinates into the shared 960×540 design space. */
export function toCanonicalWorkstationPoint(
  point: WorkstationPoint,
  viewportWidth: number,
  viewportHeight: number,
): WorkstationPoint {
  return {
    x: point.x * (960 / Math.max(1, viewportWidth)),
    y: point.y * (540 / Math.max(1, viewportHeight)),
  };
}

/** Convert a persisted 960×540 position into the current Phaser world space. */
export function fromCanonicalWorkstationPoint(
  point: WorkstationPoint,
  viewportWidth: number,
  viewportHeight: number,
): WorkstationPoint {
  return {
    x: point.x * (viewportWidth / 960),
    y: point.y * (viewportHeight / 540),
  };
}

/**
 * Find a deterministic A* path in canonical workstation coordinates.
 * Invalid clicks (desk, wall, furniture) are snapped to the nearest reachable
 * grid point. The actor radius is already included in the shared collision
 * predicate, so the returned path can be sent directly to the server.
 */
export function findWorkstationPath(
  start: WorkstationPoint,
  requestedTarget: WorkstationPoint,
): WorkstationPath | null {
  const startNode = nearestWalkableNode(start);
  if (!startNode) return null;

  const requestedWalkable = isWorkstationTargetWalkable(
    requestedTarget.x,
    requestedTarget.y,
    ACTOR_PADDING,
  );
  const targetNode = nearestWalkableNode(requestedTarget);
  if (!targetNode) return null;

  const gridPath = runAStar(startNode, targetNode);
  if (gridPath.length === 0) return null;

  const exactTarget = requestedWalkable && segmentIsWalkable(
    targetNode,
    requestedTarget,
  )
    ? requestedTarget
    : { x: targetNode.x, y: targetNode.y };
  const points: WorkstationPoint[] = [
    { x: start.x, y: start.y },
    ...gridPath.map(({ x, y }) => ({ x, y })),
  ];
  const last = points.at(-1);
  if (!last || distance(last, exactTarget) > 0.5) points.push(exactTarget);

  return {
    points: removeCollinearPoints(points),
    target: exactTarget,
    snapped: distance(exactTarget, requestedTarget) > 0.5,
  };
}

function buildGrid() {
  const nodes: GridNode[] = [];
  const minX = WORKSTATION_WORLD_BOUNDS.minX + ACTOR_PADDING;
  const maxX = WORKSTATION_WORLD_BOUNDS.maxX - ACTOR_PADDING;
  const minY = WORKSTATION_WORLD_BOUNDS.minY + ACTOR_PADDING;
  const maxY = WORKSTATION_WORLD_BOUNDS.maxY - ACTOR_PADDING;

  for (let row = 0, y = minY; y <= maxY; row += 1, y += GRID_SIZE) {
    for (let column = 0, x = minX; x <= maxX; column += 1, x += GRID_SIZE) {
      if (!isWorkstationTargetWalkable(x, y, ACTOR_PADDING)) continue;
      nodes.push({ x, y, column, row, key: gridKey(column, row) });
    }
  }
  return nodes;
}

function nearestWalkableNode(point: WorkstationPoint) {
  let best: GridNode | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of GRID) {
    const candidateDistance = distance(point, node);
    if (candidateDistance < bestDistance) {
      best = node;
      bestDistance = candidateDistance;
    }
  }
  return best;
}

function runAStar(start: GridNode, goal: GridNode): GridNode[] {
  const open = new Set([start.key]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[start.key, 0]]);
  const fScore = new Map<string, number>([[start.key, distance(start, goal)]]);

  while (open.size > 0) {
    let currentKey = "";
    let currentScore = Number.POSITIVE_INFINITY;
    for (const key of open) {
      const score = fScore.get(key) ?? Number.POSITIVE_INFINITY;
      if (score < currentScore) {
        currentKey = key;
        currentScore = score;
      }
    }

    const current = GRID_BY_KEY.get(currentKey);
    if (!current) return [];
    if (current.key === goal.key) {
      return reconstructPath(cameFrom, current);
    }
    open.delete(current.key);

    for (const direction of DIRECTIONS) {
      const neighbor = GRID_BY_KEY.get(gridKey(
        current.column + direction.column,
        current.row + direction.row,
      ));
      if (!neighbor || !canTraverseDiagonal(current, direction)) continue;

      const tentative = (gScore.get(current.key) ?? Number.POSITIVE_INFINITY)
        + direction.cost;
      if (tentative >= (gScore.get(neighbor.key) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }
      cameFrom.set(neighbor.key, current.key);
      gScore.set(neighbor.key, tentative);
      fScore.set(neighbor.key, tentative + distance(neighbor, goal) / GRID_SIZE);
      open.add(neighbor.key);
    }
  }

  return [];
}

function canTraverseDiagonal(
  current: GridNode,
  direction: (typeof DIRECTIONS)[number],
) {
  if (direction.column === 0 || direction.row === 0) return true;
  return GRID_BY_KEY.has(gridKey(current.column + direction.column, current.row))
    && GRID_BY_KEY.has(gridKey(current.column, current.row + direction.row));
}

function reconstructPath(cameFrom: Map<string, string>, goal: GridNode) {
  const path = [goal];
  let key = goal.key;
  while (cameFrom.has(key)) {
    key = cameFrom.get(key)!;
    const node = GRID_BY_KEY.get(key);
    if (!node) break;
    path.push(node);
  }
  return path.reverse();
}

function segmentIsWalkable(start: WorkstationPoint, end: WorkstationPoint) {
  const steps = Math.max(1, Math.ceil(distance(start, end) / 3));
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    if (!isWorkstationTargetWalkable(
      start.x + (end.x - start.x) * ratio,
      start.y + (end.y - start.y) * ratio,
      ACTOR_PADDING,
    )) return false;
  }
  return true;
}

function removeCollinearPoints(points: WorkstationPoint[]) {
  if (points.length < 3) return points;
  const result = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = result.at(-1)!;
    const current = points[index];
    const next = points[index + 1];
    const firstDirection = normalizedDirection(previous, current);
    const secondDirection = normalizedDirection(current, next);
    if (firstDirection !== secondDirection) result.push(current);
  }
  result.push(points.at(-1)!);
  return result;
}

function normalizedDirection(from: WorkstationPoint, to: WorkstationPoint) {
  return `${Math.sign(to.x - from.x)},${Math.sign(to.y - from.y)}`;
}

function distance(left: WorkstationPoint, right: WorkstationPoint) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function gridKey(column: number, row: number) {
  return `${column}:${row}`;
}
