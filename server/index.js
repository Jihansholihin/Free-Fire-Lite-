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

// ==========================================================
// ZONE STATE
// ==========================================================
const zone = {
  x: 0,
  z: 0,
  radius: 100,
  targetRadius: 100,
  targetX: 0,
  targetZ: 0,
  phase: 'idle',        // 'idle' atau 'shrinking'
  timer: 45,            // detik sebelum shrink berikutnya
  damagePerSec: 5
};

function updateZone(dt) {
  zone.timer -= dt;

  if (zone.timer <= 0) {
    if (zone.phase === 'idle') {
      // Mulai shrink
      zone.phase = 'shrinking';
      zone.targetRadius = Math.max(8, zone.radius * 0.6);
      zone.targetX = zone.x + (Math.random() - 0.5) * zone.radius * 0.6;
      zone.targetZ = zone.z + (Math.random() - 0.5) * zone.radius * 0.6;
    } else {
      zone.phase = 'idle';
      zone.timer = 30;
    }
  }

  if (zone.phase === 'shrinking') {
    const speed = 4; // unit/detik
    const dx = zone.targetX - zone.x;
    const dz = zone.targetZ - zone.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.5) {
      zone.x += (dx / dist) * speed * dt;
      zone.z += (dz / dist) * speed * dt;
    }
    if (zone.radius > zone.targetRadius) {
      zone.radius -= speed * dt;
      if (zone.radius < zone.targetRadius) zone.radius = zone.targetRadius;
    } else {
      zone.phase = 'idle';
      zone.timer = 30;
    }
  }
}

function updateZoneDamage(dt) {
  Object.values(players).forEach(p => {
    if (!p.alive) return;
    const dist = Math.hypot(p.x - zone.x, p.z - zone.z);
    if (dist > zone.radius) {
      p.hp -= zone.damagePerSec * dt;
      if (p.hp <= 0) {
        p.hp = 0;
        p.alive = false;
        io.emit('killFeed', {
          killer: '☠️ ZONA',
          victim: p.name
        });
        setTimeout(() => respawnPlayer(p), 3000);
      }
    }
  });
}

function respawnPlayer(p) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 6 + Math.random() * 4;
  p.x = Math.cos(angle) * dist;
  p.z = Math.sin(angle) * dist;
  p.y = 0;
  p.hp = 100;
  p.alive = true;
}

// ==========================================================
// SOCKET
// ==========================================================
io.on('connection', socket => {
  console.log('Player connected:', socket.id);

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

  socket.emit('init', { id: socket.id, players, zone });
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

      const cx = from.x + dir.x * proj;
      const cy = from.y + dir.y * proj;
      const cz = from.z + dir.z * proj;

      const dx = target.x - cx;
      const dy = (target.y + 1) - cy;
      const dz = target.z - cz;
      const d = Math.sqrt(dx*dx + dy*dy + dz*dz);

      if (d < 1.0 && proj < closestDist) {
        closestDist = proj;
        closestHit = target;
      }
    });

    io.emit('playerShot', {
      id: shooter.id,
      fromX: data.fromX, fromY: data.fromY, fromZ: data.fromZ,
      dirX: data.dirX, dirY: data.dirY, dirZ: data.dirZ
    });

    if (closestHit) {
      closestHit.hp -= damage;
      socket.emit('hitConfirm', { targetId: closestHit.id });
      io.to(closestHit.id).emit('takeDamage', {
        from: shooter.id, damage, hp: closestHit.hp
      });

      if (closestHit.hp <= 0) {
        closestHit.hp = 0;
        closestHit.alive = false;
        shooter.kills++;
        io.emit('killFeed', {
          killer: shooter.name,
          victim: closestHit.name
        });
        setTimeout(() => respawnPlayer(closestHit), 3000);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// ==========================================================
// GAME LOOP
// ==========================================================
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  updateZone(dt);
  updateZoneDamage(dt);

  io.emit('state', players);
  io.emit('zoneState', zone);
}, 1000 / CONST.TICK_RATE);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log('Server jalan di port ' + PORT);
});