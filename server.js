// server.js
// Fase 2: sistem party (Buat Party / Join Party pakai kode) + host-authoritative sync
// buat enemy/HP (host yang jalanin logic musuh, guest cuma nerima & lapor pukulan).
//
// Cara jalanin di komputer sendiri:
//   cd server
//   npm install
//   npm start
// Defaultnya jalan di http://localhost:3001

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.get('/', (req, res) => {
  res.send('Canvas Game MP Server jalan. Rooms aktif: ' + rooms.size);
});

// --- State di memory doang (ilang kalau server restart, gapapa buat co-op casual) ---
const rooms = new Map();      // roomCode -> Map<socketId, playerState>
const roomHosts = new Map();  // roomCode -> socketId (host = sumber kebenaran wave/enemy)

function getRoom(roomCode) {
  if (!rooms.has(roomCode)) rooms.set(roomCode, new Map());
  return rooms.get(roomCode);
}

function generateRoomCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  console.log('[connect]', socket.id);

  let currentRoom = null;

  function makePlayerState(name, raceId, x, y) {
    return {
      name: name || 'Player',
      raceId: raceId || 'human',
      x: x || 0,
      y: y || 0,
      direction: 'down',
      moving: false
    };
  }

  socket.on('createParty', ({ name, raceId, x, y }) => {
    const roomCode = generateRoomCode();
    currentRoom = roomCode;
    socket.join(currentRoom);

    const room = getRoom(currentRoom);
    room.set(socket.id, makePlayerState(name, raceId, x, y));
    roomHosts.set(currentRoom, socket.id);

    socket.emit('partyCreated', { roomCode });
    socket.emit('hostInfo', { hostId: socket.id });

    console.log(`[party] ${socket.id} bikin party "${roomCode}" (host)`);
  });

  socket.on('joinParty', ({ roomCode, name, raceId, x, y }) => {
    if (!roomCode || !rooms.has(roomCode)) {
      socket.emit('joinError', { message: 'Kode party gak ketemu. Cek lagi kodenya ya.' });
      return;
    }

    currentRoom = roomCode;
    socket.join(currentRoom);

    const room = getRoom(currentRoom);
    const existingPlayers = Array.from(room.entries()).map(([id, p]) => ({ id, ...p }));
    socket.emit('currentPlayers', existingPlayers);

    const playerState = makePlayerState(name, raceId, x, y);
    room.set(socket.id, playerState);

    socket.to(currentRoom).emit('newPlayer', { id: socket.id, ...playerState });
    socket.emit('hostInfo', { hostId: roomHosts.get(currentRoom) });

    console.log(`[join] ${socket.id} -> party "${currentRoom}" (total ${room.size} pemain)`);
  });

  socket.on('move', (data) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    const p = room.get(socket.id);
    if (!p) return;

    p.x = data.x;
    p.y = data.y;
    p.direction = data.direction;
    p.moving = data.moving;

    socket.to(currentRoom).emit('playerMoved', { id: socket.id, ...p });
  });

  // HOST kirim snapshot semua musuh -> diterusin ke guest doang
  socket.on('enemyState', (enemies) => {
    if (!currentRoom) return;
    if (roomHosts.get(currentRoom) !== socket.id) return;
    socket.to(currentRoom).emit('enemyState', enemies);
  });

  // Guest lapor "saya mukul musuh ini" -> diterusin KHUSUS ke host
  socket.on('attackEnemy', (payload) => {
    if (!currentRoom) return;
    const hostId = roomHosts.get(currentRoom);
    if (!hostId || hostId === socket.id) return;
    io.to(hostId).emit('attackEnemy', { ...payload, from: socket.id });
  });

  // HOST kasih tau "kamu yang ngasih hit terakhir buat musuh ini, ini exp-nya"
  // -> diterusin KHUSUS ke guest yang bersangkutan doang
  socket.on('killReward', ({ toId, exp }) => {
    if (!currentRoom || !toId) return;
    if (roomHosts.get(currentRoom) !== socket.id) return; // cuma host yang boleh kirim ini
    io.to(toId).emit('killReward', { exp });
  });

  socket.on('disconnect', () => {
    console.log('[disconnect]', socket.id);
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.delete(socket.id);
    socket.to(currentRoom).emit('playerLeft', { id: socket.id });

    if (roomHosts.get(currentRoom) === socket.id) {
      const nextHost = room.size > 0 ? Array.from(room.keys())[0] : null;
      if (nextHost) {
        roomHosts.set(currentRoom, nextHost);
        io.to(currentRoom).emit('hostInfo', { hostId: nextHost });
        console.log(`[host] pindah ke ${nextHost} di party "${currentRoom}" (host lama disconnect)`);
      } else {
        roomHosts.delete(currentRoom);
      }
    }

    if (room.size === 0) {
      rooms.delete(currentRoom);
      roomHosts.delete(currentRoom);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});