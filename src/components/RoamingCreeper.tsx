/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

export interface RoamingCreeperProps {
  className?: string;
}

export const RoamingCreeper: React.FC<RoamingCreeperProps> = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stage = document.getElementById('st');
    if (!stage) return;

    /* --- canvas layer --- */
    const cv = document.createElement('canvas');
    cv.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated;z-index:4;cursor:default';
    stage.appendChild(cv);

    /* tap target for accessibility / keyboard support */
    const tap = document.createElement('div');
    tap.id = 'greenCreeperTap';
    tap.setAttribute('role', 'button');
    tap.setAttribute('aria-label', 'الكريبر الأخضر');
    tap.tabIndex = 0;
    tap.style.cssText = 'position:absolute;z-index:30;cursor:pointer;touch-action:manipulation;pointer-events:none;';
    stage.appendChild(tap);

    /* screen-2 overlay */
    const s2 = document.createElement('div');
    s2.id = 'aboutScreen';
    s2.setAttribute('aria-label', 'about us');
    s2.style.cssText =
      'position:fixed;inset:0;z-index:60;background:#000;opacity:0;pointer-events:none;overflow:hidden;transition:none;--about-foreground:#fff';
    s2.innerHTML =
      '<h1 id="aboutTitle" dir="ltr" style="position:absolute;left:5%;right:5%;top:clamp(8px,2.2vmin,25px);margin:0;text-align:center;color:var(--about-foreground);font-family:Cairo,sans-serif;font-weight:800;font-size:clamp(20px,5.5vmin,44px);letter-spacing:0;opacity:0">about us</h1>' +
      '<img id="aboutPortrait" alt="الصورة الشخصية" draggable="false" style="position:absolute;left:7.5%;top:clamp(52px,12vmin,90px);width:85%;height:calc(100% - clamp(52px,12vmin,90px));object-fit:cover;object-position:center 15%;display:block;border-radius:24px;cursor:pointer;box-shadow:0 10px 40px rgba(0,0,0,.5);z-index:2" src="/about-photo.jpg">' +
      '<audio id="aboutMusic" preload="auto" src="/careless-whisper.mp3"></audio>' +
      '<button id="aboutHome" aria-label="الرئيسية" style="position:absolute;right:clamp(16px,3.5vmin,28px);top:clamp(12px,2.5vmin,22px);width:clamp(38px,6.2vmin,48px);height:clamp(38px,6.2vmin,48px);border-radius:50%;border:2px solid rgba(77,243,255,.45);background:linear-gradient(135deg,rgba(60,188,255,.25),rgba(14,134,224,.45));box-shadow:0 2px 10px rgba(10,90,156,.35);cursor:pointer;display:grid;place-items:center;padding:0;z-index:3;opacity:0;pointer-events:none;transform:scale(0.85);transition:opacity .5s ease,transform .5s cubic-bezier(.34,1.56,.64,1)"><svg viewBox="0 0 24 24" width="55%" height="55%" fill="#fff"><path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z"/></svg></button>' +
      '<div id="aboutText" dir="ltr"></div>';
    s2.dataset['phase'] = 'idle';
    document.body.appendChild(s2);

    function fitAbout() {
      const portrait = window.innerHeight > window.innerWidth;
      s2.style.inset = 'auto';
      s2.style.left = '50%';
      s2.style.top = '50%';
      s2.style.width = (portrait ? window.innerHeight : window.innerWidth) + 'px';
      s2.style.height = (portrait ? window.innerWidth : window.innerHeight) + 'px';
      s2.style.transform = 'translate(-50%,-50%)' + (portrait ? ' rotate(90deg)' : '');
      s2.dataset['orientation'] = portrait ? 'rotated-landscape' : 'landscape';
    }
    window.addEventListener('resize', fitAbout);
    fitAbout();

    /* --- sizing: sync with the stage (1536×691 logical space) --- */
    const SW = 1536,
      SH = 691;
    const CREEPER_H = 110;
    const P = Math.round(CREEPER_H / 26);

    cv.width = SW;
    cv.height = SH;

    /* --- textures --- */
    const PAL = [
      '#0a3a0e',
      '#0a4d12',
      '#0e6b17',
      '#13871f',
      '#13871f',
      '#1da12a',
      '#1da12a',
      '#2ab636',
      '#2ab636',
      '#3fcf45',
      '#63df5c',
      '#b4ecbf',
    ];
    const rng = (seed: number) => {
      let a = seed;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    function tex(w: number, h: number, seed: number) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!,
        r = rng(seed),
        m: number[][] = [];
      for (let y = 0; y < h; y++) {
        m[y] = [];
        for (let x = 0; x < w; x++) {
          const n = x && r() < 0.45 ? m[y][x - 1] : y && r() < 0.45 ? m[y - 1][x] : null;
          const i =
            n !== null
              ? Math.max(0, Math.min(PAL.length - 1, n + Math.round((r() - 0.5) * 3)))
              : Math.floor(r() * PAL.length);
          m[y][x] = i;
          g.fillStyle = PAL[i];
          g.fillRect(x, y, 1, 1);
        }
      }
      return c;
    }
    const darken = (c: HTMLCanvasElement) => {
      const d = document.createElement('canvas');
      d.width = c.width;
      d.height = c.height;
      const g = d.getContext('2d')!;
      g.drawImage(c, 0, 0);
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.fillRect(0, 0, d.width, d.height);
      return d;
    };
    const FACE = [
      '........',
      '........',
      '.##..##.',
      '.##..##.',
      '...##...',
      '..####..',
      '..####..',
      '..#..#..',
    ];
    const T = {
      front: tex(8, 8, 11),
      side: tex(8, 8, 12),
      body: tex(4, 12, 14),
      legN: tex(4, 6, 15),
      legF: null as HTMLCanvasElement | null,
    };
    {
      const g = T.front.getContext('2d')!;
      g.fillStyle = '#050505';
      FACE.forEach((row, y) => [...row].forEach((c, x) => c === '#' && g.fillRect(x, y, 1, 1)));
    }
    T.legF = darken(T.legN);

    /* --- sprite offscreen canvas --- */
    const OW = 28 * P,
      OH = 30 * P,
      OX = 10 * P,
      OY = 28 * P;
    const spr = document.createElement('canvas');
    spr.width = OW;
    spr.height = OH;
    const sg = spr.getContext('2d')!;

    function drawStanding(white: boolean, br: number) {
      sg.clearRect(0, 0, OW, OH);
      sg.imageSmoothingEnabled = false;
      const legH = 6 * P,
        by = OY - legH - 12 * P + Math.round(br * P);
      sg.drawImage(T.legF!, OX - 4 * P, OY - legH, 4 * P, legH);
      sg.drawImage(T.legF!, OX, OY - legH, 4 * P, legH);
      sg.drawImage(T.body, OX - 4 * P, by, 8 * P, 12 * P);
      sg.drawImage(T.front, 0, 0, 8, 8, OX - 4 * P, by - 8 * P, 8 * P, 8 * P);
      if (white) {
        sg.globalCompositeOperation = 'source-atop';
        sg.fillStyle = 'rgba(255,255,255,.95)';
        sg.fillRect(0, 0, OW, OH);
        sg.globalCompositeOperation = 'source-over';
      }
    }

    function drawWalking(legP: number, br: number, facingDir: number) {
      sg.clearRect(0, 0, OW, OH);
      sg.imageSmoothingEnabled = false;
      const legH = 6 * P;
      const by = OY - legH - 12 * P + Math.round(br * P);
      const swing = Math.sin(legP) * 2.2 * P;

      // Legs swing
      sg.drawImage(T.legF!, OX - 4 * P - swing, OY - legH, 4 * P, legH);
      sg.drawImage(T.legF!, OX + swing, OY - legH, 4 * P, legH);
      // Body
      sg.drawImage(T.body, OX - 4 * P, by, 8 * P, 12 * P);
      // Head
      const headTex = facingDir < 0 ? T.side : T.front;
      sg.drawImage(headTex, 0, 0, 8, 8, OX - 4 * P, by - 8 * P, 8 * P, 8 * P);
    }

    /* --- explosion particles --- */
    const DEB_COLS = [
      '#e0b24a',
      '#f6d77a',
      '#a47a1e',
      '#0b1230',
      '#16224d',
      '#2f6bff',
      '#4d8dff',
    ].concat(PAL);
    const FIRE_COLS = ['#fff', '#ffe680', '#ffd84a', '#ff9a1f', '#ff5a14'];
    const SMK_COLS = ['#444', '#666', '#888', '#aaa'];
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      t: number;
      l: number;
      g: number;
      d: number;
      gr: number;
      s: number;
      c: string;
      a: number;
    }
    let parts: Particle[] = [];

    function spawnBoom(cx: number, cy: number) {
      const r = Math.random;
      const add = (n: number, f: (a: number) => Partial<Particle>) => {
        for (let i = 0; i < n; i++) {
          const a = r() * 6.2832;
          parts.push(
            Object.assign(
              { x: cx, y: cy, vx: 0, vy: 0, t: 0, a: 1, g: 0, d: 0, gr: 0, s: 1, c: '#fff', l: 1 },
              f(a),
            ),
          );
        }
      };
      add(80, (a) => {
        const v = 120 + r() * 500;
        return {
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 200,
          g: 1400,
          d: 0.3,
          s: 0.7 + r() * 1.2,
          c: DEB_COLS[(r() * DEB_COLS.length) | 0],
          l: 0.8 + r() * 0.8,
        };
      });
      add(40, (a) => {
        const v = 100 + r() * 400;
        return {
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          d: 2,
          s: 1 + r() * 2,
          c: FIRE_COLS[(r() * FIRE_COLS.length) | 0],
          l: 0.3 + r() * 0.35,
        };
      });
      add(20, (a) => {
        const v = 30 + r() * 160;
        return {
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 40,
          d: 1.2,
          s: 2.5 + r() * 2.5,
          gr: 5,
          c: SMK_COLS[(r() * 4) | 0],
          l: 0.8 + r() * 0.6,
          a: 0.8,
        };
      });
    }

    function drawParts(ctx2: CanvasRenderingContext2D, dt: number) {
      for (const p of parts) {
        p.t += dt;
        if (p.t >= p.l) continue;
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - p.d * dt;
        p.vy *= 1 - p.d * dt;
        p.s += p.gr * dt;
        ctx2.globalAlpha = Math.min(1, (1 - p.t / p.l) * p.a);
        ctx2.fillStyle = p.c;
        const s = Math.max(1, Math.round(p.s));
        ctx2.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      }
      ctx2.globalAlpha = 1;
      parts = parts.filter((p) => p.t < p.l);
    }

    /* --- state machine --- */
    const STAND_X = 1440;
    const START_X = 1580; // starts outside right edge (SW=1536)
    const FOOT_Y = 612;
    let cx = START_X,
      dir = -1;
    let state: 'entering' | 'look' | 'exploding' | 'screen2' = 'entering';
    let legPhase = 0;
    let fusingT = 0,
      fusePhase = 0;
    const FUSE_DUR = 1.5; // turns white for 1.5s before exploding
    let exploded = false;
    let screen2Visible = false;

    const aboutPortrait = s2.querySelector('#aboutPortrait') as HTMLImageElement;
    const aboutTitle = s2.querySelector('#aboutTitle') as HTMLElement;
    const aboutMusic = s2.querySelector('#aboutMusic') as HTMLAudioElement;
    const aboutHome = s2.querySelector('#aboutHome') as HTMLElement;
    const aboutText = s2.querySelector('#aboutText') as HTMLElement;

    const ABOUT_MUSIC_START = 1.31;
    aboutMusic.addEventListener('loadedmetadata', () => {
      aboutMusic.currentTime = ABOUT_MUSIC_START;
    });
    if (aboutMusic.readyState >= 1) aboutMusic.currentTime = ABOUT_MUSIC_START;
    aboutPortrait.decode().catch(() => {});

    buildAboutText(aboutText);

    /* ---------- Smooth, stable scroll & touch-drag handling for About Us ---------- */
    let lastTouchX = 0,
      lastTouchY = 0,
      lastTouchTime = 0;
    let scrollVelocity = 0,
      momentumRaf = 0;
    let isDraggingScroll = false;

    let autoScrollRaf = 0,
      autoScrollTimer = 0,
      autoScrollActive = false;
    let textTouched = false;

    function stopAutoScroll() {
      if (autoScrollTimer) {
        clearTimeout(autoScrollTimer);
        autoScrollTimer = 0;
      }
      if (autoScrollRaf) {
        cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = 0;
      }
      autoScrollActive = false;
    }

    let autoScrollPos = 0;
    function startAutoScroll() {
      stopAutoScroll();
      if (s2.dataset['phase'] !== 'icon' || textTouched) return;
      autoScrollActive = true;
      autoScrollPos = aboutText.scrollTop;
      let lastT = performance.now();
      const speed = 28; // gentle, steady reading pace (px/sec)

      function stepAuto(now: number) {
        if (!autoScrollActive || s2.dataset['phase'] !== 'icon' || textTouched) {
          stopAutoScroll();
          return;
        }
        const dt = (now - lastT) / 1000;
        lastT = now;
        if (dt > 0 && dt < 0.2) {
          autoScrollPos += speed * dt;
          aboutText.scrollTop = autoScrollPos;
          if (aboutText.scrollTop + aboutText.clientHeight >= aboutText.scrollHeight - 2) {
            stopAutoScroll();
            return;
          }
        }
        autoScrollRaf = requestAnimationFrame(stepAuto);
      }
      autoScrollRaf = requestAnimationFrame(stepAuto);
    }

    function onUserInterruptScroll() {
      textTouched = true;
      stopAutoScroll();
    }

    aboutText.addEventListener('pointerdown', onUserInterruptScroll, { capture: true, passive: true });
    aboutText.addEventListener('touchstart', onUserInterruptScroll, { capture: true, passive: true });
    aboutText.addEventListener('mousedown', onUserInterruptScroll, { capture: true, passive: true });

    function stopMomentum() {
      if (momentumRaf) {
        cancelAnimationFrame(momentumRaf);
        momentumRaf = 0;
      }
    }

    function handleWheel(e: WheelEvent) {
      if (s2.dataset['phase'] !== 'icon') return;
      onUserInterruptScroll();
      const isRotated = s2.dataset['orientation'] === 'rotated-landscape';
      const delta = isRotated
        ? Math.abs(e.deltaY) >= Math.abs(e.deltaX)
          ? e.deltaY
          : e.deltaX
        : Math.abs(e.deltaY) >= Math.abs(e.deltaX)
          ? e.deltaY
          : e.deltaX;
      aboutText.scrollTop += delta;
    }
    s2.addEventListener('wheel', handleWheel, { passive: true });

    function onTouchStart(e: TouchEvent | MouseEvent) {
      if (s2.dataset['phase'] !== 'icon') return;
      onUserInterruptScroll();
      const touch = (e as TouchEvent).touches ? (e as TouchEvent).touches[0] : (e as MouseEvent);
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
      lastTouchTime = performance.now();
      scrollVelocity = 0;
      isDraggingScroll = true;
      stopMomentum();
    }

    function onTouchMove(e: TouchEvent | MouseEvent) {
      if (!isDraggingScroll || s2.dataset['phase'] !== 'icon') return;
      const touch = (e as TouchEvent).touches ? (e as TouchEvent).touches[0] : (e as MouseEvent);
      const curX = touch.clientX;
      const curY = touch.clientY;
      const now = performance.now();
      const dt = Math.max(1, now - lastTouchTime);

      const isRotated = s2.dataset['orientation'] === 'rotated-landscape';
      const dy = lastTouchY - curY;
      const dx = lastTouchX - curX;
      const delta = isRotated ? (Math.abs(dy) >= Math.abs(dx) ? dy : dx) : dy;

      if (Math.abs(delta) > 0.5) {
        aboutText.scrollTop += delta;
        scrollVelocity = delta / dt;
        lastTouchX = curX;
        lastTouchY = curY;
        lastTouchTime = now;
        if (e.cancelable && e.type === 'touchmove') e.preventDefault();
      }
    }

    function onTouchEnd() {
      if (!isDraggingScroll) return;
      isDraggingScroll = false;
      if (Math.abs(scrollVelocity) > 0.15) {
        let v = scrollVelocity * 16;
        const friction = 0.95;
        function stepMomentum() {
          if (Math.abs(v) < 0.5 || s2.dataset['phase'] !== 'icon') {
            momentumRaf = 0;
            return;
          }
          aboutText.scrollTop += v;
          v *= friction;
          momentumRaf = requestAnimationFrame(stepMomentum);
        }
        momentumRaf = requestAnimationFrame(stepMomentum);
      }
    }

    s2.addEventListener('touchstart', onTouchStart, { passive: true });
    s2.addEventListener('touchmove', onTouchMove as any, { passive: false });
    s2.addEventListener('touchend', onTouchEnd, { passive: true });
    s2.addEventListener('touchcancel', onTouchEnd, { passive: true });

    /* ---------- About Us story text ---------- */
    function buildAboutText(box: HTMLElement) {
      const CSS = [
        '#aboutText{position:absolute;left:7.5%;right:7.5%;top:clamp(52px,12vmin,90px);bottom:0;overflow-y:auto;overflow-x:hidden;touch-action:pan-y;scroll-behavior:auto;overscroll-behavior:contain;',
        'padding:12px clamp(12px,3vmin,44px) 80px;color:#fff;text-align:center;opacity:0;pointer-events:none;z-index:1;',
        'scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.35) transparent;-webkit-overflow-scrolling:touch}',
        '#aboutText::-webkit-scrollbar{width:8px}',
        '#aboutText::-webkit-scrollbar-track{background:transparent}',
        '#aboutText::-webkit-scrollbar-thumb{background:rgba(255,255,255,.3);border-radius:4px}',
        '#aboutText .inner{max-width:980px;margin:0 auto}',
        '#aboutText .tagline{font-family:Cairo,sans-serif;font-weight:900;font-size:clamp(16px,4.2vmin,34px);line-height:1.5;color:#4df3ff;margin:10px 0 8px;text-shadow:0 2px 0 rgba(0,0,0,.45)}',
        '#aboutText h2{font-family:Cairo,sans-serif;font-weight:800;font-size:clamp(15px,3.6vmin,30px);line-height:1.35;color:#4df3ff;margin:34px 0 12px;padding-bottom:8px;border-bottom:2px solid rgba(77,243,255,.25)}',
        '#aboutText h3{font-family:Cairo,sans-serif;font-weight:800;font-size:clamp(14px,3.1vmin,26px);line-height:1.35;margin:24px 0 8px;color:#fff}',
        '#aboutText p{font-family:Cairo,sans-serif;font-weight:600;font-size:clamp(12px,2.5vmin,21px);line-height:1.8;color:rgba(255,255,255,.93);margin:0 0 14px}',
        '#aboutText ul{text-align:left;display:inline-block;margin:0 auto 14px;padding-left:26px}',
        '#aboutText li{font-family:Cairo,sans-serif;font-weight:600;font-size:clamp(12px,2.5vmin,21px);line-height:1.7;color:rgba(255,255,255,.93);margin-bottom:8px}',
        '#aboutText .quote{font-family:Cairo,sans-serif;font-weight:800;font-size:clamp(13px,2.7vmin,23px);line-height:1.6;color:#ffd84a;margin:16px 0}',
        '#aboutText .credits{display:inline-block;text-align:left;background:rgba(255,255,255,.07);border:1px solid rgba(77,243,255,.3);border-radius:16px;padding:14px 26px;margin:4px 0 16px}',
        '#aboutText .credits div{font-family:Cairo,sans-serif;font-weight:700;font-size:clamp(12px,2.5vmin,21px);line-height:1.9}',
        '#aboutText .credits b{color:#4df3ff}',
        '#aboutText .motto{font-family:Cairo,sans-serif;font-weight:900;font-size:clamp(14px,3.1vmin,26px);line-height:1.5;color:#4df3ff;margin:20px 0 8px}',
        '#aboutText .copyright{margin-top:38px;font-family:Cairo,sans-serif;font-weight:700;font-size:clamp(11px,2.3vmin,19px);line-height:1.4;color:rgba(255,255,255,.65)}',
      ].join('');

      const p = (t: string) => '<p>' + t + '</p>';
      const ul = (items: string[]) => '<ul>' + items.map((i) => '<li>' + i + '</li>').join('') + '</ul>';
      const h2 = (t: string) => '<h2>' + t + '</h2>';
      const h3 = (t: string) => '<h3>' + t + '</h3>';

      const html = [
        '<style>' + CSS + '</style>',
        '<div class="inner">',
        '<div class="tagline">Preserving Local Traditions.<br>Bringing People Together.</div>',
        h2('Our Story'),
        p('This game was created with a simple yet meaningful purpose: to preserve traditional local card games and bring them into the digital world.'),
        p('Developed around the rules, names, and playing styles familiar to our community, this project aims to maintain the original spirit of these games while making them more accessible through modern technology.'),
        p('Our primary goal is to provide a convenient local multiplayer experience that allows friends and family to enjoy their favorite card games together without the need to carry or bring physical cards.'),
        p('The game serves as a temporary and convenient digital alternative to physical card games, allowing players to access their favorite games whenever and wherever they want, using their devices.'),
        p('We believe technology should make traditional experiences more accessible without taking away what makes them special.'),
        h2('Our Local Gaming Identity'),
        p('Card games often have different names, rules, and variations depending on the region and community in which they are played. We believe these local differences deserve recognition and preservation.'),
        p('Rather than replacing our traditional terminology with internationally recognized names, we have chosen to retain the names and rules that are familiar to our community.'),
        p('Some examples include:'),
        ul([
          '<b>Tarb (ترب)</b>: Our local name for the game commonly known as Kout.',
          '<b>187</b>: The name by which this particular game is locally recognized in our community.',
          '<b>Bu Ghad (بو غض)</b>: Our local variation of the game commonly known as UNO Joker.',
        ]),
        p('These names represent more than just different games. They reflect our community’s gaming culture, shared experiences, and traditions.'),
        h2('Understanding Our Games'),
        h3('Bu Ghad (بو غض)'),
        p('One of the distinctive features of our local gaming culture is the unique way Bu Ghad is played.'),
        p('The game revolves around the Joker card and a special interaction involving observation, deception, and subtle communication between players.'),
        p('The player holding the Joker must discreetly signal to the player sitting opposite them through a gesture locally known as <b>Ghad</b>. The challenge is to communicate this signal without being detected by the other players.'),
        p('The game continues until only one player remains. At that point, the final player gets one last opportunity to identify the person holding the Joker.'),
        ul([
          'If the identification is correct, the Joker holder loses.',
          'If the identification is incorrect, the final player loses instead.',
        ]),
        p('This distinctive mechanic gives our local version its own character and makes it different from other variations of the game.'),
        h2('Our Vision & Mission'),
        p('Our vision is to preserve traditional local card games and make them accessible to future generations through modern technology, without losing the unique rules, names, and social experiences that define them.'),
        p('Our mission is to create a convenient and enjoyable digital environment where traditional games can continue to bring people together.'),
        p('We aim to keep improving the experience while respecting the original identity of every game we introduce.'),
        h2('Player-Created Challenges'),
        p('We recognize that part of the enjoyment of multiplayer games comes from the creativity and friendly competition between players.'),
        p('Players are free to introduce their own personal challenges, friendly competitions, or additional rules while playing together.'),
        p('However, these activities are entirely optional, are not part of the official game rules, and are independently arranged by the players.'),
        p('Any additional challenges must remain consistent with our responsible entertainment principles and must never involve gambling or financial stakes.'),
        h2('Responsible Entertainment & No-Gambling Policy'),
        p('This game was developed exclusively for entertainment, social interaction, and the preservation of local gaming traditions. It is not intended to facilitate gambling or betting in any form.'),
        p('Gambling and betting are strictly prohibited in connection with this game.'),
        p('Players must not use the game for financial wagers, monetary challenges, or competitions involving money or anything of monetary value.'),
        p('This prohibition also extends to indirect or informal arrangements that effectively constitute gambling, including playing for a predetermined cash prize, betting a specific amount, or making financial commitments based on the outcome of a match.'),
        p('All player-created challenges and competitions must remain purely recreational and must never involve financial stakes or gambling-related arrangements.'),
        p('Our intention is to maintain an enjoyable environment where competition remains friendly and the purpose of playing remains entertainment.'),
        h2('Fair Play & Respect'),
        p('We believe that the true value of a game lies in the experience, not merely in winning.'),
        p('We encourage fair play, mutual respect, honesty, and friendly competition. Every player should have the opportunity to enjoy the game in a respectful and welcoming environment.'),
        p('Winning is part of the competition, but respect and enjoyment should always come first.'),
        h2('Community & Feedback'),
        p('This project is continuously evolving, and player feedback plays an important role in its development.'),
        p('We welcome suggestions, constructive criticism, and new ideas that can help improve the gaming experience while preserving the original local rules and identity of each game.'),
        p('Your feedback helps us identify what works, what needs improvement, and what new features could make the experience better for everyone.'),
        h2('Privacy & Data'),
        p('We believe players should have a clear understanding of how their information is handled.'),
        p('We are committed to respecting user privacy and handling personal information responsibly. We encourage players to understand how their information may be collected, used, and protected through the game’s applicable privacy practices.'),
        h2('Project Credits & Release Information'),
        '<div class="credits">' +
          '<div><b>Project Name:</b> Ikout</div>' +
          '<div><b>Designed and Developed by:</b> Al-Abbas</div>' +
          '<div><b>Year of Release:</b> 2026</div>' +
          '<div><b>Release Date:</b> October 31, 2026</div>' +
        '</div>',
        p('This game was independently designed and developed by Al-Abbas and released in 2026.'),
        p('It is primarily intended for local multiplayer use, serving as a convenient digital alternative to physical card games.'),
        p('Its purpose is to provide players with temporary, on-demand access to their favorite local card games without the need to carry or bring physical cards.'),
        p('The game is designed to complement the traditional playing experience, not to replace the social value and enjoyment of playing together in person.'),
        '<div class="quote">A digital alternative to physical cards, wherever and whenever you need it.</div>',
        h2('Thank You for Being Part of Our Journey'),
        p('Thank you for taking the time to explore and play our game.'),
        p('Whether you are revisiting familiar games, introducing them to new friends, or simply enjoying a multiplayer session, we hope this experience brings people together and helps keep our local traditions alive in a modern digital format.'),
        p('Your enjoyment and support encourage us to continue developing and improving the game.'),
        '<div class="motto">Play Together. Enjoy Responsibly. Keep Our Traditions Alive.</div>',
        '<div class="copyright">© 2026 Al-Abbas. All rights reserved.</div>',
        '</div>',
      ].join('');

      box.innerHTML = html;
    }

    tap.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (state === 'look') startExplosion();
    });
    tap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (state === 'look') startExplosion();
      }
    });

    const POS = {
      big: {
        left: '7.5%',
        top: 'clamp(52px,12vmin,90px)',
        width: '85%',
        height: 'calc(100% - clamp(52px,12vmin,90px))',
        borderRadius: '24px',
      },
      icon: {
        left: '18px',
        top: '18px',
        width: 'clamp(56px,12vmin,100px)',
        height: 'clamp(56px,12vmin,100px)',
        borderRadius: '50%',
      },
    };
    let aboutTimer = 0;
    let userTouched = false;

    function setPos(k: 'big' | 'icon', animate: boolean) {
      aboutPortrait.style.transition = animate
        ? 'left 1.5s cubic-bezier(.4,0,.2,1),top 1.5s cubic-bezier(.4,0,.2,1),width 1.5s cubic-bezier(.4,0,.2,1),height 1.5s cubic-bezier(.4,0,.2,1),border-radius 1.5s'
        : 'none';
      Object.assign(aboutPortrait.style, POS[k]);
      s2.dataset['phase'] = k;
      aboutTitle.style.transition = 'opacity .6s';
      aboutTitle.style.opacity = '1';
      const showText = k === 'icon';
      aboutText.style.transition = showText ? 'opacity .9s ease .35s' : 'opacity .45s ease';
      aboutText.style.opacity = showText ? '1' : '0';
      aboutText.style.pointerEvents = showText ? 'auto' : 'none';

      if (aboutHome) {
        aboutHome.style.transition = showText
          ? 'opacity .6s ease .3s, transform .6s cubic-bezier(.34,1.56,.64,1) .3s'
          : 'opacity .3s ease, transform .3s ease';
        aboutHome.style.opacity = showText ? '1' : '0';
        aboutHome.style.pointerEvents = showText ? 'auto' : 'none';
        aboutHome.style.transform = showText ? 'scale(1)' : 'scale(0.85)';
      }
      if (showText) {
        if (autoScrollTimer) clearTimeout(autoScrollTimer);
        const delay = animate ? 1600 : 250;
        autoScrollTimer = window.setTimeout(() => {
          if (s2.dataset['phase'] === 'icon' && !textTouched) {
            startAutoScroll();
          }
        }, delay);
      } else {
        stopAutoScroll();
      }
    }

    function playFuseHiss() {
      try {
        const A = ((window as any).__bAC =
          (window as any).__bAC ||
          new (window.AudioContext || (window as any).webkitAudioContext)());
        if (A.state === 'suspended') A.resume();
        const n = A.currentTime;
        const dur = 1.5;
        const b = A.createBuffer(1, (A.sampleRate * dur) | 0, A.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.45;
        const src = A.createBufferSource();
        src.buffer = b;
        const filter = A.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(3200, n);
        filter.Q.setValueAtTime(2.2, n);
        const gain = A.createGain();
        gain.gain.setValueAtTime(0.08, n);
        gain.gain.linearRampToValueAtTime(0.4, n + 1.2);
        gain.gain.linearRampToValueAtTime(0.01, n + dur);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(A.destination);
        src.start();
      } catch (e) {}
    }

    function playBoomAudio() {
      try {
        const A = ((window as any).__bAC =
          (window as any).__bAC ||
          new (window.AudioContext || (window as any).webkitAudioContext)());
        if (A.state === 'suspended') A.resume();
        const n = A.currentTime,
          b = A.createBuffer(1, (A.sampleRate * 1.6) | 0, A.sampleRate),
          d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const s = A.createBufferSource(),
          f = A.createBiquadFilter(),
          g = A.createGain(),
          o = A.createOscillator(),
          og = A.createGain();
        s.buffer = b;
        f.type = 'lowpass';
        f.frequency.setValueAtTime(2200, n);
        f.frequency.exponentialRampToValueAtTime(60, n + 1.4);
        g.gain.setValueAtTime(0.9, n);
        g.gain.exponentialRampToValueAtTime(0.001, n + 1.5);
        o.frequency.setValueAtTime(110, n);
        o.frequency.exponentialRampToValueAtTime(30, n + 0.8);
        og.gain.setValueAtTime(0.8, n);
        og.gain.exponentialRampToValueAtTime(0.001, n + 0.9);
        s.connect(f);
        f.connect(g);
        g.connect(A.destination);
        o.connect(og);
        og.connect(A.destination);
        s.start();
        o.start();
        o.stop(n + 1);
      } catch (e) {}

      aboutMusic.currentTime = ABOUT_MUSIC_START;
      aboutMusic.play().catch(() => {
        s2.dataset['audio'] = 'blocked';
      });
    }

    function startExplosion() {
      if (screen2Visible || state === 'exploding' || state === 'entering') return;
      state = 'exploding';
      fusingT = 0;
      fusePhase = 0;
      exploded = false;
      parts = [];
      tap.style.pointerEvents = 'none';
      tap.tabIndex = -1;

      playFuseHiss();
    }

    function showAbout() {
      if (screen2Visible) return;
      screen2Visible = true;
      state = 'screen2';
      ctx2.clearRect(0, 0, SW, SH);
      setPos('big', false);
      s2.style.opacity = '1';
      s2.style.pointerEvents = 'auto';
      if (aboutHome) {
        aboutHome.style.opacity = '0';
        aboutHome.style.pointerEvents = 'none';
        aboutHome.style.transform = 'scale(0.85)';
      }
      userTouched = false;
      textTouched = false;
      stopAutoScroll();
      clearTimeout(aboutTimer);
      aboutTimer = window.setTimeout(() => setPos('icon', true), 5000);
    }

    function goHome() {
      clearTimeout(aboutTimer);
      stopAutoScroll();
      textTouched = false;
      aboutMusic.pause();
      s2.style.opacity = '0';
      s2.style.pointerEvents = 'none';
      if (aboutHome) {
        aboutHome.style.opacity = '0';
        aboutHome.style.pointerEvents = 'none';
        aboutHome.style.transform = 'scale(0.85)';
      }
      setPos('big', false);
      s2.dataset['phase'] = 'idle';
      parts = [];
      exploded = false;
      fusingT = 0;
      screen2Visible = false;
      state = 'look';
      tap.style.pointerEvents = '';
      tap.tabIndex = 0;
    }

    aboutPortrait.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = s2.dataset['phase'];
      if (p === 'icon') {
        stopAutoScroll();
        setPos('big', true);
      } else if (p === 'big') {
        textTouched = false;
        setPos('icon', true);
      }
    });
    aboutHome.addEventListener('click', (e) => {
      e.stopPropagation();
      goHome();
    });

    const markTouch = () => {
      userTouched = true;
    };
    s2.addEventListener('pointerdown', markTouch, true);
    s2.addEventListener('wheel', markTouch, { capture: true, passive: true });
    s2.addEventListener('touchstart', markTouch, { capture: true, passive: true });
    s2.addEventListener('scroll', markTouch, true);
    aboutMusic.addEventListener('ended', () => {
      if (screen2Visible) {
        if (!userTouched) goHome();
        return;
      }
      if (state === 'exploding') goHome();
    });

    let _sprX = 0,
      _sprY = 0;
    function updateHit(sprX: number, sprY: number) {
      _sprX = sprX;
      _sprY = sprY;
      const pd = 30;
      Object.assign(tap.style, {
        left: sprX + OX - 6 * P - pd + 'px',
        top: sprY + OY - 28 * P - pd + 'px',
        width: 12 * P + pd * 2 + 'px',
        height: 28 * P + pd * 2 + 'px',
      });
    }

    cv.addEventListener('pointermove', (e) => {
      if (state === 'exploding' || state === 'entering' || screen2Visible) {
        cv.style.cursor = 'default';
        return;
      }
      cv.style.cursor = hitTest(e) ? 'pointer' : 'default';
    });
    cv.addEventListener('pointerdown', (e) => {
      if (state === 'exploding' || state === 'entering' || screen2Visible) return;
      if (hitTest(e)) startExplosion();
    });

    function hitTest(e: PointerEvent) {
      if (state !== 'look') return false;
      const stageEl = document.getElementById('st');
      if (!stageEl) return false;
      const stRect = stageEl.getBoundingClientRect();
      const tStr = stageEl.style.transform || '';
      const rotated = /rotate\(90/.test(tStr);
      const scaleM = tStr.match(/scale\(([\d.]+)\)/);
      const sc = scaleM ? parseFloat(scaleM[1]) : 1;
      const cx2 = stRect.left + stRect.width / 2;
      const cy2 = stRect.top + stRect.height / 2;
      let dx = (e.clientX - cx2) / sc;
      let dy = (e.clientY - cy2) / sc;
      if (rotated) {
        const tmp = dx;
        dx = -dy;
        dy = tmp;
      }
      const logX = dx + SW / 2;
      const logY = dy + SH / 2;
      const pad = 24;
      return (
        logX >= _sprX - pad &&
        logX <= _sprX + OW + pad &&
        logY >= _sprY - pad &&
        logY <= _sprY + OH + pad
      );
    }

    let last2 = 0;
    const ctx2 = cv.getContext('2d')!;
    let animId = 0;

    function loop(now: number) {
      animId = requestAnimationFrame(loop);
      if (screen2Visible && state !== 'exploding') return;
      const dt = Math.min((now - last2) / 1000, 0.05);
      last2 = now;
      ctx2.clearRect(0, 0, SW, SH);
      ctx2.imageSmoothingEnabled = false;

      if (state === 'exploding') {
        fusingT += dt;
        const progress = Math.min(1, fusingT / FUSE_DUR);
        fusePhase += dt * (6 + 18 * progress);
        // Turns white for 1.5s as requested by user ("اجعله اولا يتحول الى اللون الأبيض لمدة 1 ونصف ثانية")
        const isWhite = (fusePhase | 0) % 2 === 0 || progress > 0.65;
        const sc2 = 1 + 0.35 * progress;
        if (fusingT < FUSE_DUR) {
          drawStanding(isWhite, 0);
          ctx2.save();
          ctx2.translate(STAND_X, FOOT_Y);
          ctx2.scale(sc2, sc2);
          ctx2.drawImage(spr, -OX, -OY);
          ctx2.restore();
        } else if (!exploded) {
          exploded = true;
          playBoomAudio();
          spawnBoom(STAND_X, FOOT_Y - OH / 2);
          let sk = 0;
          const shk = setInterval(() => {
            const a = 16 * (1 - sk / 10);
            const stEl = document.getElementById('st');
            if (stEl) {
              stEl.style.marginLeft = (Math.random() * 2 - 1) * a + 'px';
              stEl.style.marginTop = (Math.random() * 2 - 1) * a + 'px';
            }
            if (++sk > 10) {
              clearInterval(shk);
              const stEl2 = document.getElementById('st');
              if (stEl2) {
                stEl2.style.marginLeft = '';
                stEl2.style.marginTop = '';
              }
            }
          }, 45);
          const fl = document.createElement('div');
          fl.style.cssText =
            'position:absolute;inset:0;background:#fff;z-index:49;pointer-events:none;transition:opacity .35s ease;opacity:1';
          stage?.appendChild(fl);
          setTimeout(() => {
            fl.style.opacity = '0';
            setTimeout(() => fl.remove(), 350);
          }, 80);
          showAbout();
        }
        drawParts(ctx2, dt);
        return;
      }

      if (screen2Visible) return;

      if (state === 'entering') {
        legPhase += dt * 8.5;
        cx -= 95 * dt;
        const bob = Math.abs(Math.sin(legPhase)) * 0.25;
        drawWalking(legPhase, bob, -1);
        const dx0 = Math.round(cx);
        updateHit(dx0 - OX, FOOT_Y - OY);
        ctx2.save();
        ctx2.translate(dx0, FOOT_Y);
        ctx2.scale(-1, 1);
        ctx2.drawImage(spr, -OX, -OY);
        ctx2.restore();
        if (cx <= STAND_X) {
          cx = STAND_X;
          dir = 1;
          state = 'look';
          tap.style.pointerEvents = 'auto';
          tap.tabIndex = 0;
        }
        drawParts(ctx2, dt);
        return;
      }

      /* standing creeper facing player */
      cx = STAND_X;
      dir = 1;
      drawStanding(false, (Math.sin((now / 1000) * 2.2) + 1) * 0.25);
      const dx0 = Math.round(cx);
      updateHit(dx0 - OX, FOOT_Y - OY);
      ctx2.drawImage(spr, dx0 - OX, FOOT_Y - OY);
      drawParts(ctx2, dt);
    }

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', fitAbout);
      s2.removeEventListener('wheel', handleWheel);
      s2.removeEventListener('touchstart', onTouchStart);
      s2.removeEventListener('touchmove', onTouchMove as any);
      s2.removeEventListener('touchend', onTouchEnd);
      s2.removeEventListener('touchcancel', onTouchEnd);
      clearTimeout(aboutTimer);
      stopAutoScroll();
      stopMomentum();
      aboutMusic.pause();
      cv.remove();
      tap.remove();
      s2.remove();
    };
  }, []);

  return <div ref={containerRef} className="ik-roaming-creeper" aria-hidden="true" />;
};

export default RoamingCreeper;
