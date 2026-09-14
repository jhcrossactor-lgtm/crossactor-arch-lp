/* =========================================================
   FLOW SCENE（HERO LAB 07 / 08）
   AI ：コードが流れる背景の中で、漂う点と線（01）が集まって、うごめく集合体になる。
        集合体はカーソルの方へ少し寄り、近くの点はカーソルについてくる。
   街 ：集合体がほどけて、03 の街（グリッドと立ち上がるビル）の辺に吸い込まれる。
   Web：（opts.web があるとき）ビルが点に戻り、Webの形の輪郭に集まって組み上がる。
        Webの形は web-variants.js の中から差し替えられる。
   最後は点に戻って AI へ帰る。

   FlowScene.mount({
     canvas, rainCanvas, pointerTarget,
     web,                                               // 省略すると AI → 街 → AI
     onScene: name => {},                               // 'ai' | 'city' | 'web'
     onStats: ({ nodes, links, state }) => {},          // 250ms ごと
   }) → { show(name), jump(name), setWeb(renderer), scene }
   ========================================================= */
(function (global) {
  const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = t => t * t * (3 - 2 * t);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const DOTS = ['#6ee7ff', '#a5b4fc', '#f0abfc'];   // 01 の色（左→右）

  /* ---------------------------------------------------------
     背景：流れるコード（02 の発想を 01 の色で）
     毎フレーム少しだけ暗く塗り重ねて、文字の尾を残す
     --------------------------------------------------------- */
  function codeRain (cv) {
    const ctx = cv.getContext('2d');
    const GLYPHS = '010101010101101001{}<>/=;:#*+[]()ABCDEF'.split('');
    let W = 0, H = 0, size = 15, cols = [];
    return {
      resize () {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        W = cv.clientWidth; H = cv.clientHeight;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        size = W < 760 ? 13 : 15;
        const gap = size * 1.3;
        cols = Array.from({ length: Math.ceil(W / gap) }, (_, i) => ({ x: i * gap, y: rand(-H, H), sp: rand(0.35, 1.1), depth: Math.random() }));
        ctx.fillStyle = '#03040a'; ctx.fillRect(0, 0, W, H);
      },
      draw (dt, k, mouse) {
        ctx.fillStyle = `rgba(3,4,10,${clamp(0.085 * dt, 0.04, 0.3)})`;
        ctx.fillRect(0, 0, W, H);
        if (k < 0.01) return;
        ctx.font = `${size}px "Space Mono", monospace`;
        ctx.textBaseline = 'top';
        for (const c of cols) {
          c.y += c.sp * size * 0.32 * dt;
          if (c.y > H + size * 2) {
            if (Math.random() < 0.02 * dt) { c.y = rand(-size * 24, -size); c.sp = rand(0.35, 1.1); c.depth = Math.random(); }
            continue;
          }
          // カーソルの近くの文字は明るくなる
          const near = mouse.active ? clamp(1 - Math.hypot(c.x - mouse.x, c.y - mouse.y) / 170) : 0;
          const a = clamp((0.16 + 0.46 * c.depth + near * 0.6) * k);
          ctx.fillStyle = near > 0.05 ? `rgba(220,250,255,${a})`
            : Math.random() < 0.05 ? `rgba(240,171,252,${a})` : `rgba(110,231,255,${a})`;
          ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], c.x, c.y);
        }
      },
    };
  }

  /* ---------------------------------------------------------
     街：03 のグリッドとワイヤーフレームのビル
     alpha（全体の濃さ）と riseK（ビルの立ち上がり 0→1）を外から渡せるようにしてある
     --------------------------------------------------------- */
  function cityScene () {
    const FAR = 90;
    const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cam = { x: 0, tx: 0, y: 1.7, z: 0, pitch: 0, tpitch: 0 };
    let W = 0, H = 0, narrow = false, boost = 0, uid = 0;
    const stars = [];
    const beams = [-34, -14, 9, 27, 46].map(x => ({ x, ph: rand(0, 6) }));

    const spawn = z => {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * rand(4.5, 24);
      return {
        id: uid++, x, z, w: rand(1.6, 4), d: rand(1.6, 4),
        h: rand(2.5, Math.abs(x) < 10 ? 9 : 17) * (Math.random() < 0.14 ? 1.8 : 1),
        pink: Math.random() < 0.22, ant: Math.random() < 0.25,
        win: Array.from({ length: 24 }, () => Math.random() < 0.35),
      };
    };
    const blds = Array.from({ length: 48 }, () => spawn(rand(3, FAR)));

    const horizon = () => H * (narrow ? 0.36 : 0.47) + cam.pitch;
    const proj = (x, y, z) => {
      const dz = z - cam.z;
      if (dz < 0.4) return null;
      const f = H * 0.95;
      return [W / 2 + ((x - cam.x) * f) / dz, horizon() - ((y - cam.y) * f) / dz];
    };
    const riseOf = (b, riseK) => (1 - Math.pow(1 - clamp((FAR - (b.z - cam.z)) / 16), 3)) * riseK;
    const cornersOf = (b, riseK) => {
      const h = b.h * riseOf(b, riseK);
      const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, zf = b.z - b.d / 2, zb = b.z + b.d / 2;
      const P = [proj(x0, 0, zf), proj(x1, 0, zf), proj(x1, h, zf), proj(x0, h, zf),
                 proj(x0, 0, zb), proj(x1, 0, zb), proj(x1, h, zb), proj(x0, h, zb)];
      return P.some(p => !p) ? null : P;
    };

    return {
      resize (w, h) {
        W = w; H = h; narrow = W < 760;
        stars.length = 0;
        for (let i = 0; i < 160; i++) stars.push({ x: rand(0, W), y: rand(0, H * 0.5), a: rand(0.2, 0.9), p: rand(0, 6) });
      },
      steer (nx, ny) { cam.tx = nx * 10; cam.tpitch = -ny * 60; },
      release () { cam.tx = 0; cam.tpitch = 0; },
      boost () { boost = 0.7; },

      step (dt, speedK) {
        cam.x += (cam.tx - cam.x) * 0.04;
        cam.pitch += (cam.tpitch - cam.pitch) * 0.05;
        cam.z += (0.14 + boost) * speedK * dt;
        boost *= Math.pow(0.95, dt);
        for (const b of blds) if (b.z - cam.z < 1.2) Object.assign(b, spawn(cam.z + FAR + rand(0, 12)));
      },

      draw (ctx, t, alpha, riseK) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const hz = horizon();
        const sky = ctx.createLinearGradient(0, 0, 0, hz);
        sky.addColorStop(0, '#04010c'); sky.addColorStop(0.7, '#12052a'); sky.addColorStop(1, '#3b0c4f');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz);
        ctx.fillStyle = '#05020d'; ctx.fillRect(0, hz, W, H - hz);
        const glow = ctx.createRadialGradient(W / 2, hz, 0, W / 2, hz, W * 0.6);
        glow.addColorStop(0, 'rgba(255,79,216,.45)'); glow.addColorStop(0.35, 'rgba(139,92,246,.16)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow; ctx.fillRect(0, hz - W * 0.3, W, W * 0.6);

        for (const s of stars) {
          if (s.y > hz - 6) continue;
          ctx.fillStyle = `rgba(255,255,255,${(s.a * (0.6 + 0.4 * Math.sin(t * 0.002 + s.p))).toFixed(3)})`;
          ctx.fillRect(s.x, s.y, 1.2, 1.2);
        }
        for (const b of beams) {
          const p = proj(b.x, 0, cam.z + FAR);
          if (!p) continue;
          const a = 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.0012 + b.ph));
          const g = ctx.createLinearGradient(0, hz, 0, hz - H * 0.45);
          g.addColorStop(0, `rgba(58,232,255,${a})`); g.addColorStop(1, 'rgba(58,232,255,0)');
          ctx.fillStyle = g; ctx.fillRect(p[0] - 3, hz - H * 0.45, 6, H * 0.45);
        }

        const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
        for (let x = -40; x <= 40; x += 2) {
          const a = proj(x, 0, cam.z + 0.5), b = proj(x, 0, cam.z + FAR);
          if (a && b) { paths[0].moveTo(a[0], a[1]); paths[0].lineTo(b[0], b[1]); }
        }
        for (let z = Math.ceil(cam.z / 2) * 2; z < cam.z + FAR; z += 2) {
          const a = proj(-40, 0, z), b = proj(40, 0, z);
          if (a && b) { const k = Math.min(3, Math.floor(((z - cam.z) / FAR) * 4)); paths[k].moveTo(a[0], a[1]); paths[k].lineTo(b[0], b[1]); }
        }
        ctx.lineWidth = 1;
        [0.5, 0.28, 0.14, 0.06].forEach((a, k) => { ctx.strokeStyle = `rgba(58,232,255,${a})`; ctx.stroke(paths[k]); });

        ctx.strokeStyle = 'rgba(255,79,216,.8)'; ctx.lineWidth = 2;
        for (let z = Math.ceil(cam.z / 4) * 4; z < cam.z + 40; z += 4) {
          const a = proj(0, 0, z), b = proj(0, 0, z + 1.6);
          if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        }

        blds.sort((a, b) => b.z - a.z);
        for (const b of blds) {
          const dz = b.z - cam.z;
          if (dz < 1.2 || dz > FAR) continue;
          const rise = riseOf(b, riseK);
          if (rise < 0.01) continue;
          const P = cornersOf(b, riseK);
          if (!P) continue;
          const fog = Math.pow(clamp(1 - dz / FAR), 1.1);
          const poly = idx => { ctx.beginPath(); idx.forEach((i, k) => (k ? ctx.lineTo(P[i][0], P[i][1]) : ctx.moveTo(P[i][0], P[i][1]))); ctx.closePath(); };
          const side = b.x > cam.x ? [0, 3, 7, 4] : [1, 2, 6, 5];
          ctx.fillStyle = 'rgba(6,3,16,.94)';
          poly(side); ctx.fill(); poly([0, 1, 2, 3]); ctx.fill();
          const col = b.pink ? '255,79,216' : '58,232,255';
          ctx.strokeStyle = `rgba(${col},${(0.85 * fog).toFixed(3)})`; ctx.lineWidth = 1.1;
          poly([0, 1, 2, 3]); ctx.stroke(); poly(side); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(P[3][0], P[3][1]); ctx.lineTo(P[7][0], P[7][1]); ctx.lineTo(P[6][0], P[6][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.stroke();

          const h = b.h * rise, x0 = b.x - b.w / 2, zf = b.z - b.d / 2;
          ctx.fillStyle = `rgba(255,236,190,${(0.75 * fog * rise).toFixed(3)})`;
          for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
            if (!b.win[r * 4 + c]) continue;
            const wy = h * (0.15 + r * 0.14);
            if (wy > h - 0.3) continue;
            const p = proj(x0 + b.w * (0.2 + c * 0.2), wy, zf);
            if (p) ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2);
          }
          if (b.ant && rise > 0.95) {
            const a = proj(b.x, h, b.z), c = proj(b.x, h + 1.4, b.z);
            if (a && c) {
              ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
              if (Math.sin(t * 0.006 + b.x) > 0.3) { ctx.fillStyle = `rgba(255,60,90,${fog})`; ctx.fillRect(c[0] - 1.5, c[1] - 1.5, 3, 3); }
            }
          }
        }
        ctx.restore();
      },

      // 点が吸い込まれる先：見えているビルの辺の上の位置を n 個えらぶ
      sampleRefs (n) {
        const list = blds.filter(b => { const dz = b.z - cam.z; return dz > 6 && dz < FAR * 0.75; });
        if (!list.length) return [];
        const per = Math.max(1, Math.ceil(n / (list.length * EDGES.length)));
        const refs = [];
        for (const b of list) for (const [a, c] of EDGES) for (let k = 0; k < per; k++) {
          refs.push({ b, id: b.id, a, c, u: (k + 0.5) / per, last: null });
        }
        for (let i = refs.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [refs[i], refs[j]] = [refs[j], refs[i]]; }
        return refs.slice(0, n);
      },
      // 対応するビルが入れ替わっていたら null（最後の位置のまま待つ）
      refPos (r, riseK) {
        if (r.b.id !== r.id) return null;
        const P = cornersOf(r.b, riseK);
        if (!P) return null;
        return [lerp(P[r.a][0], P[r.c][0], r.u), lerp(P[r.a][1], P[r.c][1], r.u)];
      },
    };
  }

  /* ---------------------------------------------------------
     全体の流れ
     drift → cluster → toCity → city → (toWeb → web →) toAI → drift …
     --------------------------------------------------------- */
  const SCENE_OF = { drift: 'ai', cluster: 'ai', toAI: 'ai', toCity: 'city', city: 'city', toWeb: 'web', web: 'web' };

  function mount (opts) {
    const fg = opts.canvas;
    const ctx = fg.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rain = codeRain(opts.rainCanvas);
    const city = cityScene();
    const host = opts.pointerTarget || fg;
    // 場面の長さ（ms）。opts.durations で上書きできる
    const PH = Object.assign({ drift: 2200, cluster: 6500, toCity: 2600, city: 8500, toWeb: 2800, web: 10000, toAI: 2000 }, opts.durations);
    // Webの場面で残すコードレインの濃さ。opts.webRain: 0 で消せる（09 は方眼紙を自前で描く）
    const WEB_RAIN = opts.webRain !== undefined ? opts.webRain : 0.35;

    let web = opts.web || null;
    let W = 0, H = 0, narrow = false, N = 0;
    let parts = [], dirs = [], refs = [];
    let phase = 'drift', phaseStart = performance.now(), want = null, source = 'ai';
    let rainK = 1, cityAlpha = 0, cityRise = 0, swarmAlpha = 1, webAlpha = 0, webBuild = 0;
    let lv0 = { rainK, cityAlpha, cityRise, webAlpha, webBuild };
    let yaw = 0, linkCount = 0, scene = 'ai', statsAt = 0;
    const center = { x: 0, y: 0 };
    const mouse = { x: -1e4, y: -1e4, active: false };
    const pulses = [];

    const base = () => ({ x: W * (narrow ? 0.5 : 0.7), y: H * (narrow ? 0.3 : 0.5) });
    const radius = () => Math.min(W, H) * (narrow ? 0.2 : 0.23);
    const fib = n => Array.from({ length: n }, (_, i) => {
      const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996;
      return [Math.cos(th) * r, y, Math.sin(th) * r];
    });

    function resize () {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = fg.clientWidth; H = fg.clientHeight; narrow = W < 760;
      fg.width = Math.round(W * dpr); fg.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rain.resize();
      city.resize(W, H);
      if (web) web.resize(W, H, narrow);
      const n = narrow ? 320 : 520;
      if (n !== N) {
        N = n;
        while (parts.length < N) parts.push({ x: rand(0, W), y: rand(0, H), vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4), s: rand(0.8, 1.9), free: parts.length % 8 === 0, depth: 1 });
        parts.length = N;
        dirs = fib(N);
      }
      if (!center.x) { const b = base(); center.x = b.x; center.y = b.y; }
    }

    // 集合体の中の i 番目の点の位置。球の半径を波で揺らして「うごめく」形にする
    function clusterTarget (i, t, R) {
      const d = dirs[i];
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      let x = d[0] * cy - d[2] * sy, z = d[0] * sy + d[2] * cy, y = d[1];
      const ct = Math.cos(0.35), st = Math.sin(0.35);
      const y2 = y * ct - z * st; z = y * st + z * ct; y = y2;
      const n = Math.sin(d[0] * 2.3 + t * 0.0009) * Math.sin(d[1] * 1.9 - t * 0.0007) * 0.5
              + Math.sin(d[2] * 2.7 + t * 0.0011) * 0.3
              + Math.sin((d[0] + d[1]) * 3.3 - t * 0.0013) * 0.2;
      let r = R * (1 + 0.26 * n);
      // カーソルの方向にふくらむ
      if (mouse.active) {
        const mx = mouse.x - center.x, my = mouse.y - center.y, md = Math.hypot(mx, my) || 1;
        const dot = (x * mx - y * my) / md;
        if (dot > 0) r += R * 0.35 * Math.pow(dot, 4) * clamp(1 - md / (R * 4));
      }
      const f = 3 / (3 - z * 0.9);
      return [center.x + x * r * f, center.y - y * r * f, f];
    }

    // 直前の場面の形（ビルの辺・Webの輪郭）の位置に点を置き直す
    function snapFrom (src, burst, now) {
      let pts = null;
      if (src === 'city') { pts = city.sampleRefs(N).map(r => city.refPos(r, 1)); }
      else if (src === 'web' && web) pts = web.targets(N, now);
      if (!pts) return;
      parts.forEach((q, i) => {
        const pos = pts[i];
        if (pos) { q.x = pos[0]; q.y = pos[1]; }
        if (burst) { q.vx = rand(-2.2, 2.2); q.vy = rand(-4.5, -0.6); }
        else { q.vx = rand(-1, 1); q.vy = rand(-1, 1); }
      });
    }

    function enter (p, now) {
      const src = SCENE_OF[phase];
      lv0 = { rainK, cityAlpha, cityRise, webAlpha, webBuild };
      phase = p; phaseStart = now; source = src;
      if (p === 'toCity') { if (src === 'web') snapFrom('web', false, now); refs = city.sampleRefs(N); }
      if (p === 'toWeb') { if (src === 'city') snapFrom('city', false, now); refs = []; }
      if (p === 'toAI') { snapFrom(src, true, now); refs = []; }
    }

    const NEXT = () => ({ drift: 'cluster', cluster: 'toCity', toCity: 'city', city: web ? 'toWeb' : 'toAI', toWeb: 'web', web: 'toAI', toAI: 'drift' });

    function update (dt, now) {
      let u = clamp((now - phaseStart) / PH[phase]);
      if (want === 'web' && !web) want = null;
      if (want && SCENE_OF[phase] === want) want = null;
      // 遷移の途中は最後まで見せ、落ち着いている場面からだけ切り替える
      if (want && ['drift', 'cluster', 'city', 'web'].includes(phase)) {
        enter({ ai: 'toAI', city: 'toCity', web: 'toWeb' }[want], now);
        want = null;
      } else if (u >= 1) {
        enter(NEXT()[phase], now);
      }
      u = clamp((now - phaseStart) / PH[phase]);

      // 背景のコード・街・Web・点の、それぞれの濃さ
      const toward = (cur, target, rate) => cur + (target - cur) * Math.min(1, rate * dt);
      const swarmIn = source === 'ai' ? 1 : smooth(clamp(u / 0.15));
      if (phase === 'drift' || phase === 'cluster') {
        rainK = toward(rainK, 1, 0.05); cityAlpha = 0; cityRise = 0;
        webAlpha = toward(webAlpha, 0, 0.1); swarmAlpha = toward(swarmAlpha, 1, 0.1);
      } else if (phase === 'toCity') {
        rainK = lerp(lv0.rainK, 0, smooth(u));
        cityAlpha = smooth(clamp(u * 1.3));
        cityRise = easeOut(clamp((u - 0.15) / 0.85));
        webAlpha = lerp(lv0.webAlpha, 0, smooth(clamp(u * 1.5)));
        swarmAlpha = swarmIn * (1 - smooth(clamp((u - 0.55) / 0.45)));
      } else if (phase === 'city') {
        rainK = 0; cityAlpha = 1; cityRise = 1; webAlpha = 0; swarmAlpha = 0;
      } else if (phase === 'toWeb') {
        rainK = lerp(lv0.rainK, WEB_RAIN, smooth(u));
        cityAlpha = lerp(lv0.cityAlpha, 0, smooth(clamp(u * 1.4)));
        cityRise = lerp(lv0.cityRise, 0, easeOut(clamp(u * 1.2)));
        webAlpha = smooth(clamp((u - 0.3) / 0.7));
        webBuild = easeOut(clamp((u - 0.35) / 0.65));
        swarmAlpha = swarmIn * (1 - smooth(clamp((u - 0.6) / 0.4)));
      } else if (phase === 'web') {
        rainK = toward(rainK, WEB_RAIN, 0.05); cityAlpha = 0; webAlpha = 1; webBuild = 1; swarmAlpha = 0;
      } else {
        rainK = lerp(lv0.rainK, 1, smooth(u));
        cityAlpha = lerp(lv0.cityAlpha, 0, smooth(clamp(u * 1.4)));
        cityRise = lerp(lv0.cityRise, 0, easeOut(clamp(u * 1.2)));
        webAlpha = lerp(lv0.webAlpha, 0, smooth(clamp(u * 1.4)));
        swarmAlpha = smooth(clamp(u * 3));
      }

      // 遷移の前半は、まだ前の場面の名前を出しておく
      const early = { toCity: 0.35, toWeb: 0.35, toAI: 0.4 }[phase];
      const nowScene = early !== undefined && u < early ? source : SCENE_OF[phase];
      if (nowScene !== scene) { scene = nowScene; if (opts.onScene) opts.onScene(scene); }

      const fromCity = source === 'city';
      const speedK = phase === 'toCity' ? 0.25 + 0.75 * u : phase === 'city' ? 1
        : (phase === 'toAI' || phase === 'toWeb') && fromCity ? 1 - 0.7 * u : 0;
      if (speedK > 0) city.step(dt, speedK);
      if (web && webAlpha > 0.001) web.update(dt, now, mouse);

      // 集合体の中心は、カーソルの方へ少しだけ寄っていく
      const b = base(), R = radius();
      let gx = b.x, gy = b.y;
      if (mouse.active) {
        const dx = mouse.x - b.x, dy = mouse.y - b.y, d = Math.hypot(dx, dy) || 1;
        const m = Math.min(narrow ? 40 : 150, d * 0.3);
        gx += (dx / d) * m; gy += (dy / d) * m;
      }
      center.x += (gx - center.x) * Math.min(1, 0.05 * dt);
      center.y += (gy - center.y) * Math.min(1, 0.05 * dt);
      yaw += 0.004 * dt;

      if (phase === 'city' || phase === 'web') return;   // 点は隠れているので動かさない

      const settle = phase === 'cluster' ? clamp((now - phaseStart) / 1500) : 0;
      const cap = phase === 'toAI' && u < 0.4 ? 5 : 1.4;
      const webTargets = phase === 'toWeb' && web ? web.targets(N, now) : null;
      parts.forEach((p, i) => {
        let tx = null, ty = null, k = 0, damp = 0.985;
        p.depth = 1;
        if (phase === 'cluster' && !p.free) {
          const r = clusterTarget(i, now, R);
          tx = r[0]; ty = r[1]; p.depth = r[2];
          k = 0.004 + 0.03 * settle; damp = 0.86;
        } else if (phase === 'toCity' && refs[i]) {
          const pos = city.refPos(refs[i], cityRise);
          if (pos) refs[i].last = pos;
          if (refs[i].last) { tx = refs[i].last[0]; ty = refs[i].last[1]; k = 0.02 + 0.14 * smooth(u); damp = 0.8; }
        } else if (webTargets && webTargets[i]) {
          tx = webTargets[i][0]; ty = webTargets[i][1];
          k = 0.02 + 0.14 * smooth(clamp((u - 0.1) / 0.9)); damp = 0.8;
        }

        if (tx !== null) {
          p.vx += (tx - p.x) * k; p.vy += (ty - p.y) * k;
          p.vx *= damp; p.vy *= damp;
        } else {
          p.vx += rand(-0.03, 0.03); p.vy += rand(-0.03, 0.03);
          p.vx *= 0.985; p.vy *= 0.985;
          if (p.free && phase === 'cluster') {
            const dx = center.x - p.x, dy = center.y - p.y, d = Math.hypot(dx, dy) || 1;
            if (d > R * 1.5) { p.vx += (dx / d) * 0.06; p.vy += (dy / d) * 0.06; }
          }
          const sp = Math.hypot(p.vx, p.vy);
          if (sp > cap) { p.vx *= cap / sp; p.vy *= cap / sp; }
        }

        // ついてくる：カーソルの近くの点は引き寄せられる
        if (mouse.active && (phase === 'drift' || phase === 'cluster' || phase === 'toAI')) {
          const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
          if (d < 170 && d > 2) {
            const f = (1 - d / 170) * (phase === 'cluster' ? 0.22 : 0.09);
            p.vx += (dx / d) * f; p.vy += (dy / d) * f;
          }
        }
        for (const q of pulses) {
          const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
          if (Math.abs(d - q.r) < 28 && d > 0.1) { p.vx += (dx / d) * 2; p.vy += (dy / d) * 2; }
        }

        p.x += p.vx * dt; p.y += p.vy * dt;
        if (tx === null && (phase === 'drift' || phase === 'toAI' || p.free)) {
          if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
          if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
        }
      });
      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i].r += 7 * dt; pulses[i].a -= 0.018 * dt;
        if (pulses[i].a <= 0) pulses.splice(i, 1);
      }
    }

    // 近い点どうしを線でつなぐ（格子で近所だけ調べる）
    function proximity (L, alphas, k) {
      const grid = new Map();
      parts.forEach((p, i) => {
        const key = `${Math.floor(p.x / L)},${Math.floor(p.y / L)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      });
      const paths = alphas.map(() => new Path2D());
      const L2 = L * L;
      let n = 0;
      parts.forEach((p, i) => {
        const gx0 = Math.floor(p.x / L), gy0 = Math.floor(p.y / L);
        for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) for (let gy = gy0 - 1; gy <= gy0 + 1; gy++) {
          const cell = grid.get(`${gx},${gy}`);
          if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            const q = parts[j];
            const dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
            if (d2 > L2) continue;
            const b = Math.min(alphas.length - 1, Math.floor((Math.sqrt(d2) / L) * alphas.length));
            paths[b].moveTo(p.x, p.y); paths[b].lineTo(q.x, q.y);
            n++;
          }
        }
      });
      ctx.lineWidth = 1;
      paths.forEach((path, b) => { ctx.strokeStyle = `rgba(120,210,255,${alphas[b] * k})`; ctx.stroke(path); });
      return n;
    }

    function draw (now) {
      ctx.clearRect(0, 0, W, H);
      if (cityAlpha > 0.001) city.draw(ctx, now, cityAlpha, cityRise);
      if (web && webAlpha > 0.001) web.draw(ctx, now, webAlpha, webBuild);

      linkCount = 0;
      if (swarmAlpha > 0.01) {
        const u = clamp((now - phaseStart) / PH[phase]);
        const L = phase === 'cluster' ? (narrow ? 34 : 46)
          : phase === 'toCity' || phase === 'toWeb' ? lerp(narrow ? 70 : 92, 20, smooth(u))
          : (narrow ? 70 : 92);
        linkCount = proximity(L, [0.5, 0.3, 0.16, 0.07], swarmAlpha);

        if (mouse.active && phase !== 'toCity' && phase !== 'toWeb') {
          const path = new Path2D();
          for (const p of parts) if (Math.hypot(p.x - mouse.x, p.y - mouse.y) < 170) { path.moveTo(mouse.x, mouse.y); path.lineTo(p.x, p.y); }
          ctx.strokeStyle = `rgba(200,165,255,${0.26 * swarmAlpha})`;
          ctx.stroke(path);
        }

        for (let c = 0; c < 3; c++) {
          ctx.fillStyle = DOTS[c];
          for (const p of parts) {
            if (Math.min(2, Math.floor((p.x / Math.max(W, 1)) * 3)) !== c) continue;
            const a = phase === 'cluster' ? clamp((p.depth - 0.55) * 1.6, 0.35, 1) : 1;
            const sz = p.s * (phase === 'cluster' ? clamp(p.depth, 0.7, 1.4) * 1.2 : 1);
            ctx.globalAlpha = a * swarmAlpha;
            ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
          }
        }
        ctx.globalAlpha = 1;
      }
      for (const q of pulses) {
        ctx.strokeStyle = `rgba(180,150,255,${Math.max(0, q.a)})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.stroke();
      }
    }

    function stats (now) {
      if (!opts.onStats || now - statsAt < 250) return;
      statsAt = now;
      // HUD の状態名。opts.stateNames で上書きできる
      const state = Object.assign({ drift: 'LEARNING', cluster: 'THINKING', toCity: 'CONSTRUCTING', city: 'CITY', toWeb: 'COMPOSING', web: 'WEB', toAI: 'DISSOLVING' }, opts.stateNames)[phase];
      opts.onStats({ nodes: N, links: linkCount, state });
    }

    let raf = 0, visible = true, last = performance.now();
    function loop (now) {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = Math.min((now - last) / 16.667, 3); last = now;
      update(dt, now);
      rain.draw(dt, rainK, mouse);
      draw(now);
      stats(now);
      raf = requestAnimationFrame(loop);
    }
    const start = () => { if (!raf && !reduce) { last = performance.now(); raf = requestAnimationFrame(loop); } };

    host.addEventListener('pointermove', e => {
      const r = fg.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.active = true;
      city.steer(mouse.x / Math.max(W, 1) - 0.5, mouse.y / Math.max(H, 1) - 0.5);
    });
    host.addEventListener('pointerleave', () => { mouse.active = false; mouse.x = mouse.y = -1e4; city.release(); });
    fg.addEventListener('click', e => {
      const r = fg.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (phase === 'city' || phase === 'toCity') { city.boost(); return; }
      if ((phase === 'web' || phase === 'toWeb') && web) { web.click(x, y); return; }
      pulses.push({ x, y, r: 4, a: 0.9 });
    });
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); }).observe(fg);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    window.addEventListener('resize', resize);

    resize();
    if (reduce) {
      // 動きを減らす設定：集合体の形で止めて描く
      phase = 'cluster';
      const R = radius();
      parts.forEach((p, i) => { if (!p.free) { const t = clusterTarget(i, 0, R); p.x = t[0]; p.y = t[1]; p.depth = t[2]; } });
      for (let i = 0; i < 20; i++) rain.draw(1, 1, mouse);
      draw(0);
    } else {
      start();
    }

    return {
      // 流れに沿って、その場面へ移る
      show (name) { want = ['ai', 'city', 'web'].includes(name) ? name : null; },
      // 途中の遷移を飛ばして、その場面が落ち着いた状態にする（見比べ・確認用）
      jump (name) {
        const now = performance.now();
        if (name === 'web' && web) {
          phase = 'web'; phaseStart = now; source = 'web';
          rainK = 0.35; cityAlpha = 0; cityRise = 0; webAlpha = 1; webBuild = 1; swarmAlpha = 0;
        } else if (name === 'city') {
          phase = 'city'; phaseStart = now; source = 'city';
          rainK = 0; cityAlpha = 1; cityRise = 1; webAlpha = 0; swarmAlpha = 0;
        } else {
          phase = 'cluster'; phaseStart = now; source = 'ai';
          rainK = 1; cityAlpha = 0; webAlpha = 0; swarmAlpha = 1;
        }
        lv0 = { rainK, cityAlpha, cityRise, webAlpha, webBuild };
        scene = SCENE_OF[phase];
        if (opts.onScene) opts.onScene(scene);
        if (reduce) draw(now);
      },
      // Webの形を差し替える。Webを表示中なら、今の輪郭から点を出して新しい形に組み直す
      setWeb (renderer) {
        const now = performance.now();
        const showing = phase === 'web' || phase === 'toWeb';
        if (showing && web) snapFrom('web', false, now);
        web = renderer;
        web.resize(W, H, narrow);
        if (showing) {
          lv0 = { rainK, cityAlpha, cityRise, webAlpha: 0, webBuild: 0 };
          phase = 'toWeb'; phaseStart = now; source = 'web';
          swarmAlpha = 1;
        }
        if (reduce) { webAlpha = 1; webBuild = 1; draw(now); }
      },
      get scene () { return scene; },
    };
  }

  global.FlowScene = { mount };
})(window);
