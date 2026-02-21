const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const SCREEN = { w: canvas.width, h: canvas.height };
const WORLD = {
  w: 5200,
  h: SCREEN.h,
  waterline: 280,
  shoreLeft: 340,
  shoreRight: 4860,
};

const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

const rarityDefs = {
  Common: { chance: 0.62, value: 12, difficulty: 0.85, speed: 62, color: '#1f2734' },
  Rare: { chance: 0.24, value: 34, difficulty: 1.18, speed: 84, color: '#2b3762', glow: '#88beff' },
  Epic: { chance: 0.11, value: 86, difficulty: 1.52, speed: 104, color: '#4c2f6c', glow: '#c78fff' },
  Legendary: { chance: 0.03, value: 240, difficulty: 1.95, speed: 130, color: '#624410', glow: '#ffd67f' },
};
const rarityOrder = Object.keys(rarityDefs);

const state = {
  time: 0,
  camera: { x: 0 },
  boat: {
    x: (WORLD.shoreLeft + WORLD.shoreRight) / 2,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    hp: 100,
    maxHp: 100,
    speed: 330,
    invuln: 0,
    catchRange: 230,
    rodQuality: 1,
  },
  fish: [],
  enemies: [],
  dock: { x: WORLD.shoreLeft + 120, y: WORLD.waterline - 70, w: 140, h: 150 },
  money: 0,
  inventory: { Common: 0, Rare: 0, Epic: 0, Legendary: 0 },
  shopOpen: false,
  fishing: null,
  messages: [],
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => Math.random() * (b - a) + a;
const rarityColor = { Common: '#8ca5c5', Rare: '#85b8ff', Epic: '#cc8fff', Legendary: '#ffd77d' };

function chooseRarity() {
  let roll = Math.random();
  for (const rarity of rarityOrder) {
    roll -= rarityDefs[rarity].chance;
    if (roll <= 0) return rarity;
  }
  return 'Common';
}

function waterDepthOffset(z) {
  return z * 18;
}

function boatScreenY() {
  return WORLD.waterline - 14 + state.boat.y * 22 + waterDepthOffset(state.boat.z) + Math.sin(state.time * 2.4) * 2.5;
}

function spawnFish(count = 52) {
  for (let i = 0; i < count; i++) {
    const rarity = chooseRarity();
    const def = rarityDefs[rarity];
    state.fish.push({
      rarity,
      x: rand(WORLD.shoreLeft + 80, WORLD.shoreRight - 80),
      z: rand(-0.95, 0.95),
      y: rand(-0.8, 0.8),
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: def.speed * rand(0.75, 1.3),
      size: 8 + rarityOrder.indexOf(rarity) * 2,
      phase: rand(0, Math.PI * 2),
    });
  }
}

function spawnEnemies(count = 12) {
  const types = ['Aggro Fish', 'Sea Beast', 'Raider Boat'];
  for (let i = 0; i < count; i++) {
    state.enemies.push({
      type: types[i % types.length],
      x: rand(WORLD.shoreLeft + 120, WORLD.shoreRight - 120),
      y: rand(-0.8, 0.8),
      z: rand(-0.9, 0.9),
      speed: rand(84, 148),
      dir: Math.random() > 0.5 ? 1 : -1,
      r: 22,
    });
  }
}

function message(text, ttl = 2.3) {
  state.messages.push({ text, ttl });
}

function fishWorldDistance(f) {
  const bx = state.boat.x;
  const by = state.boat.y;
  const bz = state.boat.z;
  return Math.hypot(f.x - bx, (f.y - by) * 120, (f.z - bz) * 140);
}

function startFishing() {
  if (state.shopOpen || state.fishing) return;
  const near = state.fish.filter((f) => fishWorldDistance(f) < state.boat.catchRange);
  if (!near.length) return message('В радиусе заброса нет рыбы');
  near.sort((a, b) => fishWorldDistance(a) - fishWorldDistance(b));
  const fish = near[0];
  const diff = rarityDefs[fish.rarity].difficulty;
  state.fishing = {
    fish,
    indicator: 0.52,
    vel: 0,
    zone: 0.5,
    zoneSize: clamp(0.35 - (diff - 1) * 0.11 - state.boat.rodQuality * 0.03, 0.12, 0.35),
    progress: 0,
    difficulty: diff,
  };
}

function touchingDock() {
  const d = state.dock;
  return Math.abs(state.boat.x - (d.x + d.w / 2)) < 90 && Math.abs(state.boat.z + 0.55) < 0.36;
}

function toggleShop() {
  if (!touchingDock()) return message('Подойди ближе к доку (ось Z к берегу)');
  state.shopOpen = !state.shopOpen;
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) e.preventDefault();
  if (key === 'f') startFishing();
  if (key === 'e' && !state.fishing) toggleShop();
  if (!state.shopOpen) return;
  if (key === '1') sellAllFish();
  if (key === '2') buyUpgrade('speed');
  if (key === '3') buyUpgrade('hp');
  if (key === '4') buyUpgrade('rod');
  if (key === '5') buyUpgrade('range');
  if (key === 'r') repairBoat();
});

