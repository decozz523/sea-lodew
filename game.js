const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const SCREEN = { w: canvas.width, h: canvas.height };
const WORLD = { w: 3600, h: 1400, waterline: 180 };

const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

const rarityDefs = {
  Common: { chance: 0.62, value: 10, difficulty: 0.8, speed: 42, depthMin: WORLD.waterline + 90, color: '#2a2f38' },
  Rare: { chance: 0.24, value: 28, difficulty: 1.1, speed: 58, depthMin: WORLD.waterline + 190, color: '#333f63', glow: '#75a1ff' },
  Epic: { chance: 0.11, value: 70, difficulty: 1.45, speed: 76, depthMin: WORLD.waterline + 300, color: '#3b2b57', glow: '#b76fff' },
  Legendary: { chance: 0.03, value: 190, difficulty: 1.95, speed: 96, depthMin: WORLD.waterline + 430, color: '#4f3518', glow: '#ffd66f' },
};
const rarityOrder = Object.keys(rarityDefs);

const state = {
  time: 0,
  camera: { x: 0, y: 0 },
  boat: {
    x: 800,
    y: WORLD.waterline - 40,
    r: 20,
    hp: 100,
    maxHp: 100,
    speed: 200,
    invuln: 0,
    catchRange: 180,
    rodQuality: 1,
  },
  fish: [],
  enemies: [],
  dock: { x: 120, y: WORLD.waterline - 55, w: 90, h: 110 },
  money: 0,
  inventory: { Common: 0, Rare: 0, Epic: 0, Legendary: 0 },
  shopOpen: false,
  fishing: null,
  messages: [],
};

function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function chooseRarity() {
  const roll = Math.random();
  let acc = 0;
  for (const rarity of rarityOrder) {
    acc += rarityDefs[rarity].chance;
    if (roll <= acc) return rarity;
  }
  return 'Common';
}

function spawnFish(count = 35) {
  for (let i = 0; i < count; i++) {
    const rarity = chooseRarity();
    const def = rarityDefs[rarity];
    state.fish.push({
      rarity,
      x: rand(130, WORLD.w - 120),
      y: rand(def.depthMin, WORLD.h - 60),
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: def.speed * rand(0.7, 1.35),
      wiggle: rand(0.5, 2.5),
      size: 10 + rarityOrder.indexOf(rarity) * 2,
    });
  }
}

function spawnEnemies(count = 10) {
  const types = ['Aggro Fish', 'Sea Beast', 'Raider Boat'];
  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    state.enemies.push({
      type,
      x: rand(200, WORLD.w - 140),
      y: rand(WORLD.waterline + 70, WORLD.h - 80),
      r: 20,
      speed: rand(65, 120),
      angle: rand(0, Math.PI * 2),
    });
  }
}

function message(text, ttl = 2) {
  state.messages.push({ text, ttl });
}

function startFishing() {
  if (state.fishing || state.shopOpen) return;
  const candidates = state.fish.filter((f) => {
    const dx = f.x - state.boat.x;
    const dy = f.y - state.boat.y;
    return dy > 15 && Math.hypot(dx, dy) < state.boat.catchRange;
  });
  if (!candidates.length) {
    message('Нет рыбы в радиусе заброса');
    return;
  }
  candidates.sort((a, b) => {
    const da = Math.hypot(a.x - state.boat.x, a.y - state.boat.y);
    const db = Math.hypot(b.x - state.boat.x, b.y - state.boat.y);
    return da - db;
  });
  const target = candidates[0];
  const def = rarityDefs[target.rarity];
  state.fishing = {
    fish: target,
    indicator: 0.5,
    vel: 0,
    zone: 0.5,
    zoneSize: clamp(0.35 - (def.difficulty - 1) * 0.12 - state.boat.rodQuality * 0.03, 0.12, 0.36),
    progress: 0,
    difficulty: def.difficulty,
  };
}

