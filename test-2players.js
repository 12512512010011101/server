const { io } = require('socket.io-client');

const a = io('http://localhost:3001');
const b = io('http://localhost:3001', { autoConnect: false });

b.on('newPlayer', (p) => console.log('[B] lihat pemain baru gabung:', p.name));

a.on('connect', () => {
  console.log('[A] connect', a.id);
  a.emit('joinRoom', { roomCode: 'testroom', name: 'Firm', raceId: 'demon', x: 100, y: 100 });

  // kasih jeda biar A pasti udah masuk room duluan sebelum B join & gerak
  setTimeout(() => {
    b.on('connect', () => {
      console.log('[B] connect', b.id);
      b.emit('joinRoom', { roomCode: 'testroom', name: 'Temen', raceId: 'elf', x: 200, y: 200 });
    });
    b.connect();
  }, 300);
});

b.on('currentPlayers', (list) => {
  console.log('[B] currentPlayers pas join (harusnya udah ada A):', list);
  // B gerak, harusnya A nerima 'playerMoved'
  setTimeout(() => b.emit('move', { x: 250, y: 220, direction: 'right', moving: true }), 300);
});

a.on('playerMoved', (p) => {
  console.log('[A] nerima playerMoved dari B:', p);
  process.exit(0);
});

setTimeout(() => { console.log('TIMEOUT - ada yang gak jalan'); process.exit(1); }, 5000);
