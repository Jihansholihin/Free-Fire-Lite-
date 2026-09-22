const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const CONST = require('../shared/constants');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '../client')));

const players = {};
let nextId = 1;

io.on('connection', socket => {
  console.log('Player connected:', socket.id);

  // Spawn DEKAT biar gampang test tembak
  const angle = Math.random() * Math.PI * 2;
  const dist = 6 + Math.random() * 4;

  players[socket.id] = {
    id: socket.id,
    name: 'Player' + nextId++,
    x: Math.cos(angle) * dist,
    y: 0,
    z: Math.sin(angle) * dist,
    yaw: 0,
    hp: 100,
    kills: 0,
    alive: true
  };

  socket.emit('init', { id: socket.id, players });
  socket.broadcast.emit('playerJoined', players[socket.id]);

  socket.on('move', data => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    p.x = data.x;
    p.y = data.y;
    p.z = data.z;
    p.yaw = data.yaw;
  });

  socket.on('shoot', data => {
    const shooter = players[socket.id];
    if (!shooter || !shooter.alive) return;

    const from = { x: data.fromX, y: data.fromY, z: data.fromZ };
    const dir = { x: data.dirX, y: data.dirY, z: data.dirZ };
    const range = data.range || 60;
    const damage = data.damage || 25;

    let closestHit = null;
    let closestDist = Infinity;

    Object.values(players).forEach(target => {
      if (target.id === shooter.id) return;
      if (!target.alive) return;

      const tx = target.x - from.x;
      const ty = (target.y + 1) - from.y;
      const tz = target.z - from.z;

      const proj = tx * dir.x + ty * dir.y + tz * dir.z;
      if (proj < 0 || proj > range) return;

      const closestX = from.x + dir.x * proj;
      const closestY = from.y + dir.y * proj;
      const closestZ = from.z + dir.z * proj;

      const dx = target.x - closestX;
      const dy = (target.y + 1) - closestY;
      const dz = target.z - closestZ;
      const distToLine = Math.sqrt(dx*dx + dy*dy + dz*dz);

      if (distToLine < 1.0 && proj < closestDist) {
        closestDist = proj;
        closestHit = target;
      }
    });

    io.emit('playerShot', {
      id: shooter.id,
      fromX: data.fromX,
      fromY: data.fromY,
      fromZ: data.fromZ,
      dirX: data.dirX,
      dirY: data.dirY,
      dirZ: data.dirZ
    });

    if (closestHit) {
      closestHit.hp -= damage;
      console.log(shooter.name + ' hit ' + closestHit.name + ' -> HP ' + closestHit.hp);

      socket.emit('hitConfirm', { targetId: closestHit.id });

      io.to(closestHit.id).emit('takeDamage', {
        from: shooter.id,
        damage: damage,
        hp: closestHit.hp
      });

      if (closestHit.hp <= 0) {
        closestHit.hp = 0;
        closestHit.alive = false;
        shooter.kills++;

        io.emit('killFeed', {
          killer: shooter.name,
          victim: closestHit.name
        });

        setTimeout(() => {
          if (players[closestHit.id]) {
            const p = players[closestHit.id];
            const a = Math.random() * Math.PI * 2;
            const d = 6 + Math.random() * 4;
            p.x = Math.cos(a) * d;
            p.z = Math.sin(a) * d;
            p.y = 0;
            p.hp = 100;
            p.alive = true;
          }
        }, 3000);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

setInterval(() => {
  io.emit('state', players);
}, 1000 / CONST.TICK_RATE);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('Server jalan di http://localhost:' + PORT);
});