function tryOpenShop() {
  const b = state.boat;
  const d = state.dock;
  const touching = b.x + b.r > d.x && b.x - b.r < d.x + d.w && b.y + b.r > d.y && b.y - b.r < d.y + d.h;
  if (touching) state.shopOpen = !state.shopOpen;
  else message('Подойди к причалу');
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'f') startFishing();
  if (key === 'e') tryOpenShop();
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
  message(gained ? `Продано улова на ${gained} монет` : 'Нечего продавать');
}

function buyUpgrade(type) {
  const prices = { speed: 80, hp: 120, rod: 130, range: 110 };
  const names = { speed: 'Скорость лодки', hp: 'Прочность лодки', rod: 'Качество удочки', range: 'Дальность заброса' };
  const price = prices[type];
  if (state.money < price) return message(`Недостаточно монет (${price})`);
  state.money -= price;
  if (type === 'speed') state.boat.speed += 20;
  if (type === 'hp') {
    state.boat.maxHp += 15;
    state.boat.hp = Math.min(state.boat.hp + 15, state.boat.maxHp);
  }
  if (type === 'rod') state.boat.rodQuality += 0.2;
  if (type === 'range') state.boat.catchRange += 25;
  message(`Куплено: ${names[type]}`);
}

function repairBoat() {
  const need = state.boat.maxHp - state.boat.hp;
  if (need <= 0) return message('Лодка не повреждена');
  const cost = Math.ceil(need * 0.9);
  if (state.money < cost) return message(`На ремонт нужно ${cost}`);
  state.money -= cost;
  state.boat.hp = state.boat.maxHp;
  message(`Лодка отремонтирована за ${cost}`);
}

