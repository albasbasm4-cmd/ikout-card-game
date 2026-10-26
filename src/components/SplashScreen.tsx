/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { preloadCharacterVoices } from '../utils/characterAudio';
import { PORTRAITS } from '../utils/profile';

export interface SplashScreenProps {
  onDone: () => void;
  className?: string;
}

/** Time the creeper needs at minimum so the walk is visible even on instant loads. */
const MIN_WALK_MS = 3000;
/** Hard ceiling: never trap the player on the splash if a resource stalls. */
const MAX_WAIT_MS = 9000;
/** Explosion length before the main menu appears. */
const EXPLOSION_MS = 1500;

const GREENS = ['#5ecb45', '#4fae37', '#429a2e', '#6ed44f', '#3d8a28'];

type PX = 'G' | 'K';

// Iconic creeper face, 8x8 (K = black): eyes rows 2-3, mouth rows 4-6 with two fangs at cols 2 and 5.
const FACE: PX[][] = [
  ['G','G','G','G','G','G','G','G'],
  ['G','G','G','G','G','G','G','G'],
  ['G','K','K','G','G','K','K','G'],
  ['G','K','K','G','G','K','K','G'],
  ['G','G','G','K','K','G','G','G'],
  ['G','G','K','K','K','K','G','G'],
  ['G','G','K','G','G','K','G','G'],
  ['G','G','G','G','G','G','G','G'],
];

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
}

