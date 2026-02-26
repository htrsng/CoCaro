export type Player = 'X' | 'O';
export type CellValue = Player | null;
export type BoardState = CellValue[][];

export interface Position {
  x: number;
  y: number;
}

export interface Enclosure {
  id: string;
  player: Player;
  boundary: Position[];
  capturedPieces: Position[];
}

export interface GameStatus {
  currentPlayer: Player;
  isGameOver: boolean;
  winner: Player | 'Draw' | null;
  extraTurn: boolean;
  scores: {
    X: number;
    O: number;
  };
  lastMove: Position | null;
  enclosures: Enclosure[];
}
