/**
 * 房间与游戏状态管理模块
 * Room   — 单个房间的完整生命周期：等待 → 游戏 → 结算
 * RoomManager — 全局房间集合的 CRUD
 */

const { getRandomWord, checkAnswer } = require('./wordbank');
const { calculateGuesserScore, calculateDrawerScore } = require('./scoring');
const WebSocket = require('ws');

/* ================================================
 *  Player
 * ================================================ */
class Player {
  constructor(id, ws, nickname, isOwner) {
    this.id = id;
    this.ws = ws;
    this.nickname = nickname;
    this.isOwner = isOwner;
    this.score = 0;
    this.roundScore = 0;
  }

  toJSON() {
    return {
      id: this.id,
      nickname: this.nickname,
      isOwner: this.isOwner,
      score: this.score
    };
  }
}

/* ================================================
 *  Room
 * ================================================ */
class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.state = 'waiting'; // waiting | playing | round_end
    this.drawerOrder = [];
    this.drawerIdx = -1;
    this.currentWordEntry = null;
    this.roundTimer = null;
    this.timeLeft = 60;
    this.correctGuessers = new Set();
    this.usedWords = [];
    this.round = 0;
  }

  get totalRounds() { return this.drawerOrder.length; }

  get currentDrawerId() {
    return (this.drawerIdx >= 0 && this.drawerIdx < this.drawerOrder.length)
      ? this.drawerOrder[this.drawerIdx] : null;
  }

  get currentDrawer() { return this.players.get(this.currentDrawerId); }

  /* ---------- 玩家管理 ---------- */
  addPlayer(player) { this.players.set(player.id, player); }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;
    this.players.delete(playerId);

    // 当前画家退出 → 结束本轮
    if (this.state === 'playing' && this.currentDrawerId === playerId) {
      this._endRound();
    }

    this.drawerOrder = this.drawerOrder.filter(id => id !== playerId);
    if (this.drawerIdx >= this.drawerOrder.length) this.drawerIdx = 0;

    if (this.players.size === 0) {
      this._cleanup();
      return { empty: true, player };
    }

    let newOwner = null;
    if (player.isOwner) {
      const next = this.players.values().next().value;
      if (next) { next.isOwner = true; newOwner = next.id; }
    }

    if (this.state === 'playing' && this.players.size < 2) {
      this._endGame();
    }

    return { empty: false, player, newOwner };
  }

  /* ---------- 游戏流程 ---------- */
  startGame() {
    if (this.players.size < 2) return { error: '至少需要 2 名玩家' };
    for (const p of this.players.values()) { p.score = 0; p.roundScore = 0; }
    this.drawerOrder = shuffle([...this.players.keys()]);
    this.drawerIdx = -1;
    this.round = 0;
    this.usedWords = [];
    this.state = 'playing';
    return { success: true };
  }

  nextRound() {
    this.drawerIdx++;
    this.round++;

    // 跳过已退出的玩家
    while (this.drawerIdx < this.drawerOrder.length &&
           !this.players.has(this.drawerOrder[this.drawerIdx])) {
      this.drawerIdx++;
      this.round++;
    }

    if (this.drawerIdx >= this.drawerOrder.length) {
      this._endGame();
      return null;
    }

    const entry = getRandomWord(this.usedWords);
    this.currentWordEntry = entry;
    this.usedWords.push(entry.word);
    this.correctGuessers = new Set();
    this.timeLeft = 60;
    for (const p of this.players.values()) p.roundScore = 0;

    this._startTimer();

    return {
      drawer: this.currentDrawerId,
      drawerName: this.currentDrawer.nickname,
      word: entry.word,
      wordHint: genHint(entry.word),
      category: entry.category,
      round: this.round,
      totalRounds: this.totalRounds
    };
  }

  handleGuess(playerId, text) {
    if (this.state !== 'playing') return null;
    if (playerId === this.currentDrawerId) return null; // 画家不能猜
    if (this.correctGuessers.has(playerId)) return null; // 已猜对

    const correct = checkAnswer(text, this.currentWordEntry);
    const player = this.players.get(playerId);
    if (!player) return null;

    if (correct) {
      this.correctGuessers.add(playerId);
      const order = this.correctGuessers.size;
      const total = this.players.size - 1;
      const score = calculateGuesserScore(this.timeLeft, order, total);
      player.roundScore = score;
      player.score += score;

      // 全部猜对 → 短暂延迟后结束
      if (this.correctGuessers.size >= total) {
        setTimeout(() => {
          if (this.state === 'playing') this._endRound();
        }, 1000);
      }
    }

    return { correct, text, playerId, nickname: player.nickname };
  }

  /* ---------- 回合 / 游戏结束 ---------- */
  _endRound() {
    this._clearTimer();

    const drawer = this.currentDrawer;
    if (drawer) {
      const total = Math.max(1, this.players.size - 1);
      drawer.roundScore = calculateDrawerScore(this.correctGuessers.size, total);
      drawer.score += drawer.roundScore;
    }

    const scores = [...this.players.values()]
      .map(p => ({ id: p.id, nickname: p.nickname, roundScore: p.roundScore, score: p.score }))
      .sort((a, b) => b.score - a.score);

    this.broadcast({
      type: 'round_end',
      word: this.currentWordEntry ? this.currentWordEntry.word : '',
      scores,
      players: this.playerList()
    });

    this.state = 'round_end';

    // 5 秒后自动进入下一轮
    this._roundEndTimer = setTimeout(() => {
      if (this.state !== 'round_end') return;
      const info = this.nextRound();
      if (info) {
        this.state = 'playing';
        this._broadcastRoundInfo(info);
      }
    }, 5000);
  }

  _endGame() {
    this._clearTimer();
    if (this._roundEndTimer) { clearTimeout(this._roundEndTimer); this._roundEndTimer = null; }
    this.state = 'waiting';

    const players = this.playerList().sort((a, b) => b.score - a.score);
    this.broadcast({
      type: 'game_end',
      players,
      winner: players.length > 0 ? players[0].nickname : ''
    });
  }

  /* ---------- 计时器 ---------- */
  _startTimer() {
    this._clearTimer();
    this.roundTimer = setInterval(() => {
      this.timeLeft--;
      this.broadcast({ type: 'timer', timeLeft: this.timeLeft });
      if (this.timeLeft <= 0) this._endRound();
    }, 1000);
  }

  _clearTimer() {
    if (this.roundTimer) { clearInterval(this.roundTimer); this.roundTimer = null; }
  }

  _cleanup() {
    this._clearTimer();
    if (this._roundEndTimer) { clearTimeout(this._roundEndTimer); this._roundEndTimer = null; }
  }

  /* ---------- 广播 / 发送 ---------- */
  broadcast(msg, excludeId) {
    const raw = JSON.stringify(msg);
    for (const [id, p] of this.players) {
      if (id !== excludeId && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(raw);
      }
    }
  }

  sendTo(playerId, msg) {
    const p = this.players.get(playerId);
    if (p && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(msg));
    }
  }

  _broadcastRoundInfo(info) {
    for (const [pid] of this.players) {
      this.sendTo(pid, {
        type: 'new_round',
        drawer: info.drawer,
        drawerName: info.drawerName,
        word: pid === info.drawer ? info.word : undefined,
        wordHint: info.wordHint,
        category: info.category,
        round: info.round,
        totalRounds: info.totalRounds
      });
    }
  }

  playerList() {
    return [...this.players.values()].map(p => p.toJSON());
  }
}

