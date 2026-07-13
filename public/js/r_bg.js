// Sky, sun/moon, stars, parallax mountains and clouds, day/night cycle.

import { DAY_LENGTH_S } from '/shared/const.js';

export function dayPhase(worldTime) {
  return (worldTime % DAY_LENGTH_S) / DAY_LENGTH_S;
}

// 1 = full day, ~0.22 = deep night, smooth dusk/dawn ramps.
export function dayBrightness(phase) {
  if (phase < 0.62) return 1;
  if (phase < 0.70) return 1 - ((phase - 0.62) / 0.08) * 0.78;
  if (phase < 0.94) return 0.22;
  return 0.22 + ((phase - 0.94) / 0.06) * 0.78;
}

function lerp(a, b, f) { return a + (b - a) * f; }

function mix(c1, c2, f) {
  return [lerp(c1[0], c2[0], f), lerp(c1[1], c2[1], f), lerp(c1[2], c2[2], f)];
}
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

const SKY = {
  day:   { top: [90, 167, 232], bot: [184, 220, 245] },
  dusk:  { top: [74, 74, 122],  bot: [240, 148, 90] },
  night: { top: [7, 11, 30],    bot: [23, 32, 61] },
};

function skyColors(phase) {
  if (phase < 0.58) return SKY.day;
  if (phase < 0.66) {
    const f = (phase - 0.58) / 0.08;
    return { top: mix(SKY.day.top, SKY.dusk.top, f), bot: mix(SKY.day.bot, SKY.dusk.bot, f) };
  }
  if (phase < 0.74) {
    const f = (phase - 0.66) / 0.08;
    return { top: mix(SKY.dusk.top, SKY.night.top, f), bot: mix(SKY.dusk.bot, SKY.night.bot, f) };
  }
  if (phase < 0.93) return SKY.night;
  const f = (phase - 0.93) / 0.07;
  return { top: mix(SKY.night.top, SKY.day.top, f), bot: mix(SKY.night.bot, SKY.day.bot, f) };
}

// Cheap deterministic hash -> [0,1)
export function hash01(n) {
  let h = (n * 2654435761) % 4294967296;
  h = (h ^ (h >> 16)) * 2246822519 % 4294967296;
  return ((h ^ (h >> 13)) >>> 0) / 4294967296;
}

export function shade(r, g, b, br) {
  return `rgb(${(r * br) | 0},${(g * br) | 0},${(b * br) | 0})`;
}

function ridge(ctx, viewW, camX, par, baseY, amp, color, seedK) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 720);
  const off = camX * par;
  for (let sx = 0; sx <= viewW; sx += 12) {
    const wx = (sx + off) * 0.004 * seedK;
    const y = baseY - amp * (Math.sin(wx) * 0.6 + Math.sin(wx * 2.7 + 1.3) * 0.25 + Math.sin(wx * 0.31) * 0.5);
    ctx.lineTo(sx, y);
  }
  ctx.lineTo(viewW, 720);
  ctx.closePath();
  ctx.fill();
}

export function drawBg(ctx, viewW, viewH, camX, worldTime) {
  const phase = dayPhase(worldTime);
  const br = dayBrightness(phase);
  const sky = skyColors(phase);

  const g = ctx.createLinearGradient(0, 0, 0, viewH * 0.9);
  g.addColorStop(0, rgb(sky.top));
  g.addColorStop(1, rgb(sky.bot));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);

  // Stars
  const starA = (1 - br) / 0.78 - 0.1;
  if (starA > 0) {
    for (let i = 0; i < 90; i++) {
      const sx = hash01(i * 7 + 1) * viewW;
      const sy = hash01(i * 13 + 5) * 380;
      const tw = 0.55 + 0.45 * Math.sin(worldTime * 2 + i * 1.7);
      ctx.fillStyle = `rgba(230,238,255,${(starA * tw).toFixed(3)})`;
      ctx.fillRect(sx, sy, 2, 2);
    }
  }

  // Sun / moon travel across the sky
  if (phase < 0.7) {
    const f = phase / 0.7;
    const sx = viewW * f;
    const sy = 340 - Math.sin(f * Math.PI) * 260;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 90);
    glow.addColorStop(0, 'rgba(255,236,150,0.9)');
    glow.addColorStop(1, 'rgba(255,236,150,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 90, sy - 90, 180, 180);
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath(); ctx.arc(sx, sy, 26, 0, 7); ctx.fill();
  } else {
    const f = (phase - 0.7) / 0.3;
    const mx = viewW * f;
    const my = 300 - Math.sin(f * Math.PI) * 210;
    ctx.fillStyle = '#d8deea';
    ctx.beginPath(); ctx.arc(mx, my, 20, 0, 7); ctx.fill();
    ctx.fillStyle = rgb(skyColors(phase).top);
    ctx.beginPath(); ctx.arc(mx + 8, my - 5, 17, 0, 7); ctx.fill();
  }

  // Mountains (parallax)
  ridge(ctx, viewW, camX, 0.12, 470, 120, shade(52, 74, 104, br), 1.0);
  ridge(ctx, viewW, camX, 0.25, 540, 90, shade(37, 53, 78, br), 1.7);

  // Clouds
  const cloudA = 0.28 + br * 0.45;
  ctx.fillStyle = `rgba(255,255,255,${(cloudA * 0.5).toFixed(3)})`;
  for (let i = 0; i < 7; i++) {
    const speed = 6 + hash01(i * 3) * 8;
    const cw = 90 + hash01(i * 5) * 120;
    const cx = ((hash01(i * 11) * 3000 + worldTime * speed - camX * 0.4) % (viewW + 600)) - 300;
    const cy = 60 + hash01(i * 17) * 180;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw, 18 + hash01(i) * 10, 0, 0, 7);
    ctx.ellipse(cx + cw * 0.3, cy - 12, cw * 0.55, 14, 0, 0, 7);
    ctx.fill();
  }
}
