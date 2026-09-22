module.exports = {
  TICK_RATE: 30,
  MAP_SIZE: 200,
  MAX_PLAYERS: 20,
  PLAYER_SPEED: 8,

  WEAPONS: {
    pistol: { name: 'Pistol', damage: 18, fireRate: 350, range: 40, magSize: 12 },
    smg:    { name: 'SMG',    damage: 12, fireRate: 80,  range: 30, magSize: 30 },
    ar:     { name: 'AR',     damage: 24, fireRate: 150, range: 60, magSize: 30 },
    sniper: { name: 'Sniper', damage: 85, fireRate: 1500, range: 150, magSize: 5 }
  },

  ZONE: {
    START_RADIUS: 100,
    MIN_RADIUS: 10,
    SHRINK_INTERVAL: 45,
    DAMAGE_PER_SEC: 5
  }
};