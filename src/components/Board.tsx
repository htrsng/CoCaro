import React from 'react';
import { motion } from 'motion/react';
import { X, Circle } from 'lucide-react';
import { BoardState, Position, Player, Enclosure } from '../types';

interface BoardProps {
  board: BoardState;
  onCellClick: (x: number, y: number) => void;
  lastMove: Position | null;
  currentPlayer: Player;
  enclosures: Enclosure[];
}

export const Board: React.FC<BoardProps> = ({ board, onCellClick, lastMove, currentPlayer, enclosures }) => {
  const size = board.length;

  // Use percentages for coordinates to ensure perfect alignment regardless of float rounding
  const getPosPercent = (coord: number) => {
    return ((coord + 0.5) / size) * 100;
  };

  return (
    <div
      className="relative w-[min(96vw,980px)] aspect-square p-3 sm:p-5 lg:p-8 xl:p-10 bg-[#fdfdfd] border border-[#d1d5db] shadow-2xl overflow-hidden rounded-sm select-none"
    >
      {/* Notebook Margin Line */}
      <div className="absolute left-3 sm:left-5 lg:left-8 xl:left-10 top-0 bottom-0 w-[1px] bg-red-400/40 z-0" />

      {/* Grid Container */}
      <div className="relative z-10 mx-auto w-full h-full">
        {/* Grid Lines - Using percentages for perfect stability */}
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: size }).map((_, i) => {
            const pos = getPosPercent(i);
            return (
              <React.Fragment key={i}>
                {/* Horizontal Line */}
                <div
                  className="absolute left-0 right-0 h-[1px] bg-blue-300/40"
                  style={{ top: `${pos}%` }}
                />
                {/* Vertical Line */}
                <div
                  className="absolute top-0 bottom-0 w-[1px] bg-blue-300/40"
                  style={{ left: `${pos}%` }}
                />
              </React.Fragment>
            );
          })}
        </div>

        {/* SVG Layer for Enclosures - Using percentage coordinates */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          style={{ overflow: 'visible' }}
        >
          {enclosures.map((enc) => {
            const lines: React.ReactNode[] = [];
            for (let i = 0; i < enc.boundary.length; i++) {
              for (let j = i + 1; j < enc.boundary.length; j++) {
                const p1 = enc.boundary[i];
                const p2 = enc.boundary[j];
                const dx = Math.abs(p1.x - p2.x);
                const dy = Math.abs(p1.y - p2.y);

                // Only connect if they are neighbors
                if (dx <= 1 && dy <= 1 && (dx + dy > 0)) {
                  lines.push(
                    <motion.line
                      key={`${enc.id}-${i}-${j}`}
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      x1={`${getPosPercent(p1.x)}%`}
                      y1={`${getPosPercent(p1.y)}%`}
                      x2={`${getPosPercent(p2.x)}%`}
                      y2={`${getPosPercent(p2.y)}%`}
                      stroke={enc.player === 'X' ? 'rgba(29, 78, 216, 0.7)' : 'rgba(220, 38, 38, 0.7)'}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray="3, 2"
                    />
                  );
                }
              }
            }
            return <g key={enc.id}>{lines}</g>;
          })}
        </svg>

        {/* Interaction Layer */}
        <div
          className="absolute inset-0 grid z-20"
          style={{
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gridTemplateRows: `repeat(${size}, 1fr)`
          }}
        >
          {board.map((row, y) => (
            row.map((cell, x) => {
              const isCaptured = enclosures.some(enc => enc.capturedPieces.some(p => p.x === x && p.y === y));

              return (
                <div
                  key={`${x}-${y}`}
                  className="relative flex items-center justify-center cursor-pointer group"
                  onClick={() => onCellClick(x, y)}
                >
                  {/* Piece - Styled like pen marks */}
                  {cell && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0, rotate: -15 }}
                      animate={{ scale: 1, opacity: isCaptured ? 0.25 : 1, rotate: 0 }}
                      className={`
                        z-30 flex items-center justify-center w-full h-full
                        ${cell === 'X' ? 'text-blue-800' : 'text-red-700'}
                      `}
                    >
                      {cell === 'X' ? (
                        <X size="85%" strokeWidth={3.5} className="drop-shadow-sm" />
                      ) : (
                        <Circle size="75%" strokeWidth={3.5} className="drop-shadow-sm" />
                      )}

                      {/* Last Move Indicator */}
                      {lastMove?.x === x && lastMove?.y === y && (
                        <div className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full shadow-sm ring-1 ring-black/10" />
                      )}
                    </motion.div>
                  )}

                  {/* Hover Preview */}
                  {!cell && (
                    <div className={`
                      absolute inset-0 opacity-0 group-hover:opacity-25 z-10 flex items-center justify-center
                      ${currentPlayer === 'X' ? 'text-blue-800' : 'text-red-700'}
                    `}>
                      {currentPlayer === 'X' ? (
                        <X size="65%" strokeWidth={2.5} />
                      ) : (
                        <Circle size="55%" strokeWidth={2.5} />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ))}
        </div>
      </div>

      {/* Notebook Texture Overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')]" />
    </div>
  );
};
