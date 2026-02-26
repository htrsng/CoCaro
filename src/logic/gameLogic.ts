import { BoardState, CellValue, Player, Position, Enclosure } from '../types';

export function createEmptyBoard(size: number): BoardState {
  return Array(size).fill(null).map(() => Array(size).fill(null));
}

export function getNeighbors(x: number, y: number, size: number): Position[] {
  const neighbors: Position[] = [];
  if (x > 0) neighbors.push({ x: x - 1, y });
  if (x < size - 1) neighbors.push({ x: x + 1, y });
  if (y > 0) neighbors.push({ x, y: y - 1 });
  if (y < size - 1) neighbors.push({ x, y: y + 1 });
  return neighbors;
}

export function findGroup(
  board: BoardState,
  x: number,
  y: number,
  capturedPositions: Set<string> = new Set()
): { group: Position[], liberties: Position[] } {
  const player = board[y][x];
  if (!player || capturedPositions.has(`${x},${y}`)) return { group: [], liberties: [] };

  const size = board.length;
  const group: Position[] = [];
  const liberties: Set<string> = new Set();
  const visited: Set<string> = new Set();
  const queue: Position[] = [{ x, y }];
  visited.add(`${x},${y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    group.push(current);

    const neighbors = getNeighbors(current.x, current.y, size);
    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;
      if (visited.has(neighborKey)) continue;

      // Captured pieces are considered dead and should behave like empty space
      if (capturedPositions.has(neighborKey)) {
        liberties.add(neighborKey);
        continue;
      }

      const neighborValue = board[neighbor.y][neighbor.x];
      if (neighborValue === player) {
        visited.add(neighborKey);
        queue.push(neighbor);
      } else if (neighborValue === null) {
        liberties.add(neighborKey);
      }
    }
  }

  return {
    group,
    liberties: Array.from(liberties).map(key => {
      const [nx, ny] = key.split(',').map(Number);
      return { x: nx, y: ny };
    })
  };
}

export function checkCaptures(
  board: BoardState,
  lastX: number,
  lastY: number,
  player: Player,
  existingCapturedPieces: Position[]
): { captured: Position[], boundary: Position[] } {
  const size = board.length;
  const opponent = player === 'X' ? 'O' : 'X';
  const neighbors = getNeighbors(lastX, lastY, size);
  const captured: Position[] = [];
  const boundarySet: Set<string> = new Set();

  const capturedPositions = new Set(existingCapturedPieces.map(p => `${p.x},${p.y}`));

  const visitedOpponentGroups = new Set<string>();

  for (const neighbor of neighbors) {
    const neighborKey = `${neighbor.x},${neighbor.y}`;
    const val = board[neighbor.y][neighbor.x];

    // Only check opponent pieces that aren't already captured
    if (val === opponent && !capturedPositions.has(neighborKey)) {
      if (visitedOpponentGroups.has(neighborKey)) continue;

      const { group, liberties } = findGroup(board, neighbor.x, neighbor.y, capturedPositions);

      // Mark all pieces in this group as visited
      group.forEach(p => visitedOpponentGroups.add(`${p.x},${p.y}`));

      if (liberties.length === 0) {
        captured.push(...group);

        // Find boundary: ONLY "alive" pieces of 'player' can form the boundary
        for (const p of group) {
          const pNeighbors = getNeighbors(p.x, p.y, size);
          for (const pn of pNeighbors) {
            const pnKey = `${pn.x},${pn.y}`;
            if (board[pn.y][pn.x] === player && !capturedPositions.has(pnKey)) {
              boundarySet.add(pnKey);
            }
          }
        }
      }
    }
  }

  const boundary = Array.from(boundarySet).map(key => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  });

  return { captured, boundary };
}

export function isSuicide(board: BoardState, x: number, y: number, player: Player, capturedPieces: Position[]): boolean {
  // Temporarily place the piece
  const tempBoard = board.map(row => [...row]);
  tempBoard[y][x] = player;

  const capturedPositions = new Set(capturedPieces.map(p => `${p.x},${p.y}`));

  // Check if it captures anything.
  const { captured } = checkCaptures(tempBoard, x, y, player, capturedPieces);
  if (captured.length > 0) return false;

  // If no captures, check if the group has liberties
  const { liberties } = findGroup(tempBoard, x, y, capturedPositions);
  return liberties.length === 0;
}

export function isValidMove(board: BoardState, x: number, y: number, player: Player, capturedPieces: Position[]): boolean {
  if (x < 0 || x >= board.length || y < 0 || y >= board.length) return false;
  if (board[y][x] !== null) return false;
  if (isSuicide(board, x, y, player, capturedPieces)) return false;
  return true;
}

export function calculateScores(board: BoardState, enclosures: Enclosure[]): { X: number, O: number } {
  let X = 0;
  let O = 0;

  const capturedPositions = new Set(enclosures.flatMap(e => e.capturedPieces.map(p => `${p.x},${p.y}`)));

  // Count pieces on board that are NOT captured
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < board[y].length; x++) {
      if (board[y][x] === null) continue;
      if (capturedPositions.has(`${x},${y}`)) continue;

      if (board[y][x] === 'X') X++;
      if (board[y][x] === 'O') O++;
    }
  }

  // Add captured pieces to the capturer's score
  for (const enc of enclosures) {
    if (enc.player === 'X') X += enc.capturedPieces.length;
    if (enc.player === 'O') O += enc.capturedPieces.length;
  }

  return { X, O };
}