function sellAllFish() {
  let gained = 0;
  for (const rarity of rarityOrder) {
    gained += state.inventory[rarity] * rarityDefs[rarity].value;
    state.inventory[rarity] = 0;
  }
  state.money += gained;
  message(gained ? `Продано рыбы на ${gained}` : 'Инвентарь пуст');
}

function buyUpgrade(type) {
  const prices = { speed: 100, hp: 130, rod: 145, range: 130 };
  const names = { speed: 'Скорость', hp: 'Прочность', rod: 'Удочка', range: 'Дальность' };
  if (state.money < prices[type]) return message(`Нужно ${prices[type]} монет`);
  state.money -= prices[type];
  if (type === 'speed') state.boat.speed += 24;
  if (type === 'hp') { state.boat.maxHp += 20; state.boat.hp = Math.min(state.boat.maxHp, state.boat.hp + 20); }
  if (type === 'rod') state.boat.rodQuality += 0.2;
  if (type === 'range') state.boat.catchRange += 32;
  message(`Куплено улучшение: ${names[type]}`);
}

function repairBoat() {
  const need = state.boat.maxHp - state.boat.hp;
  if (need <= 0) return message('Лодка в идеальном состоянии');
  const cost = Math.ceil(need * 1.1);
  if (state.money < cost) return message(`На ремонт нужно ${cost}`);
  state.money -= cost;
  state.boat.hp = state.boat.maxHp;
  message(`Лодка отремонтирована за ${cost}`);
}