function update(dt) {
  state.time += dt;
  for (const msg of state.messages) msg.ttl -= dt;
  state.messages = state.messages.filter((m) => m.ttl > 0);

  if (!state.shopOpen && !state.fishing) {
    const inputX = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const inputY = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    const mag = Math.hypot(inputX, inputY) || 1;
    state.boat.x += (inputX / mag) * state.boat.speed * dt;
    state.boat.y += (inputY / mag) * state.boat.speed * dt;
  }

  state.boat.x = clamp(state.boat.x, 40, WORLD.w - 40);
  state.boat.y = clamp(state.boat.y, WORLD.waterline - 70, WORLD.waterline + 110);

  if (state.boat.invuln > 0) state.boat.invuln -= dt;

  for (const f of state.fish) {
    f.x += f.dir * f.speed * dt;
    f.y += Math.sin(state.time * f.wiggle + f.x * 0.01) * 12 * dt;
    if (f.x < 60 || f.x > WORLD.w - 60) f.dir *= -1;
    const minDepth = rarityDefs[f.rarity].depthMin;
    f.y = clamp(f.y, minDepth, WORLD.h - 50);
  }

  for (const e of state.enemies) {
    e.angle += rand(-0.7, 0.7) * dt;
    e.x += Math.cos(e.angle) * e.speed * dt;
    e.y += Math.sin(e.angle * 0.7) * e.speed * 0.6 * dt;
    if (e.x < 50 || e.x > WORLD.w - 50) e.angle = Math.PI - e.angle;
    if (e.y < WORLD.waterline + 40 || e.y > WORLD.h - 50) e.angle = -e.angle;
    const hit = Math.hypot(e.x - state.boat.x, e.y - state.boat.y) < e.r + state.boat.r;
    if (hit && state.boat.invuln <= 0) {
      state.boat.hp = Math.max(0, state.boat.hp - 8);
      state.boat.invuln = 1;
      message('Враг атаковал лодку! -8 HP');
    }
  }

  if (state.boat.hp <= 0) {
    state.boat.hp = state.boat.maxHp;
    state.boat.x = state.dock.x + 140;
    state.boat.y = WORLD.waterline - 40;
    message('Лодка уничтожена. Возвращение к причалу.');
  }

  if (state.fishing) {
    const fg = state.fishing;
    const control = (keys.has('arrowup') || keys.has('w') ? 1 : 0) - (keys.has('arrowdown') || keys.has('s') ? 1 : 0);
    fg.vel += control * 2.2 * dt;
    fg.vel -= fg.vel * 2.8 * dt;
    fg.indicator = clamp(fg.indicator + fg.vel, 0, 1);

    fg.zone += Math.sin(state.time * (1.7 + fg.difficulty)) * 0.35 * dt * fg.difficulty;
    fg.zone = clamp(fg.zone, fg.zoneSize / 2, 1 - fg.zoneSize / 2);

    const inZone = Math.abs(fg.indicator - fg.zone) <= fg.zoneSize / 2;
    fg.progress += (inZone ? 0.52 : -0.38) * dt;
    fg.progress = clamp(fg.progress, 0, 1);

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

  const targetCamX = clamp(state.boat.x - SCREEN.w / 2, 0, WORLD.w - SCREEN.w);
  const targetCamY = clamp(state.boat.y - SCREEN.h / 2, 0, WORLD.h - SCREEN.h);
  state.camera.x = lerp(state.camera.x, targetCamX, 0.07);
  state.camera.y = lerp(state.camera.y, targetCamY, 0.07);
}

function drawWorld() {
  const cam = state.camera;
  ctx.clearRect(0, 0, SCREEN.w, SCREEN.h);

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD.waterline - cam.y + 80);
  sky.addColorStop(0, '#8dd2ff');
  sky.addColorStop(1, '#66b9ef');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCREEN.w, WORLD.waterline - cam.y);

  // water and depth
  const waterY = WORLD.waterline - cam.y;
  const water = ctx.createLinearGradient(0, waterY, 0, SCREEN.h + 120);
  water.addColorStop(0, '#2f8fd1');
  water.addColorStop(0.35, '#205f94');
  water.addColorStop(0.75, '#123f64');
  water.addColorStop(1, '#0a223c');
  ctx.fillStyle = water;
  ctx.fillRect(0, waterY, SCREEN.w, SCREEN.h - waterY);

  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, waterY + Math.sin(state.time * 2) * 2);
  ctx.lineTo(SCREEN.w, waterY + Math.cos(state.time * 1.6) * 2);
  ctx.stroke();

  // depth zones
  for (let i = 0; i < 4; i++) {
    const y = waterY + i * 120 + 50;
    ctx.fillStyle = `rgba(255,255,255,${0.04 - i * 0.008})`;
    ctx.fillRect(0, y, SCREEN.w, 2);
  }

  // dock
  const d = state.dock;
  ctx.fillStyle = '#704f32';
  ctx.fillRect(d.x - cam.x, d.y - cam.y, d.w, d.h);
  ctx.fillStyle = '#906647';
  ctx.fillRect(d.x - cam.x + 65, d.y - cam.y - 26, 22, 26);
  ctx.fillStyle = '#f7d98a';
  ctx.fillRect(d.x - cam.x + 69, d.y - cam.y - 20, 14, 14);

  for (const f of state.fish) {
    const x = f.x - cam.x;
    const y = f.y - cam.y;
    const def = rarityDefs[f.rarity];
    if (def.glow) {
      ctx.shadowColor = def.glow;
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(x, y, f.size, f.size * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  for (const e of state.enemies) {
    const x = e.x - cam.x;
    const y = e.y - cam.y;
    ctx.fillStyle = '#bf4f45';
    ctx.beginPath();
    ctx.arc(x, y, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6';
    ctx.fillText(e.type, x - 28, y - 24);
  }

  // boat
  const b = state.boat;
  ctx.save();
  ctx.translate(b.x - cam.x, b.y - cam.y);
  ctx.fillStyle = b.invuln > 0 ? '#ffe8a0' : '#f3b45f';
  ctx.beginPath();
  ctx.moveTo(-28, 8);
  ctx.lineTo(28, 8);
  ctx.lineTo(20, 20);
  ctx.lineTo(-20, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fbe8c4';
  ctx.fillRect(-7, -12, 14, 16);
  ctx.restore();
}

function drawUI() {
  const b = state.boat;
  ctx.fillStyle = 'rgba(7,13,20,0.62)';
  ctx.fillRect(12, 12, 320, 130);
  ctx.fillStyle = '#fff';
  ctx.font = '15px sans-serif';
  ctx.fillText(`HP: ${Math.round(b.hp)} / ${b.maxHp}`, 24, 34);
  ctx.fillText(`Монеты: ${state.money}`, 24, 56);
  ctx.fillText(`Удочка: ${b.rodQuality.toFixed(1)} | Заброс: ${Math.round(b.catchRange)}`, 24, 78);
  ctx.fillText(`Инвентарь C:${state.inventory.Common} R:${state.inventory.Rare} E:${state.inventory.Epic} L:${state.inventory.Legendary}`, 24, 100);

  ctx.fillStyle = '#d6ecff';
  ctx.fillText('WASD/Стрелки: движение | F: ловить | E: причал/магазин', 24, SCREEN.h - 24);

  state.messages.slice(-3).forEach((msg, i) => {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(SCREEN.w - 360, 16 + i * 30, 344, 24);
    ctx.fillStyle = '#fff';
    ctx.fillText(msg.text, SCREEN.w - 350, 33 + i * 30);
  });

  if (state.shopOpen) {
    ctx.fillStyle = 'rgba(8,13,25,0.8)';
    ctx.fillRect(150, 90, 660, 360);
    ctx.fillStyle = '#f8f1d2';
    ctx.font = '20px sans-serif';
    ctx.fillText('Причал — Магазин', 180, 128);
    ctx.font = '16px sans-serif';
    ctx.fillText('1) Продать всю рыбу', 180, 170);
    ctx.fillText('2) Скорость лодки (+20) — 80', 180, 200);
    ctx.fillText('3) Прочность лодки (+15 max HP) — 120', 180, 230);
    ctx.fillText('4) Качество удочки (+устойчивость в мини-игре) — 130', 180, 260);
    ctx.fillText('5) Дальность заброса (+25) — 110', 180, 290);
    ctx.fillText('R) Починить лодку по текущему урону', 180, 320);
    ctx.fillText('E) Закрыть магазин', 180, 350);
  }

  if (state.fishing) {
    const fg = state.fishing;
    const x = SCREEN.w - 120;
    const y = 110;
    const h = 320;
    ctx.fillStyle = 'rgba(6,12,20,0.7)';
    ctx.fillRect(x - 50, y - 24, 100, h + 48);
    ctx.fillStyle = '#9bd5ff';
    ctx.fillRect(x - 5, y, 10, h);

    const zoneY = y + (1 - fg.zone) * h;
    const zoneH = fg.zoneSize * h;
    ctx.fillStyle = 'rgba(141,255,177,0.65)';
    ctx.fillRect(x - 25, zoneY - zoneH / 2, 50, zoneH);

    const indicatorY = y + (1 - fg.indicator) * h;
    ctx.fillStyle = '#ffd67d';
    ctx.fillRect(x - 30, indicatorY - 4, 60, 8);

    ctx.fillStyle = '#fff';
    ctx.fillText(`Ловля: ${fg.fish.rarity}`, x - 44, y - 32);

    ctx.fillStyle = '#1d2b3f';
    ctx.fillRect(40, SCREEN.h - 56, 220, 20);
    ctx.fillStyle = '#66d98f';
    ctx.fillRect(42, SCREEN.h - 54, 216 * fg.progress, 16);
    ctx.fillStyle = '#fff';
    ctx.fillText('Держите маркер в зелёной зоне (W/S)', 40, SCREEN.h - 66);
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
message('Добро пожаловать в прототип Sea Lodew');
requestAnimationFrame(frame);
