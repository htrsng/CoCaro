import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, SkipForward, Info, Copy, Check } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { Board } from './components/Board';
import {
  createEmptyBoard,
  isValidMove,
  checkCaptures,
  calculateScores
} from './logic/gameLogic';
import { BoardState, Player, GameStatus } from './types';

const BOARD_SIZES = [9, 13, 19, 25];

const isPrivateIpv4 = (hostname: string) => {
  if (/^192\.168\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;

  const match = hostname.match(/^172\.(\d{1,3})\./);
  if (!match) return false;

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
};

const normalizeBaseUrl = (baseUrl?: string) => {
  if (!baseUrl) return null;

  try {
    const parsed = new URL(baseUrl);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
};

// Helper to get or create room ID
const getRoomId = () => {
  const hash = window.location.hash.substring(1);
  if (hash) return hash;
  const newHash = Math.random().toString(36).substring(2, 9);
  window.location.hash = newHash;
  return newHash;
};

export default function App() {
  const [roomId] = useState(getRoomId);
  const [boardSize, setBoardSize] = useState(13);
  const [board, setBoard] = useState<BoardState>(createEmptyBoard(boardSize));
  const [status, setStatus] = useState<GameStatus>({
    currentPlayer: 'X',
    isGameOver: false,
    winner: null,
    extraTurn: false,
    scores: { X: 0, O: 0 },
    lastMove: null,
    enclosures: [],
  });
  const [passCount, setPassCount] = useState(0);
  const [history, setHistory] = useState<BoardState[]>([]);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [takenSlots, setTakenSlots] = useState<{ X: boolean; O: boolean }>({ X: false, O: false });
  const [roleError, setRoleError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState(window.location.href);
  const [inviteCandidates, setInviteCandidates] = useState<string[]>([]);
  const [isLanOnlyInvite, setIsLanOnlyInvite] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const buildInviteUrl = useCallback((lanIp?: string, port?: number) => {
    const url = new URL(window.location.href);
    const hostname = url.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (isLocalhost && lanIp) {
      url.hostname = lanIp;
      if (port) {
        url.port = String(port);
      }
    }

    url.hash = roomId;
    return url.toString();
  }, [roomId]);

  const buildInviteCandidates = useCallback((lanIps?: string[], port?: number) => {
    const url = new URL(window.location.href);
    const hostname = url.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (!isLocalhost || !lanIps || lanIps.length === 0) {
      return [buildInviteUrl(undefined, port)];
    }

    const links = lanIps.map((lanIp) => buildInviteUrl(lanIp, port));
    return [...new Set(links)];
  }, [buildInviteUrl]);

  const buildInviteFromBaseUrl = useCallback((baseUrl?: string) => {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) return null;

    const url = new URL(normalized);
    url.hash = roomId;
    return url.toString();
  }, [roomId]);

  const syncState = useCallback((newBoard: BoardState, newStatus: GameStatus, newPassCount: number) => {
    if (socketRef.current && myPlayer) {
      socketRef.current.emit('update-game', {
        roomId,
        player: myPlayer,
        state: { board: newBoard, status: newStatus, passCount: newPassCount, boardSize }
      });
    }
  }, [roomId, boardSize, myPlayer]);

  useEffect(() => {
    socketRef.current = io();
    const socket = socketRef.current;

    socket.emit('join-room', roomId);

    socket.on('game-state', (state) => {
      setBoard(state.board);
      setStatus(state.status);
      setPassCount(state.passCount);
      setBoardSize(state.boardSize);
    });

    socket.on('game-reset', () => {
      resetGameLocal();
    });

    socket.on('role-assigned', (player: Player) => {
      setMyPlayer(player);
      setRoleError(null);
    });

    socket.on('player-slots', (slots: { X: boolean; O: boolean }) => {
      setTakenSlots(slots);
    });

    socket.on('role-error', (message: string) => {
      setRoleError(message);
    });

    socket.on('move-rejected', (message: string) => {
      setRoleError(message);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    let isCancelled = false;

    const loadInviteUrl = async () => {
      try {
        const response = await fetch('/api/server-info');
        if (!response.ok) {
          throw new Error('Unable to load server info');
        }

        const data: { lanIps?: string[]; port?: number; publicBaseUrl?: string } = await response.json();
        const lanCandidates = buildInviteCandidates(data.lanIps, data.port);
        const publicInvite = buildInviteFromBaseUrl(data.publicBaseUrl);
        const candidates = publicInvite
          ? [publicInvite]
          : lanCandidates;
        const nextUrl = candidates[0] ?? buildInviteUrl(undefined, data.port);

        const nextHost = new URL(nextUrl).hostname;

        if (!isCancelled) {
          setInviteCandidates(candidates);
          setInviteUrl(nextUrl);
          setIsLanOnlyInvite(isPrivateIpv4(nextHost));
        }
      } catch {
        if (!isCancelled) {
          const fallback = buildInviteUrl();
          setInviteCandidates([fallback]);
          setInviteUrl(fallback);

          const fallbackHost = new URL(fallback).hostname;
          setIsLanOnlyInvite(isPrivateIpv4(fallbackHost));
        }
      }
    };

    loadInviteUrl();

    return () => {
      isCancelled = true;
    };
  }, [buildInviteCandidates, buildInviteUrl, buildInviteFromBaseUrl]);

  const resetGameLocal = useCallback(() => {
    const newBoard = createEmptyBoard(boardSize);
    setBoard(newBoard);
    setStatus({
      currentPlayer: 'X',
      isGameOver: false,
      winner: null,
      extraTurn: false,
      scores: { X: 0, O: 0 },
      lastMove: null,
      enclosures: [],
    });
    setPassCount(0);
    setHistory([newBoard]);
  }, [boardSize]);

  const resetGame = () => {
    if (!myPlayer) return;
    resetGameLocal();
    if (socketRef.current) {
      socketRef.current.emit('reset-game', roomId);
    }
  };

  const requestPlayer = (player: Player) => {
    if (!socketRef.current) return;
    socketRef.current.emit('select-player', { roomId, player });
  };

  const handleCellClick = (x: number, y: number) => {
    // Check if it's our turn
    if (!myPlayer || status.currentPlayer !== myPlayer) return;
    if (status.isGameOver || board[y][x] !== null) return;

    const capturedPieces = status.enclosures.flatMap(e => e.capturedPieces);
    if (!isValidMove(board, x, y, status.currentPlayer, capturedPieces)) return;

    const newBoard = board.map(row => [...row]);
    newBoard[y][x] = status.currentPlayer;

    const { captured, boundary } = checkCaptures(newBoard, x, y, status.currentPlayer, capturedPieces);
    const hasCaptured = captured.length > 0;

    let nextEnclosures = [...status.enclosures];
    if (hasCaptured) {
      nextEnclosures.push({
        id: Math.random().toString(36).substr(2, 9),
        player: status.currentPlayer,
        boundary,
        capturedPieces: captured
      });
    }

    const nextScores = calculateScores(newBoard, nextEnclosures);
    const nextStatus: GameStatus = {
      ...status,
      scores: nextScores,
      extraTurn: hasCaptured,
      lastMove: { x, y },
      enclosures: nextEnclosures,
      currentPlayer: hasCaptured ? status.currentPlayer : (status.currentPlayer === 'X' ? 'O' : 'X')
    };

    setBoard(newBoard);
    setStatus(nextStatus);
    setPassCount(0);
    syncState(newBoard, nextStatus, 0);
  };

  const handlePass = () => {
    if (!myPlayer || status.currentPlayer !== myPlayer) return;
    if (status.isGameOver) return;

    const nextPassCount = passCount + 1;
    let nextStatus = { ...status };

    if (nextPassCount >= 2) {
      const finalScores = calculateScores(board, status.enclosures);
      let winner: Player | 'Draw' | null = null;
      if (finalScores.X > finalScores.O) winner = 'X';
      else if (finalScores.O > finalScores.X) winner = 'O';
      else winner = 'Draw';

      nextStatus = {
        ...status,
        isGameOver: true,
        winner,
        scores: finalScores
      };
    } else {
      nextStatus = {
        ...status,
        currentPlayer: status.currentPlayer === 'X' ? 'O' : 'X',
        extraTurn: false
      };
    }

    setPassCount(nextPassCount);
    setStatus(nextStatus);
    syncState(board, nextStatus, nextPassCount);
  };

  const copyWithFallback = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const succeeded = document.execCommand('copy');
    document.body.removeChild(textarea);
    return succeeded;
  };

  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        const copiedByFallback = copyWithFallback(inviteUrl);
        if (!copiedByFallback) {
          throw new Error('Fallback copy failed');
        }
      }

      setCopyError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const copiedByFallback = copyWithFallback(inviteUrl);
      if (copiedByFallback) {
        setCopyError(null);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }

      setCopied(false);
      setCopyError('Copy failed. Please copy the Share link text manually.');
    }
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="hidden md:flex border-b border-[#141414] p-6 xl:p-8 justify-between items-center bg-white/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#141414] flex items-center justify-center rounded-sm">
            <span className="text-[#E4E3E0] font-bold text-xl italic">E</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tighter uppercase italic">Encircle</h1>
            <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Online Multiplayer // Room: {roomId}</p>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={copyLink}
            className="flex items-center gap-2 px-4 py-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors font-mono text-[10px] uppercase tracking-widest"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Invite Friend'}
          </button>
          <button
            onClick={resetGame}
            className="p-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </header>

      <header className="md:hidden border-b border-[#141414] px-3 py-3 flex items-center justify-between bg-white/70 backdrop-blur-sm sticky top-0 z-50">
        <p className="text-[10px] font-mono uppercase tracking-widest opacity-60">Room: {roomId}</p>
        <div className="flex gap-2">
          <button
            onClick={copyLink}
            className="p-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            onClick={resetGame}
            className="p-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto p-2 sm:p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 lg:gap-12">
        {/* Game Board Section */}
        <div className="flex flex-col items-center justify-center space-y-4 lg:space-y-8">
          <p className="hidden md:block text-[10px] font-mono uppercase tracking-widest opacity-50 text-center max-w-xl break-all">
            Share this link: {inviteUrl}
          </p>
          {isLanOnlyInvite && (
            <p className="text-[10px] font-mono uppercase tracking-widest opacity-40 text-center max-w-xl">
              LAN only link: both devices must be on the same Wi-Fi/network
            </p>
          )}
          {inviteCandidates.length > 1 && (
            <p className="text-[10px] font-mono uppercase tracking-widest opacity-40 text-center max-w-xl break-all">
              Backup links: {inviteCandidates.slice(1).join(' | ')}
            </p>
          )}
          {copyError && (
            <p className="text-[10px] font-mono uppercase tracking-widest text-red-600 text-center max-w-xl break-all">
              {copyError}
            </p>
          )}

          {/* Role Selection */}
          {!myPlayer && !status.isGameOver && (
            <div className="bg-white p-4 md:p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] text-center w-full max-w-sm">
              <p className="text-[10px] font-mono uppercase tracking-widest opacity-60 mb-4">Select Your Side</p>
              <div className="flex gap-4">
                <button
                  onClick={() => requestPlayer('X')}
                  disabled={takenSlots.X}
                  className="flex-1 py-3 border border-[#141414] hover:bg-[#141414] hover:text-white transition-colors font-bold disabled:opacity-40"
                >
                  {takenSlots.X ? 'X Taken' : 'Play as X'}
                </button>
                <button
                  onClick={() => requestPlayer('O')}
                  disabled={takenSlots.O}
                  className="flex-1 py-3 border border-[#141414] hover:bg-[#141414] hover:text-white transition-colors font-bold disabled:opacity-40"
                >
                  {takenSlots.O ? 'O Taken' : 'Play as O'}
                </button>
              </div>
              {roleError && (
                <p className="mt-3 text-[10px] font-mono uppercase tracking-widest text-red-600">{roleError}</p>
              )}
              <p className="mt-4 text-[9px] opacity-40 uppercase tracking-tighter italic">Spectating until you select a side</p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {status.isGameOver ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full max-w-md bg-[#141414] text-[#E4E3E0] p-5 md:p-8 border border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,0.2)] text-center"
              >
                <Trophy className="mx-auto mb-4 text-yellow-500" size={48} />
                <h2 className="text-2xl md:text-4xl font-bold italic uppercase mb-2">
                  {status.winner === 'Draw' ? "It's a Draw!" : `${status.winner} Wins!`}
                </h2>
                <p className="font-mono text-sm opacity-60 mb-6">Final Score: X {status.scores.X} - O {status.scores.O}</p>
                <button
                  onClick={resetGame}
                  className="w-full py-3 bg-[#E4E3E0] text-[#141414] font-bold uppercase tracking-widest hover:bg-white transition-colors"
                >
                  New Game
                </button>
              </motion.div>
            ) : (
              <div className="relative">
                <div className="md:hidden mb-2 text-center font-mono text-[10px] uppercase tracking-widest opacity-60">
                  <span className={status.currentPlayer === 'X' ? 'font-bold text-blue-700' : ''}>Player X</span>
                  <span className="mx-2">vs</span>
                  <span className={status.currentPlayer === 'O' ? 'font-bold text-red-600' : ''}>Player O</span>
                  {status.extraTurn && <span className="block mt-1 text-emerald-600 font-bold">Combo! Extra Turn</span>}
                </div>

                <Board
                  board={board}
                  onCellClick={handleCellClick}
                  lastMove={status.lastMove}
                  currentPlayer={status.currentPlayer}
                  enclosures={status.enclosures}
                />

                <div className="hidden md:flex absolute -top-6 left-0 right-0 justify-between px-2 font-mono text-[10px] uppercase tracking-widest opacity-50">
                  <div className="flex items-center gap-2">
                    <span className={status.currentPlayer === 'X' ? 'font-bold text-blue-700' : ''}>Player X</span>
                    <span>vs</span>
                    <span className={status.currentPlayer === 'O' ? 'font-bold text-red-600' : ''}>Player O</span>
                  </div>
                  {status.extraTurn && <span className="text-emerald-600 font-bold">Combo! Extra Turn</span>}
                </div>

                {myPlayer && (
                  <div className="hidden md:block absolute -bottom-6 left-0 right-0 text-center font-mono text-[10px] uppercase tracking-widest opacity-50">
                    You are playing as <span className="font-bold underline">{myPlayer}</span>
                  </div>
                )}

                {myPlayer && (
                  <div className="md:hidden mt-2 text-center font-mono text-[10px] uppercase tracking-widest opacity-50">
                    You are playing as <span className="font-bold underline">{myPlayer}</span>
                  </div>
                )}
              </div>
            )}
          </AnimatePresence>

          <div className="flex gap-4 w-full md:w-auto px-2 md:px-0">
            <button
              onClick={handlePass}
              disabled={!myPlayer || status.currentPlayer !== myPlayer}
              className="w-full md:w-auto justify-center px-6 py-3 md:py-2 border border-[#141414] flex items-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors font-mono text-xs uppercase tracking-widest disabled:opacity-30"
            >
              <SkipForward size={16} /> Pass Turn
            </button>
          </div>
        </div>

        {/* Sidebar Info Section */}
        <aside className="hidden lg:block space-y-8">
          <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
            <h3 className="font-serif italic text-xs uppercase opacity-50 mb-4 border-b border-[#141414]/10 pb-2">Live Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-4 border ${status.currentPlayer === 'X' ? 'border-[#141414] bg-[#141414] text-white' : 'border-[#141414]/10'}`}>
                <p className="text-[10px] font-mono uppercase tracking-widest opacity-60">Player X</p>
                <p className="text-3xl font-bold font-mono">{status.scores.X}</p>
              </div>
              <div className={`p-4 border ${status.currentPlayer === 'O' ? 'border-[#141414] bg-[#141414] text-white' : 'border-[#141414]/10'}`}>
                <p className="text-[10px] font-mono uppercase tracking-widest opacity-60">Player O</p>
                <p className="text-3xl font-bold font-mono">{status.scores.O}</p>
              </div>
            </div>
          </section>

          <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
            <h3 className="font-serif italic text-xs uppercase opacity-50 mb-4 border-b border-[#141414]/10 pb-2 flex items-center gap-2">
              <Info size={14} /> Game Rules & Settings
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest opacity-60 block mb-2">Board Size</label>
                <div className="flex gap-2">
                  {BOARD_SIZES.map(size => (
                    <button
                      key={size}
                      onClick={() => {
                        setBoardSize(size);
                        resetGame();
                      }}
                      className={`flex-1 py-2 text-xs font-mono border border-[#141414] transition-colors ${boardSize === size ? 'bg-[#141414] text-white' : 'hover:bg-[#141414]/5'}`}
                    >
                      {size}x{size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-[11px] leading-relaxed space-y-2 opacity-80">
                <p>• Surround opponent pieces to capture them.</p>
                <p>• <span className="font-bold text-emerald-600">COMBO:</span> Capturing pieces grants an immediate extra turn.</p>
                <p>• Suicide moves are prohibited unless they result in a capture.</p>
                <p>• Game ends when both players pass or board is full.</p>
              </div>
            </div>
          </section>
        </aside>
      </main>

      <footer className="hidden lg:block border-t border-[#141414] p-8 mt-12 bg-white/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[10px] font-mono uppercase tracking-widest opacity-50">© 2026 Encircle Strategy Lab // All Rights Reserved</p>
          <div className="flex gap-8">
            <a href="#" className="text-[10px] font-mono uppercase tracking-widest hover:underline">Documentation</a>
            <a href="#" className="text-[10px] font-mono uppercase tracking-widest hover:underline">Strategy Guide</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