function update(dt) {
  state.time += dt;
  state.messages.forEach((m) => (m.ttl -= dt));
  state.messages = state.messages.filter((m) => m.ttl > 0);

  if (!state.shopOpen && !state.fishing) {
    const left = keys.has('a') || keys.has('arrowleft');
    const right = keys.has('d') || keys.has('arrowright');
    const up = keys.has('w') || keys.has('arrowup');
    const down = keys.has('s') || keys.has('arrowdown');
    const rise = keys.has('q');
    const sink = keys.has('e');

    const ax = (right ? 1 : 0) - (left ? 1 : 0);
    const az = (down ? 1 : 0) - (up ? 1 : 0);
    const ay = (rise ? 1 : 0) - (sink ? 1 : 0);

    state.boat.vx += ax * state.boat.speed * dt * 2.1;
    state.boat.vz += az * state.boat.speed * dt * 1.5 / 120;
    state.boat.vy += ay * state.boat.speed * dt * 1.1 / 200;

    state.boat.vx *= 1 - 3.2 * dt;
    state.boat.vz *= 1 - 4.1 * dt;
    state.boat.vy *= 1 - 4.6 * dt;

    state.boat.x += state.boat.vx * dt;
    state.boat.z += state.boat.vz;
    state.boat.y += state.boat.vy;
  }

  state.boat.x = clamp(state.boat.x, WORLD.shoreLeft + 36, WORLD.shoreRight - 36);
  state.boat.z = clamp(state.boat.z, -1, 1);
  state.boat.y = clamp(state.boat.y, -1, 1);

  if (state.boat.invuln > 0) state.boat.invuln -= dt;

  for (const f of state.fish) {
    f.x += f.dir * f.speed * dt;
    f.y += Math.sin(state.time * 1.8 + f.phase) * dt * 0.25;
    f.z += Math.cos(state.time * 1.3 + f.phase) * dt * 0.2;
    if (f.x < WORLD.shoreLeft + 36 || f.x > WORLD.shoreRight - 36) f.dir *= -1;
    f.y = clamp(f.y, -1, 1);
    f.z = clamp(f.z, -1, 1);
  }

  for (const e of state.enemies) {
    e.x += e.dir * e.speed * dt;
    e.z += Math.sin(state.time * 2.8 + e.x * 0.01) * dt * 0.3;
    e.y += Math.cos(state.time * 2.1 + e.x * 0.02) * dt * 0.25;
    if (e.x < WORLD.shoreLeft + 30 || e.x > WORLD.shoreRight - 30) e.dir *= -1;
    e.z = clamp(e.z, -1, 1);
    e.y = clamp(e.y, -1, 1);

    const hit = Math.hypot(e.x - state.boat.x, (e.y - state.boat.y) * 150, (e.z - state.boat.z) * 160) < e.r + 18;
    if (hit && state.boat.invuln <= 0) {
      state.boat.hp = Math.max(0, state.boat.hp - 10);
      state.boat.invuln = 1;
      message('Столкновение с врагом! -10 HP');
    }
  }

  if (state.boat.hp <= 0) {
    state.boat.hp = state.boat.maxHp;
    state.boat.x = (WORLD.shoreLeft + WORLD.shoreRight) / 2;
    state.boat.z = 0;
    state.boat.y = 0;
    message('Лодка уничтожена. Респавн в центре озера.');
  }

  if (state.fishing) {
    const fg = state.fishing;
    const up = keys.has('w') || keys.has('arrowup');
    const down = keys.has('s') || keys.has('arrowdown');
    const control = (up ? 1 : 0) - (down ? 1 : 0);

    fg.vel += control * 2.4 * dt;
    fg.vel -= fg.vel * 2.8 * dt;
    fg.indicator = clamp(fg.indicator + fg.vel, 0, 1);

    fg.zone += Math.sin(state.time * (2 + fg.difficulty * 1.15)) * dt * 0.33 * fg.difficulty;
    fg.zone = clamp(fg.zone, fg.zoneSize / 2, 1 - fg.zoneSize / 2);

    const inZone = Math.abs(fg.indicator - fg.zone) < fg.zoneSize / 2;
    fg.progress = clamp(fg.progress + (inZone ? 0.58 : -0.46) * dt, 0, 1);

    if (fg.progress >= 1) {
      const idx = state.fish.indexOf(fg.fish);
      if (idx >= 0) state.fish.splice(idx, 1);
      state.inventory[fg.fish.rarity] += 1;
      message(`Поймана ${fg.fish.rarity} рыба!`);
      state.fishing = null;
      spawnFish(1);
    }
    if (keys.has('escape')) {
      state.fishing = null;
      message('Ловля отменена');
    }
  }

  const targetX = clamp(state.boat.x - SCREEN.w * 0.45, 0, WORLD.w - SCREEN.w);
  state.camera.x = lerp(state.camera.x, targetX, 0.08);
}