/**
 * Opening splash: a fully black screen where a Minecraft creeper walks in from
 * the right edge toward the centre. Its pace follows the real game-resource
 * loading progress (no progress bar is shown). When it reaches the centre it
 * explodes in fire, then the main menu is revealed.
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({ onDone, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [exploding, setExploding] = useState(false);

  const progressRef = useRef(0);
  const walkRef = useRef(0);          // eased 0..1 walk position
  const startRef = useRef(0);
  const resourcesDoneRef = useRef(false);
  const explodingRef = useRef(false);
  const particlesRef = useRef<Particle[]>([]);
  const shakeRef = useRef(0);
  const flashRef = useRef(0);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Preload real game resources (character art + voice buffers) to drive progress.
  useEffect(() => {
    let cancelled = false;
    let total = 0;
    let loaded = 0;
    const bump = () => {
      loaded += 1;
      if (!cancelled && total > 0) {
        const p = Math.min(1, loaded / total);
        progressRef.current = p;
        setProgress(p);
      }
    };
    const loadImg = (src: string) => new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => { bump(); resolve(); };
      img.onerror = () => { bump(); resolve(); };
      img.src = src;
    });
    const images = PORTRAITS.map(loadImg);
    total = images.length;
    preloadCharacterVoices();
    // Voices decode in the background; count them into progress on a soft timer
    // so the walk still reflects real work without blocking on audio codecs.
    void Promise.allSettled(images).then(() => {
      if (!cancelled) {
        resourcesDoneRef.current = true;
        progressRef.current = 1;
        setProgress(1);
      }
    });
    const forceDone = setTimeout(() => {
      if (!cancelled) {
        resourcesDoneRef.current = true;
        progressRef.current = 1;
        setProgress(1);
      }
    }, MAX_WAIT_MS);
    startRef.current = performance.now();
    return () => { cancelled = true; clearTimeout(forceDone); };
  }, []);

  // Render loop: black screen, walking creeper, explosion, reveal.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current();
    };

    const spawnExplosion = (cx: number, cy: number) => {
      const colors = ['#fff7ae', '#ffd24a', '#ff9b21', '#ff6a00', '#e63b0c', '#a83a00'];
      for (let i = 0; i < 160; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 120 + Math.random() * 520;
        particlesRef.current.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 120,
          life: 0,
          maxLife: 700 + Math.random() * 700,
          size: 3 + Math.random() * 9,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
      flashRef.current = 1;
      shakeRef.current = 1;
    };

    const drawCreeper = (px: number, py: number, unit: number, t: number) => {
      // Build the creeper body pixel grid once per frame (cheap, 8x25 cells).
      const bob = Math.sin(t / 130) * unit * 0.5;
      const legSwing = Math.sin(t / 130) * unit * 0.9;
      const draw = (cx: number, cy: number, shade: string) => {
        ctx.fillStyle = shade;
        ctx.fillRect(cx, cy, unit + 0.5, unit + 0.5);
      };
      // Head (8x8)
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const cell = FACE[r][c];
          const shade = cell === 'K' ? '#101c0b' : GREENS[(r * 8 + c) % GREENS.length];
          draw(px + c * unit, py + bob + r * unit, shade);
        }
      }
      // Body (8x12)
      for (let r = 0; r < 12; r++) {
        for (let c = 0; c < 8; c++) {
          const shade = GREENS[(r * 5 + c * 3 + 2) % GREENS.length];
          draw(px + c * unit, py + bob + (8 + r) * unit, shade);
        }
      }
      // Legs: two front stubs alternating while walking
      ctx.fillStyle = '#3d8a28';
      ctx.fillRect(px + unit * 0.5 + legSwing, py + bob + 20 * unit, unit * 2.4, unit * 4.5);
      ctx.fillRect(px + unit * 5.1 - legSwing, py + bob + 20 * unit, unit * 2.4, unit * 4.5);
    };

    const frame = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const w = canvas.width, h = canvas.height;
      const unit = Math.max(4, Math.floor(h / 42));
      const spriteW = 8 * unit;
      const startX = w + spriteW;
      const endX = w / 2 - spriteW / 2;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      if (!explodingRef.current) {
        // Eased walk toward the real loading progress; always creeping forward.
        const target = Math.max(progressRef.current, walkRef.current);
        const rate = 1 - Math.pow(0.001, dt / 1000); // smooth, frame-rate independent
        walkRef.current += (target - walkRef.current) * rate * 0.9;
        if (walkRef.current > 0.999) walkRef.current = 1;
        const elapsed = now - startRef.current;
        const ready =
          walkRef.current >= 0.999 &&
          resourcesDoneRef.current &&
          elapsed >= MIN_WALK_MS;
        if (ready) {
          explodingRef.current = true;
          setExploding(true);
          spawnExplosion(w / 2, h / 2 - 12 * unit);
          setTimeout(finish, EXPLOSION_MS);
        } else {
          const x = startX + (endX - startX) * walkRef.current;
          const y = h / 2 - 12 * unit;
          drawCreeper(x, y, unit, now);
        }
      } else {
        // Explosion: fire particles + flash + shake, creeper is gone.
        const shake = shakeRef.current * 14 * dpr;
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        const cx = w / 2, cy = h / 2 - 12 * unit;
        for (const p of particlesRef.current) {
          p.life += dt;
          p.vy += 620 * (dt / 1000);
          p.x += p.vx * (dt / 1000);
          p.y += p.vy * (dt / 1000);
          const k = 1 - p.life / p.maxLife;
          if (k <= 0) continue;
          ctx.globalAlpha = Math.max(0, k);
          ctx.fillStyle = p.color;
          const s = p.size * dpr * (0.5 + k);
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
        particlesRef.current = particlesRef.current.filter(p => p.life < p.maxLife);
        if (flashRef.current > 0) {
          ctx.fillStyle = `rgba(255,214,120,${flashRef.current * 0.85})`;
          ctx.fillRect(-40, -40, w + 80, h + 80);
          flashRef.current = Math.max(0, flashRef.current - dt / 400);
        }
        shakeRef.current = Math.max(0, shakeRef.current - dt / 900);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[100] bg-black ${className}`}
      aria-label="شاشة البداية"
      role="img"
    >
      <canvas ref={canvasRef} className="w-full h-full block" style={{ width: '100%', height: '100%' }} />
      {/* No progress bar by design: the screen stays fully black, only the creeper moves. */}
      <span className="sr-only" aria-live="polite">{`جارٍ تحميل الموارد ${Math.round(progress * 100)}٪`}</span>
    </div>
  );
};

export default SplashScreen;
