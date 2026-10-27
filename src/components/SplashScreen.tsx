/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { preloadCharacterVoices } from '../utils/characterAudio';

export interface SplashScreenProps {
  /** Fired the instant the creeper explodes, while the white flash hides the menu swap. */
  onReveal: () => void;
  /** Fired when the intro layer is fully finished and should unmount. */
  onDone: () => void;
  className?: string;
}

/* ============ CREEPER INTRO: settings (edit freely) ============ */
const INTRO_DELAY = 1.0;    // seconds: only the card on black, no creeper yet
const LOOK_DURATION = 2.0;  // seconds: head peeks from the screen edge and looks right / left
const RUN_DURATION = 3.5;   // seconds: straight, fast run to the card
const FUSE_DURATION = 1.25; // seconds: swell + white flashes before the boom
const CREEPER_HEIGHT = 56;  // px on screen
const CARD_H = 132;         // px on screen
const START_SIDE = 'left';
const RUN_STRIDE_HZ = 3.6;
const LEG_SWING_DEG = 40;
const SHAKE_PX = 18, SHAKE_TIME = 0.7;
const AFTER_BOOM = 1.5;
const SKIP_ENABLED = true;
const SOUND_ON = true;
const SFX_FUSE_URL = '', SFX_EXPLODE_URL = '';
const IMG = { w: 440, h: 576, px: 54, py: 54, cw: 332, ch: 468 };