function drawCloud(x, y, s) {
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
  ctx.arc(x + 24 * s, y - 10 * s, 20 * s, 0, Math.PI * 2);
  ctx.arc(x + 49 * s, y, 24 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawShore(x, side, camX) {
  const sx = x - camX;
  ctx.fillStyle = '#7a9d57';
  ctx.fillRect(sx - 260, WORLD.waterline - 30, 520, 160);

  ctx.fillStyle = '#5f7f45';
  for (let i = 0; i < 9; i++) {
    const rx = sx - 230 + i * 58 + Math.sin(i * 3) * 6;
    ctx.beginPath();
    ctx.arc(rx, WORLD.waterline + 40 + (i % 3) * 8, 14 + (i % 4), 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 8; i++) {
    const reedX = sx + (side === 'left' ? 100 : -100) + i * (side === 'left' ? 10 : -10);
    ctx.strokeStyle = '#3c6032';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(reedX, WORLD.waterline + 6);
    ctx.lineTo(reedX + Math.sin(state.time * 2 + i) * 3, WORLD.waterline - 18 - (i % 3) * 5);
    ctx.stroke();
  }

  ctx.fillStyle = '#6e6f70';
  for (let i = 0; i < 5; i++) {
    const rx = sx + (side === 'left' ? -80 : 80) + i * (side === 'left' ? -16 : 16);
    ctx.beginPath();
    ctx.ellipse(rx, WORLD.waterline + 14 + i * 2, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWorld() {
  const camX = state.camera.x;
  ctx.clearRect(0, 0, SCREEN.w, SCREEN.h);

  const sky = ctx.createLinearGradient(0, 0, 0, WORLD.waterline);
  sky.addColorStop(0, '#8bddff');
  sky.addColorStop(0.55, '#69bced');
  sky.addColorStop(1, '#4ba3db');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCREEN.w, WORLD.waterline);

  const cloudShift = (camX * 0.1) % (SCREEN.w + 280);
  drawCloud(130 - cloudShift, 76, 1.1);
  drawCloud(460 - cloudShift * 0.78, 58, 0.9);
  drawCloud(860 - cloudShift * 0.63, 93, 1.2);

  const sea = ctx.createLinearGradient(0, WORLD.waterline, 0, SCREEN.h);
  sea.addColorStop(0, '#1f90d0');
  sea.addColorStop(1, '#1e73ae');
  ctx.fillStyle = sea;
  ctx.fillRect(0, WORLD.waterline, SCREEN.w, SCREEN.h - WORLD.waterline);

  for (let i = 0; i < 7; i++) {
    const y = WORLD.waterline + 8 + i * 16;
    ctx.strokeStyle = `rgba(255,255,255,${0.23 - i * 0.03})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(state.time * 1.5 + i * 0.8) * 2.1);
    ctx.lineTo(SCREEN.w, y + Math.cos(state.time * 1.2 + i * 0.6) * 2.1);
    ctx.stroke();
  }

  drawShore(WORLD.shoreLeft, 'left', camX);
  drawShore(WORLD.shoreRight, 'right', camX);

  const d = state.dock;
  const dockX = d.x - camX;
  ctx.fillStyle = '#5a3d2c';
  ctx.fillRect(dockX, d.y, d.w, d.h);
  ctx.fillStyle = '#7e583d';
  ctx.fillRect(dockX - 16, d.y + 48, d.w + 28, 18);
  ctx.fillStyle = '#d2b07e';
  ctx.fillRect(dockX + 88, d.y - 32, 22, 32);
  ctx.fillStyle = '#f5dfab';
  ctx.fillRect(dockX + 92, d.y - 28, 14, 14);

  const drawables = [];
  for (const f of state.fish) drawables.push({ type: 'fish', obj: f, layer: f.z });
  for (const e of state.enemies) drawables.push({ type: 'enemy', obj: e, layer: e.z + 0.04 });
  drawables.push({ type: 'boat', obj: state.boat, layer: state.boat.z + 0.08 });
  drawables.sort((a, b) => a.layer - b.layer);

  for (const item of drawables) {
    if (item.type === 'fish') {
      const f = item.obj;
      const x = f.x - camX;
      if (x < -40 || x > SCREEN.w + 40) continue;
      const y = WORLD.waterline + f.y * 18 + waterDepthOffset(f.z) + 56;
      const def = rarityDefs[f.rarity];
      if (def.glow) {
        ctx.shadowColor = def.glow;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.ellipse(x, y, f.size * 1.45, f.size * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (item.type === 'enemy') {
      const e = item.obj;
      const x = e.x - camX;
      if (x < -80 || x > SCREEN.w + 80) continue;
      const y = WORLD.waterline + e.y * 20 + waterDepthOffset(e.z) + 4;
      ctx.fillStyle = '#c54e4e';
      ctx.beginPath();
      ctx.roundRect(x - 24, y - 11, 48, 22, 8);
      ctx.fill();
      ctx.fillStyle = '#ffdede';
      ctx.font = '11px Inter';
      ctx.fillText(e.type, x - 28, y - 16);
    }

    if (item.type === 'boat') {
      const b = item.obj;
      const bx = b.x - camX;
      const by = boatScreenY();
      const scale = 1 + b.z * 0.08;
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(scale, scale);

      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(0, 16, 36, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = b.invuln > 0 ? '#ffe8a6' : '#f2a95f';
      ctx.beginPath();
      ctx.moveTo(-35, 2);
      ctx.lineTo(35, 2);
      ctx.lineTo(22, 21);
      ctx.lineTo(-24, 21);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffedcc';
      ctx.fillRect(-10, -14, 20, 16);
      ctx.fillStyle = '#724b2f';
      ctx.fillRect(0, -33, 3, 33);
      ctx.fillStyle = '#fff8d7';
      ctx.beginPath();
      ctx.moveTo(3, -32);
      ctx.lineTo(25, -21);
      ctx.lineTo(3, -8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawPanel(x, y, w, h) {
  ctx.fillStyle = 'rgba(7, 14, 29, 0.76)';
  ctx.strokeStyle = 'rgba(138, 190, 255, 0.35)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();
}

function drawUI() {
  drawPanel(14, 14, 390, 178);
  const b = state.boat;
  ctx.fillStyle = '#dff0ff';
  ctx.font = '600 16px Inter';
  ctx.fillText('Sea Lodew — Design V2', 28, 40);

  ctx.font = '13px Inter';
  ctx.fillStyle = '#cae4ff';
  ctx.fillText(`HP: ${Math.round(b.hp)} / ${b.maxHp}`, 28, 64);
  ctx.fillText(`Монеты: ${state.money}`, 28, 84);
  ctx.fillText(`XYZ лодки: X ${Math.round(b.x)} | Y ${b.y.toFixed(2)} | Z ${b.z.toFixed(2)}`, 28, 104);
  ctx.fillText(`Скорость: ${Math.round(b.speed)} | Дальность: ${Math.round(b.catchRange)}`, 28, 124);
  ctx.fillText(`Инвентарь: C ${state.inventory.Common}  R ${state.inventory.Rare}  E ${state.inventory.Epic}  L ${state.inventory.Legendary}`, 28, 146);

  const hpRatio = b.hp / b.maxHp;
  ctx.fillStyle = '#1b3048';
  ctx.fillRect(28, 158, 350, 12);
  const grad = ctx.createLinearGradient(28, 0, 378, 0);
  grad.addColorStop(0, '#55e08f');
  grad.addColorStop(1, '#7bd9ff');
  ctx.fillStyle = grad;
  ctx.fillRect(28, 158, 350 * hpRatio, 12);

  drawPanel(14, SCREEN.h - 56, 860, 42);
  ctx.fillStyle = '#d9eeff';
  ctx.fillText('A/D: X движение | W/S: Z (глубина плана) | Q/E: Y (вертикаль) | F: ловля | E у дока: магазин | Esc: отмена ловли', 28, SCREEN.h - 30);

  state.messages.slice(-3).forEach((m, i) => {
    drawPanel(SCREEN.w - 430, 14 + i * 38, 414, 32);
    ctx.fillStyle = '#f4fbff';
    ctx.fillText(m.text, SCREEN.w - 415, 35 + i * 38);
  });

  if (state.shopOpen) {
    drawPanel(160, 80, 640, 390);
    ctx.fillStyle = '#ffeec8';
    ctx.font = '700 24px Inter';
    ctx.fillText('Причал — Магазин', 190, 124);
    ctx.font = '15px Inter';
    ctx.fillStyle = '#e1f0ff';
    ctx.fillText('1) Продать весь улов', 190, 170);
    ctx.fillText('2) Скорость лодки +24 (100)', 190, 202);
    ctx.fillText('3) Прочность +20 HP (130)', 190, 234);
    ctx.fillText('4) Качество удочки +0.2 (145)', 190, 266);
    ctx.fillText('5) Дальность заброса +32 (130)', 190, 298);
    ctx.fillText('R) Починить лодку', 190, 330);
    ctx.fillText('E) Закрыть магазин', 190, 362);

    let y = 170;
    for (const r of rarityOrder) {
      ctx.fillStyle = rarityColor[r];
      ctx.fillText(`${r}: ${rarityDefs[r].value} монет`, 500, y);
      y += 32;
    }
  }

  if (state.fishing) {
    const fg = state.fishing;
    drawPanel(SCREEN.w - 190, 95, 150, 360);
    const x = SCREEN.w - 115;
    const y = 138;
    const h = 274;

    ctx.fillStyle = '#1c2f46';
    ctx.fillRect(x - 8, y, 16, h);

    const zoneY = y + (1 - fg.zone) * h;
    const zoneH = fg.zoneSize * h;
    ctx.fillStyle = 'rgba(116, 236, 169, 0.75)';
    ctx.fillRect(x - 36, zoneY - zoneH / 2, 72, zoneH);

    const markerY = y + (1 - fg.indicator) * h;
    ctx.fillStyle = '#ffd27f';
    ctx.fillRect(x - 42, markerY - 5, 84, 10);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Fish: ${fg.fish.rarity}`, x - 50, 118);

    ctx.fillStyle = '#112236';
    ctx.fillRect(34, SCREEN.h - 92, 272, 16);
    ctx.fillStyle = '#64e89c';
    ctx.fillRect(36, SCREEN.h - 90, 268 * fg.progress, 12);
    ctx.fillStyle = '#e5f5ff';
    ctx.fillText('Удерживай индикатор в зелёной зоне', 34, SCREEN.h - 102);
  }
}

let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - prev) / 1000);
  prev = now;
  update(dt);
  drawWorld();
  drawUI();
  requestAnimationFrame(frame);
}

spawnFish();
spawnEnemies();
message('V2: добавлены берега, XYZ-движение и детализация');
requestAnimationFrame(frame);
