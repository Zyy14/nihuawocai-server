/**
 * 你画我猜 — WebSocket 服务端入口
 *
 * 本地开发：node server.js（默认 3000）
 * 线上部署：Render / Railway 等 PaaS 会注入 PORT 环境变量
 *
 * 架构：HTTP Server（健康检查）+ WebSocket Server（游戏通信）共用同一端口
 */

const http = require('http');
const WebSocket = require('ws');
const RoomManager = require('./room');

const PORT = Number(process.env.PORT) || 3000;
const HEARTBEAT_INTERVAL = 30000; // 30 秒心跳，防止云平台断开空闲连接
const rm = new RoomManager();

/* ========== HTTP 服务（健康检查 + 默认响应） ========== */
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      rooms: rm.rooms.size,
      uptime: Math.floor(process.uptime())
    }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('你画我猜 WebSocket 服务运行中');
});

/* ========== WebSocket 服务 ========== */
const wss = new WebSocket.Server({ server: httpServer });

/** connId → { roomCode, playerId } */
const connections = new Map();
let connSeq = 0;

/* --- 心跳检测：清除无响应的死连接 --- */
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws._isAlive === false) return ws.terminate();
    ws._isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => clearInterval(heartbeat));

wss.on('connection', (ws) => {
  ws._isAlive = true;
  ws.on('pong', () => { ws._isAlive = true; });

  const connId = `c_${++connSeq}`;
  console.log(`[连接] 新连接 ${connId}，当前在线 ${wss.clients.size}`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) {
      return send(ws, { type: 'error_msg', message: '消息格式错误' });
    }
    handleMessage(ws, connId, msg);
  });

  ws.on('close', () => {
    console.log(`[断开] ${connId}`);
    const info = connections.get(connId);
    if (info) {
      rm.removePlayer(info.roomCode, info.playerId);
      connections.delete(connId);
    }
  });

  ws.on('error', (err) => console.error(`[错误] ${connId}`, err.message));
});

/* ========================================
 *  消息路由
 * ======================================== */
function handleMessage(ws, connId, msg) {
  switch (msg.type) {

    /* ---------- 房间 ---------- */
    case 'create_room': {
      const nick = (msg.nickname || '').trim();
      if (!nick) return send(ws, { type: 'error_msg', message: '昵称不能为空' });
      const res = rm.createRoom(ws, nick);
      connections.set(connId, { roomCode: res.roomCode, playerId: res.playerId });
      send(ws, { type: 'room_created', roomCode: res.roomCode, playerId: res.playerId });
      console.log(`[房间] 创建 ${res.roomCode}，房主: ${nick}`);
      break;
    }

    case 'join_room': {
      const nick = (msg.nickname || '').trim();
      const code = msg.roomCode;
      if (!nick) return send(ws, { type: 'error_msg', message: '昵称不能为空' });
      if (!code) return send(ws, { type: 'error_msg', message: '房间号不能为空' });

      const res = rm.joinRoom(ws, code, nick);
      if (res.error) return send(ws, { type: 'error_msg', message: res.error });

      connections.set(connId, { roomCode: code, playerId: res.playerId });
      send(ws, { type: 'room_joined', roomCode: code, playerId: res.playerId, players: res.players });

      // 通知房间内其他玩家
      const room = rm.rooms.get(code);
      if (room) {
        room.broadcast({
          type: 'player_joined',
          player: { id: res.playerId, nickname: nick },
          players: room.playerList()
        }, res.playerId);
      }
      console.log(`[房间] ${nick} 加入 ${code}`);
      break;
    }

    case 'leave_room': {
      const info = connections.get(connId);
      if (!info) return;
      rm.removePlayer(info.roomCode, info.playerId);
      connections.delete(connId);
      console.log(`[房间] 玩家离开 ${info.roomCode}`);
      break;
    }

    /* ---------- 游戏 ---------- */
    case 'start_game': {
      const info = connections.get(connId);
      if (!info) return;
      const res = rm.startGame(info.roomCode, info.playerId);
      if (res.error) return send(ws, { type: 'error_msg', message: res.error });
      console.log(`[游戏] ${info.roomCode} 游戏开始`);
      break;
    }

    case 'draw': {
      const info = connections.get(connId);
      if (!info) return;
      rm.handleDraw(info.roomCode, info.playerId, msg.data);
      break;
    }

    case 'clear_canvas': {
      const info = connections.get(connId);
      if (!info) return;
      rm.handleClearCanvas(info.roomCode, info.playerId);
      break;
    }

    case 'guess': {
      const info = connections.get(connId);
      if (!info) return;
      rm.handleGuess(info.roomCode, info.playerId, msg.text || '');
      break;
    }

    case 'back_to_room': {
      const info = connections.get(connId);
      if (!info) return;
      rm.backToRoom(info.roomCode);
      break;
    }

    /* ---------- 状态查询 ---------- */
    case 'get_room_state': {
      const info = connections.get(connId);
      if (!info) return;
      const state = rm.getRoomState(info.roomCode);
      if (state) send(ws, { type: 'room_state', ...state });
      break;
    }

    case 'get_game_state': {
      const info = connections.get(connId);
      if (!info) return;
      const state = rm.getGameState(info.roomCode, info.playerId);
      if (state) send(ws, { type: 'game_state', ...state });
      break;
    }

    default:
      send(ws, { type: 'error_msg', message: '未知消息类型: ' + msg.type });
  }
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

/* ========== 启动 ========== */
httpServer.listen(PORT, () => {
  console.log('==========================================');
  console.log('  你画我猜 WebSocket 服务已启动');
  console.log(`  端口: ${PORT}`);
  console.log(`  本地: ws://localhost:${PORT}`);
  console.log(`  健康检查: http://localhost:${PORT}/health`);
  console.log('==========================================');
});