/* ================================================
 *  RoomManager
 * ================================================ */
class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(ws, nickname) {
    const code = this._genCode();
    const room = new Room(code);
    const pid = this._genId();
    room.addPlayer(new Player(pid, ws, nickname, true));
    this.rooms.set(code, room);
    return { roomCode: code, playerId: pid };
  }

  joinRoom(ws, code, nickname) {
    const room = this.rooms.get(code);
    if (!room) return { error: '房间不存在' };
    if (room.players.size >= 6) return { error: '房间已满（最多 6 人）' };
    if (room.state !== 'waiting') return { error: '游戏已开始，无法加入' };

    const pid = this._genId();
    room.addPlayer(new Player(pid, ws, nickname, false));
    return { playerId: pid, players: room.playerList() };
  }

  removePlayer(code, pid) {
    const room = this.rooms.get(code);
    if (!room) return;
    const result = room.removePlayer(pid);
    if (!result) return;

    if (result.empty) {
      this.rooms.delete(code);
      console.log(`[房间] 房间 ${code} 已销毁（无玩家）`);
      return;
    }

    room.broadcast({
      type: 'player_left',
      playerId: pid,
      nickname: result.player.nickname,
      players: room.playerList(),
      newOwner: result.newOwner || null
    });
  }

  startGame(code, pid) {
    const room = this.rooms.get(code);
    if (!room) return { error: '房间不存在' };
    const p = room.players.get(pid);
    if (!p || !p.isOwner) return { error: '只有房主可以开始游戏' };

    const result = room.startGame();
    if (result.error) return result;

    room.broadcast({ type: 'game_start' });

    setTimeout(() => {
      const info = room.nextRound();
      if (info) {
        room.state = 'playing';
        room._broadcastRoundInfo(info);
      }
    }, 2000);

    return { success: true };
  }

  handleDraw(code, pid, data) {
    const room = this.rooms.get(code);
    if (!room || room.state !== 'playing') return;
    if (room.currentDrawerId !== pid) return;
    room.broadcast({ type: 'draw_data', data }, pid);
  }

  handleClearCanvas(code, pid) {
    const room = this.rooms.get(code);
    if (!room || room.state !== 'playing') return;
    if (room.currentDrawerId !== pid) return;
    room.broadcast({ type: 'canvas_cleared' }, pid);
  }

  handleGuess(code, pid, text) {
    const room = this.rooms.get(code);
    if (!room || room.state !== 'playing') return;

    const result = room.handleGuess(pid, text);
    if (!result) return;

    room.broadcast({
      type: 'guess_broadcast',
      playerId: result.playerId,
      nickname: result.nickname,
      text: result.correct ? '' : result.text,
      correct: result.correct
    });
  }

  getRoomState(code) {
    const room = this.rooms.get(code);
    if (!room) return null;
    return { players: room.playerList() };
  }

  getGameState(code, pid) {
    const room = this.rooms.get(code);
    if (!room) return null;
    const isDrawer = room.currentDrawerId === pid;
    return {
      drawer: room.currentDrawerId,
      drawerName: room.currentDrawer ? room.currentDrawer.nickname : '',
      word: isDrawer && room.currentWordEntry ? room.currentWordEntry.word : undefined,
      wordHint: room.currentWordEntry ? genHint(room.currentWordEntry.word) : '',
      category: room.currentWordEntry ? room.currentWordEntry.category : '',
      timeLeft: room.timeLeft,
      round: room.round,
      totalRounds: room.totalRounds,
      players: room.playerList()
    };
  }

  backToRoom(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    room._clearTimer();
    if (room._roundEndTimer) { clearTimeout(room._roundEndTimer); room._roundEndTimer = null; }
    room.state = 'waiting';
  }

  _genCode() {
    let code;
    do { code = String(1000 + Math.floor(Math.random() * 9000)); }
    while (this.rooms.has(code));
    return code;
  }

  _genId() { return 'p_' + Math.random().toString(36).slice(2, 10); }
}

/* ========== 工具函数 ========== */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function genHint(word) {
  return word.split('').map(() => '＿').join(' ');
}

module.exports = RoomManager;