/**
 * The opening intro, ported from the approved design: the ikout card floats
 * on black, a creeper peeks from the edge and scans the screen, sprints to
 * the card, swells with a fuse hiss, and explodes into real card shards and
 * fire — then the home menu is revealed behind the white flash.
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({ onReveal, onDone, className = '' }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const revealRef = useRef(onReveal);
  const doneRef = useRef(onDone);
  revealRef.current = onReveal;
  doneRef.current = onDone;

  useEffect(() => {
    preloadCharacterVoices(loadProfileId());
    const root = wrapRef.current;
    if (!root) return;
    const intro = root.querySelector<HTMLElement>('.ik-intro')!;
    const frame = root.querySelector<HTMLElement>('#inFrame')!;
    const cv = root.querySelector<HTMLCanvasElement>('#inCv')!;
    const flash = root.querySelector<HTMLElement>('#inFlash')!;
    const hint = root.querySelector<HTMLElement>('#inHint')!;
    const cardWrap = root.querySelector<HTMLElement>('#inCardWrap')!;
    const cardImg = root.querySelector<HTMLImageElement>('#inCard')!;
    const ctx = cv.getContext('2d')!;
    const spr = document.createElement('canvas');
    let sg: CanvasRenderingContext2D, W = 0, H = 0, P = 1, cw = 0, ch = 0, OW = 0, OH = 0, OX = 0, OY = 0, footY = 0, dir = 1, stopU = 0, dpr = 1;

    /* ---------- creeper textures (procedural, seeded) ---------- */
    const rng = (a: number) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R0 = rng(7);
    const PAL = ['#0a3a0e', '#0a4d12', '#0e6b17', '#13871f', '#13871f', '#1da12a', '#1da12a', '#2ab636', '#2ab636', '#3fcf45', '#63df5c', '#b4ecbf'];
    const tex = (w: number, h: number, seed: number) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d')!, r = rng(seed), m: number[][] = [];
      for (let y = 0; y < h; y++) { m[y] = [];
        for (let x = 0; x < w; x++) {
          const n = x && r() < .45 ? m[y][x - 1] : (y && r() < .45 ? m[y - 1][x] : null);
          const i = n !== null ? Math.max(0, Math.min(PAL.length - 1, n + Math.round((r() - .5) * 3))) : Math.floor(r() * PAL.length);
          m[y][x] = i; g.fillStyle = PAL[i]; g.fillRect(x, y, 1, 1);
        } }
      return c;
    };
    const darken = (c: HTMLCanvasElement) => { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; const g = d.getContext('2d')!; g.drawImage(c, 0, 0); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, d.width, d.height); return d; };
    const FACE = ['........', '........', '.##..##.', '.##..##.', '...##...', '..####..', '..####..', '..#..#..'];
    const T = { front: tex(8, 8, 11), side: tex(8, 8, 12), back: tex(8, 8, 13), body: tex(4, 12, 14), legN: tex(4, 6, 15) };
    { const g = T.front.getContext('2d')!; g.fillStyle = '#050505';
      FACE.forEach((row, y) => [...row].forEach((c, x) => c === '#' && g.fillRect(x, y, 1, 1)));
      const l = T.legN.getContext('2d')!; for (let x = 0; x < 4; x++) { l.fillStyle = R0() < .5 ? '#06200a' : '#0a3a0e'; l.fillRect(x, 5, 1, 1); } }
    const T2 = T as typeof T & { legF?: HTMLCanvasElement };
    T2.legF = darken(T.legN);

    /* ---------- creeper sprite ---------- */
    function drawCreeper(a: number, yaw: number, white: boolean, dx: number) {
      const g = sg, hip = OY - 6 * P; g.clearRect(0, 0, OW, OH); g.imageSmoothingEnabled = false;
      const leg = (tx: HTMLCanvasElement, cx: number, r: number) => { g.save(); g.translate(OX + cx * P, hip); g.rotate(r); g.drawImage(tx, -2 * P, 0, 4 * P, 6 * P); g.restore(); };
      const legF = T2.legF!;
      leg(legF, 2, -a); leg(legF, -2, a); leg(T.legN, 2, a); leg(T.legN, -2, -a);
      g.drawImage(T.body, OX - 2 * P, hip - 12 * P, 4 * P, 12 * P);
      const c = Math.cos(yaw), s = Math.sin(yaw), wS = 8 * Math.abs(c) * P, wF = 8 * Math.abs(s) * P, y = OY - 26 * P, h = 8 * P;
      let x = OX + dx - (wS + wF) / 2;
      const face = (tx: HTMLCanvasElement, w: number, sh: number) => { const x0 = Math.round(x), w0 = Math.round(x + w) - x0;
        if (w0 > 0) { g.drawImage(tx, 0, 0, 8, 8, x0, y, w0, h); if (sh) { g.fillStyle = `rgba(0,0,0,${sh})`; g.fillRect(x0, y, w0, h); } } x += w; };
      if (c >= 0) { face(T.side, wS, .12); face(T.front, wF, 0); } else { face(T.front, wF, 0); face(T.side, wS, .12); }
      if (white) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, OW, OH); g.globalCompositeOperation = 'source-over'; }
    }
    const K = [[0, 0], [.12, 0], [.3, 180], [.42, 180], [.58, 8], [.68, 8], [.82, 175], [.9, 175], [1, 0]];
    const yawAt = (u: number) => { for (let i = 1; i < K.length; i++) if (u <= K[i][0]) { const a = K[i - 1], b = K[i], k = (u - a[0]) / (b[0] - a[0]); return (a[1] + (b[1] - a[1]) * k * k * (3 - 2 * k)) * Math.PI / 180; } return 0; };

    /* ---------- layout ---------- */
    function layout() {
      const vw = window.innerWidth, vh = window.innerHeight, port = vh > vw, Lw = port ? vh : vw, Lh = port ? vw : vh;
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      frame.style.width = Lw + 'px'; frame.style.height = Lh + 'px';
      frame.style.transform = 'translate(-50%,-50%)' + (port ? ' rotate(90deg)' : '');
      W = cv.width = Math.round(Lw * dpr); H = cv.height = Math.round(Lh * dpr);
      P = Math.max(1, Math.round(CREEPER_HEIGHT * dpr / 26));
      OW = 28 * P; OH = 30 * P; OX = 10 * P; OY = 28 * P; spr.width = OW; spr.height = OH; sg = spr.getContext('2d')!;
      footY = Math.round(H / 2 + 13 * P); dir = (START_SIDE as string) === 'right' ? -1 : 1;
      const k = CARD_H / IMG.ch;
      cw = IMG.cw * k * dpr; ch = CARD_H * dpr;
      cardWrap.style.width = IMG.w * k + 'px'; cardWrap.style.height = IMG.h * k + 'px';
      cardWrap.style.left = (Lw / 2 - IMG.w * k / 2) + 'px'; cardWrap.style.top = (footY / dpr - (IMG.py + IMG.ch) * k) + 'px';
      stopU = W / 2 - cw / 2 - 6 * P;
    }

    /* ---------- sound (synthesized placeholders) ---------- */
    let AC: AudioContext | null = null; const srcs: { stop(): void }[] = [];
    const ac = () => { if (!SOUND_ON) return null; try { AC = AC || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch { /* no audio */ } return AC; };
    const noise = (a: AudioContext, sec: number) => { const b = a.createBuffer(1, a.sampleRate * sec | 0, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = b; srcs.push(s); return s; };
    const playFile = (u: string) => { const a = new Audio(u); a.play().catch(() => {}); srcs.push({ stop() { a.pause(); } }); };
    const stopAudio = () => { srcs.forEach(s => { try { s.stop(); } catch { /* already stopped */ } }); srcs.length = 0; };
    function sfxFuse() {
      if (SFX_FUSE_URL) return playFile(SFX_FUSE_URL);
      const a = ac(); if (!a) return; const s = noise(a, FUSE_DURATION), f = a.createBiquadFilter(), g = a.createGain(), n = a.currentTime;
      f.type = 'highpass'; f.frequency.value = 3000; g.gain.setValueAtTime(0, n); g.gain.linearRampToValueAtTime(.2, n + .08); g.gain.linearRampToValueAtTime(.32, n + FUSE_DURATION);
      s.connect(f); f.connect(g); g.connect(a.destination); s.start();
    }
    function sfxBoom() {
      if (SFX_EXPLODE_URL) return playFile(SFX_EXPLODE_URL);
      const a = ac(); if (!a) return; const s = noise(a, 1.6), f = a.createBiquadFilter(), g = a.createGain(), o = a.createOscillator(), og = a.createGain(), n = a.currentTime;
      f.type = 'lowpass'; f.frequency.setValueAtTime(2200, n); f.frequency.exponentialRampToValueAtTime(60, n + 1.4);
      g.gain.setValueAtTime(.9, n); g.gain.exponentialRampToValueAtTime(.001, n + 1.5);
      o.frequency.setValueAtTime(110, n); o.frequency.exponentialRampToValueAtTime(30, n + .8); og.gain.setValueAtTime(.8, n); og.gain.exponentialRampToValueAtTime(.001, n + .9);
      s.connect(f); f.connect(g); g.connect(a.destination); o.connect(og); og.connect(a.destination); s.start(); o.start(); o.stop(n + 1);
    }

    /* ---------- explosion particles ---------- */
    const DEB = ['#e0b24a', '#f6d77a', '#a47a1e', '#0b1230', '#16224d', '#2f6bff', '#4d8dff'].concat(PAL), FIRE = ['#fff', '#ffe680', '#ffd84a', '#ff9a1f', '#ff5a14'], SMK = ['#444', '#666', '#888', '#aaa'];
    let parts: Part[] = [];
    interface Part { x: number; y: number; t: number; a: number; g: number; d: number; gr: number; vx?: number; vy?: number; s?: number; c?: string; l?: number; tile?: boolean; sx?: number; sy?: number; sw?: number; sh?: number; w?: number; h?: number; rot?: number; vr?: number; }
    function spawn() {
      const r = Math.random, cx0 = W / 2, cy0 = footY - ch / 2;
      const o = () => r() < .5 ? [dir > 0 ? stopU : W - stopU, footY - 13 * P] : [cx0, cy0];
      const add = (n: number, f: (a: number) => Partial<Part>) => { for (let i = 0; i < n; i++) { const [x, y] = o(), a = r() * 6.283; parts.push(Object.assign({ x, y, t: 0, a: 1, g: 0, d: 0, gr: 0 }, f(a))); } };
      const cols = 5, rows = 7;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = cx0 + ((i + .5) / cols - .5) * cw, y = footY - ch + (j + .5) / rows * ch, a = Math.atan2(y - cy0, x - cx0) + (r() - .5) * .6, v = (180 + r() * 520) * dpr;
        parts.push({ tile: true, sx: IMG.px + i * IMG.cw / cols, sy: IMG.py + j * IMG.ch / rows, sw: IMG.cw / cols, sh: IMG.ch / rows, w: cw / cols + 1, h: ch / rows + 1,
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 260 * dpr, g: 1500 * dpr, d: .4, rot: 0, vr: (r() - .5) * 10, t: 0, a: 1, gr: 0, s: 0, l: .9 + r() * .8 });
      }
      add(110, a => { const v = (120 + r() * 650) * dpr; return { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 220 * dpr, g: 1500 * dpr, d: .3, s: (.7 + r() * 1.3) * P, c: DEB[r() * DEB.length | 0], l: .9 + r() * .9 }; });
      add(50, a => { const v = (100 + r() * 500) * dpr; return { vx: Math.cos(a) * v, vy: Math.sin(a) * v, d: 2.2, s: (1 + r() * 2) * P, c: FIRE[r() * FIRE.length | 0], l: .3 + r() * .4 }; });
      add(7, a => ({ vx: 0, vy: 0, s: (8 + r() * 6) * P, c: FIRE[r() * 2 | 0], l: .25, gr: 40 * P }));
      add(28, a => { const v = (40 + r() * 220) * dpr; return { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50 * dpr, d: 1.4, s: (3 + r() * 3) * P, gr: 6 * P, c: SMK[r() * 4 | 0], l: .9 + r() * .7, a: .8 }; });
    }
    function drawParts(dt: number) {
      for (const p of parts) { p.t += dt; if (p.t >= (p.l ?? 1)) continue;
        p.vy = (p.vy ?? 0) + p.g * dt; p.x += (p.vx ?? 0) * dt; p.y += p.vy * dt; p.vx = (p.vx ?? 0) * (1 - p.d * dt); p.vy = p.vy * (1 - p.d * dt); p.s = (p.s ?? 0) + p.gr * dt;
        ctx.globalAlpha = Math.min(1, (1 - p.t / (p.l ?? 1)) * p.a * (p.tile ? 1.6 : 1));
        if (p.tile) { ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(p.rot = (p.rot ?? 0) + (p.vr ?? 0) * dt); ctx.imageSmoothingEnabled = true;
          ctx.drawImage(cardImg, p.sx!, p.sy!, p.sw!, p.sh!, -p.w! / 2, -p.h! / 2, p.w!, p.h!); ctx.restore(); ctx.imageSmoothingEnabled = false; continue; }
        ctx.fillStyle = p.c!; const s = Math.max(1, Math.round(p.s ?? 1)); ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s); }
      ctx.globalAlpha = 1;
    }

    /* ---------- timeline ---------- */
    let t0 = 0, last = 0, fph = 0, fused = false, boomed = false, done = false, shakeAt = 0, raf = 0;
    function explode(now: number) {
      boomed = true; stopAudio(); sfxBoom(); spawn(); shakeAt = now;
      cardWrap.style.display = 'none';
      flash.style.transition = 'none'; flash.style.opacity = '1';
      intro.style.background = 'transparent'; hint.style.display = 'none';
      revealRef.current();
      setTimeout(() => { flash.style.transition = 'opacity .8s ease-out'; flash.style.opacity = '0'; }, 90);
      setTimeout(finish, AFTER_BOOM * 1000);
    }
    function finish() { if (done) return; done = true; cancelAnimationFrame(raf); document.body.style.transform = ''; doneRef.current(); }
    function skip() { if (done) return; done = true; stopAudio(); cancelAnimationFrame(raf); document.body.style.transform = '';
      revealRef.current(); intro.style.transition = 'opacity .3s'; intro.style.opacity = '0'; setTimeout(() => intro.remove(), 320); doneRef.current(); }

    function step(now: number) {
      raf = requestAnimationFrame(step);
      if (!t0) t0 = last = now;
      const t = (now - t0) / 1e3, dt = Math.min(.05, (now - last) / 1e3); last = now;
      ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, W, H);
      if (!boomed) {
        const R = cw * .9, g = ctx.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, 'rgba(60,110,255,.28)'); g.addColorStop(1, 'rgba(60,110,255,0)');
        ctx.save(); ctx.translate(W / 2, footY); ctx.scale(1, .16); ctx.fillStyle = g; ctx.fillRect(-R, -R, 2 * R, 2 * R); ctx.restore(); }
      const tI = INTRO_DELAY, tL = tI + LOOK_DURATION, tR = tL + RUN_DURATION, tF = tR + FUSE_DURATION;
      let u = -4 * P, dx = 5 * P, ang = 0, yaw = 0, sc = 1, white = false, show = true;
      if (t < tI) show = false;
      else if (t < tL) { const a = t - tI, s = Math.min(1, a / .35), e = 1 - (1 - s) * (1 - s);
        u = (-5 + 6 * e) * P - 5 * P; yaw = yawAt(Math.max(0, (a - .35) / (LOOK_DURATION - .35))); }
      else if (t < tR) { const r = t - tL;
        u = -4 * P + (stopU + 4 * P) * r / RUN_DURATION; dx = 5 * P * Math.max(0, 1 - r / .3);
        ang = Math.sin(r * RUN_STRIDE_HZ * 6.2832) * LEG_SWING_DEG * Math.PI / 180 * Math.min(1, r / .1); }
      else if (!boomed) { u = stopU; dx = 0; const p = Math.min(1, (t - tR) / FUSE_DURATION);
        if (!fused) { fused = true; sfxFuse(); }
        fph += dt * (5 + 10 * p); white = (fph | 0) % 2 === 0; sc = 1 + .5 * p * p + .03 * p * Math.sin(p * 60);
        if (t >= tF) explode(now); }
      if (!boomed && show) {
        drawCreeper(ang, yaw, white, dx);
        ctx.save(); ctx.translate(Math.round(dir > 0 ? u : W - u), footY); ctx.scale(dir * sc, sc);
        ctx.drawImage(spr, -OX, -OY); ctx.restore();
      }
      drawParts(dt);
      if (shakeAt) { const k = (now - shakeAt) / 1e3 / SHAKE_TIME;
        if (k < 1) { const a = SHAKE_PX * (1 - k) * (1 - k); document.body.style.transform = `translate(${(Math.random() * 2 - 1) * a}px,${(Math.random() * 2 - 1) * a}px)`; }
        else { document.body.style.transform = ''; shakeAt = 0; } }
    }

    const onKey = (e: KeyboardEvent) => { if (['Escape', ' ', 'Enter'].includes(e.key)) skip(); };
    if (SKIP_ENABLED) { intro.addEventListener('pointerdown', skip); window.addEventListener('keydown', onKey); }
    else hint.style.display = 'none';
    window.addEventListener('resize', layout);
    layout(); raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', layout);
      window.removeEventListener('keydown', onKey);
      if (SKIP_ENABLED) intro.removeEventListener('pointerdown', skip);
      document.body.style.transform = '';
    };
  }, []);

  return (
    <div ref={wrapRef} className={className}>
      <div className="ik-intro" style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 100, overflow: 'hidden', cursor: 'pointer' }}>
        <div id="inFrame" style={{ position: 'absolute', left: '50%', top: '50%' }}>
          <div id="inCardWrap" style={{ position: 'absolute', perspective: 800 }}>
            <img id="inCard" alt="" src="/assets/ikout/home/intro-card.webp"
              style={{ display: 'block', width: '100%', height: '100%', transformOrigin: '50% 90%', animation: 'ik-infloat 5s ease-in-out infinite', willChange: 'transform' }} />
          </div>
          <canvas id="inCv" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
          <div id="inHint" style={{ position: 'absolute', left: 0, right: 0, bottom: 14, textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#fff', opacity: .45 }}>اضغط للتخطي</div>
        </div>
        <div id="inFlash" style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 0, pointerEvents: 'none' }} />
      </div>
    </div>
  );
};

function loadProfileId(): string {
  try {
    const raw = JSON.parse(localStorage.getItem('ikout_profile_v1') || '{}');
    return typeof raw.characterId === 'string' ? raw.characterId : 'a1';
  } catch { return 'a1'; }
}

export default SplashScreen;
