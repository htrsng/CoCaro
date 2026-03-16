import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

type Player = "X" | "O";
type RoomPlayers = {
  X: string | null;
  O: string | null;
};

type GameState = {
  board: any;
  status: any;
  passCount: number;
  boardSize: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  const normalizePublicBaseUrl = (url?: string | null) => {
    if (!url) return null;

    try {
      const parsed = new URL(url);
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return null;
    }
  };

  const configuredPublicBaseUrl = normalizePublicBaseUrl(process.env.PUBLIC_BASE_URL);

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const preferredPort = Number(process.env.PORT) || 3000;
  let activePort = preferredPort;

  const getLanIps = () => {
    const interfaces = os.networkInterfaces();
    const virtualAdapterPattern = /(vEthernet|hyper-v|virtual|vmware|vbox|docker|loopback|wsl|tailscale|zerotier)/i;
    const physicalIps: string[] = [];
    const fallbackIps: string[] = [];

    const rankIp = (ip: string) => {
      if (ip.startsWith("192.168.")) return 0;
      if (ip.startsWith("10.")) return 1;

      const secondOctet = Number(ip.split(".")[1]);
      if (ip.startsWith("172.") && secondOctet >= 16 && secondOctet <= 31) return 2;

      return 3;
    };

    const dedupeAndSort = (list: string[]) => {
      return [...new Set(list)].sort((a, b) => rankIp(a) - rankIp(b));
    };

    for (const [adapterName, network] of Object.entries(interfaces)) {
      if (!network) continue;
      for (const address of network) {
        if (address.family === "IPv4" && !address.internal) {
          fallbackIps.push(address.address);

          if (!virtualAdapterPattern.test(adapterName)) {
            physicalIps.push(address.address);
          }
        }
      }
    }

    const prioritized = dedupeAndSort(physicalIps);
    if (prioritized.length > 0) {
      return prioritized;
    }

    return dedupeAndSort(fallbackIps);
  };

  app.get("/api/server-info", (_req, res) => {
    res.json({
      port: activePort,
      lanIps: getLanIps(),
      publicBaseUrl: configuredPublicBaseUrl,
    });
  });

  // Game state storage
  const games = new Map<string, GameState>();
  const roomPlayers = new Map<string, RoomPlayers>();

  const getOrCreateRoomPlayers = (roomId: string) => {
    if (!roomPlayers.has(roomId)) {
      roomPlayers.set(roomId, { X: null, O: null });
    }

    return roomPlayers.get(roomId)!;
  };

  const getAssignedPlayer = (players: RoomPlayers, socketId: string): Player | null => {
    if (players.X === socketId) return "X";
    if (players.O === socketId) return "O";
    return null;
  };

  const isSocketStillInRoom = (roomId: string, socketId: string) => {
    const connectedSocket = io.sockets.sockets.get(socketId);
    return Boolean(connectedSocket && connectedSocket.rooms.has(roomId));
  };

  const normalizeRoomPlayers = (roomId: string) => {
    const players = getOrCreateRoomPlayers(roomId);

    if (players.X && !isSocketStillInRoom(roomId, players.X)) {
      players.X = null;
    }

    if (players.O && !isSocketStillInRoom(roomId, players.O)) {
      players.O = null;
    }

    return players;
  };

  const emitRoomSlots = (roomId: string) => {
    const players = normalizeRoomPlayers(roomId);
    io.to(roomId).emit("player-slots", {
      X: Boolean(players.X),
      O: Boolean(players.O),
    });
  };

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);

      normalizeRoomPlayers(roomId);
      emitRoomSlots(roomId);

      // Send current state if exists
      if (games.has(roomId)) {
        socket.emit("game-state", games.get(roomId));
      }
    });

    socket.on("select-player", ({ roomId, player }: { roomId: string; player: Player }) => {
      if (player !== "X" && player !== "O") {
        socket.emit("role-error", "Lựa chọn vai không hợp lệ");
        return;
      }

      const players = normalizeRoomPlayers(roomId);
      const currentRole = getAssignedPlayer(players, socket.id);

      if (currentRole && currentRole !== player) {
        socket.emit("role-error", "Bạn đã khóa vai trước đó");
        socket.emit("role-assigned", currentRole);
        return;
      }

      const slotOwner = players[player];
      if (slotOwner && slotOwner !== socket.id) {
        socket.emit("role-error", `Vai ${player} đã có người chọn`);
        return;
      }

      players[player] = socket.id;
      socket.emit("role-assigned", player);
      emitRoomSlots(roomId);
    });

    socket.on("update-game", ({ roomId, state, player }: { roomId: string; state: GameState; player: Player }) => {
      const players = normalizeRoomPlayers(roomId);
      const assigned = getAssignedPlayer(players, socket.id);
      if (!assigned || assigned !== player) {
        socket.emit("move-rejected", "Bạn không có quyền đánh cho vai này");
        return;
      }

      const currentState = games.get(roomId);
      const expectedPlayer: Player = currentState?.status?.currentPlayer ?? "X";
      if (player !== expectedPlayer) {
        socket.emit("move-rejected", "Chưa đến lượt của bạn");
        return;
      }

      games.set(roomId, state);
      socket.to(roomId).emit("game-state", state);
    });

    socket.on("reset-game", (payload: string | { roomId: string; state?: GameState }) => {
      const roomId = typeof payload === "string" ? payload : payload.roomId;
      if (!roomId) {
        socket.emit("move-rejected", "Mã phòng không hợp lệ");
        return;
      }

      const players = normalizeRoomPlayers(roomId);
      const assigned = getAssignedPlayer(players, socket.id);
      if (!assigned) {
        socket.emit("move-rejected", "Người xem không thể bắt đầu ván mới");
        return;
      }

      const nextState = typeof payload === "string" ? undefined : payload.state;

      if (nextState) {
        games.set(roomId, nextState);
        io.to(roomId).emit("game-state", nextState);
        return;
      }

      games.delete(roomId);
      io.to(roomId).emit("game-reset");
    });

    socket.on("surrender-game", ({ roomId, player, state }: { roomId: string; player: Player; state: GameState }) => {
      const players = normalizeRoomPlayers(roomId);
      const assigned = getAssignedPlayer(players, socket.id);
      if (!assigned || assigned !== player) {
        socket.emit("move-rejected", "Bạn không có quyền đầu hàng cho vai này");
        return;
      }

      games.set(roomId, state);
      io.to(roomId).emit("game-state", state);
    });

    socket.on("disconnect", () => {
      for (const [roomId, players] of roomPlayers.entries()) {
        let changed = false;

        if (players.X === socket.id) {
          players.X = null;
          changed = true;
        }

        if (players.O === socket.id) {
          players.O = null;
          changed = true;
        }

        if (changed) {
          emitRoomSlots(roomId);
        }
      }

      console.log("User disconnected:", socket.id);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const listenWithPortRetry = async (startPort: number, maxAttempts = 30) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const port = startPort + attempt;

      const started = await new Promise<boolean>((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException) => {
          if (error.code === "EADDRINUSE") {
            httpServer.off("error", onError);
            resolve(false);
            return;
          }

          reject(error);
        };

        httpServer.once("error", onError);
        httpServer.listen(port, "0.0.0.0", () => {
          httpServer.off("error", onError);
          resolve(true);
        });
      });

      if (started) {
        return port;
      }
    }

    throw new Error(`No available port found from ${startPort} to ${startPort + maxAttempts - 1}`);
  };

  activePort = await listenWithPortRetry(preferredPort);

  const lanIps = getLanIps();
  console.log(`Server running on http://localhost:${activePort}`);
  if (configuredPublicBaseUrl) {
    console.log(`Public URL (env): ${configuredPublicBaseUrl}`);
  }
  if (lanIps.length > 0) {
    console.log(`LAN access: http://${lanIps[0]}:${activePort}`);
  }
}

startServer();
