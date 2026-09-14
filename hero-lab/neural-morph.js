/* =========================================================
   NEURAL MORPH
   漂う点と線（ニューラルネット）が集まって、3Dの線画モデルに組み上がり、またほどける。
   形のデータは hero3d.js の HeroScene.shapes（家・Web・街・AI）を使う。

   NeuralMorph.mount(canvas, {
     shapes:  ['house', 'web', 'city', 'ai'],
     onShape: (index, name) => {},            // 組み上がり始めたとき
     onStats: ({ nodes, links, state }) => {}, // HUD 用（250ms ごと）
     pointerTarget, cx, cy, scale,            // cx / cy / scale は関数でも可
   })
   ========================================================= */
(function (global) {
  const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
  const rand = (a, b) => a + Math.random() * (b - a);
  const COLORS = ['110,231,255', '140,210,90', '200,150,255', '140,165,210'];
  const DIM = 3;

  // どの形も同じくらいの大きさ（半径 1.25）に収める
  function normalize (segs) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    segs.forEach(q => {
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], q[k], q[k + 3]);
        hi[k] = Math.max(hi[k], q[k], q[k + 3]);
      }
    });
    const c = lo.map((v, k) => (v + hi[k]) / 2);
    const s = 1.25 / (Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
    return segs.map(q => [(q[0] - c[0]) * s, (q[1] - c[1]) * s, (q[2] - c[2]) * s,
                          (q[3] - c[0]) * s, (q[4] - c[1]) * s, (q[5] - c[2]) * s, q[6]]);
  }

  // 線分の上に、ちょうど N 個の点を長さに比例して並べる。隣り合う点どうしが「線」になる
  function sampleShape (segs, N) {
    const lens = segs.map(q => Math.hypot(q[3] - q[0], q[4] - q[1], q[5] - q[2]) * (q[6] === DIM ? 0.45 : 1));
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    const counts = lens.map(l => Math.max(2, Math.round((l / total) * N)));
    let sum = counts.reduce((a, b) => a + b, 0);
    while (sum > N) {
      let bi = -1, bc = 2;
      counts.forEach((c, i) => { if (c > bc) { bc = c; bi = i; } });
      if (bi < 0) break;
      counts[bi]--; sum--;
    }
    while (sum < N) {
      let bi = 0;
      lens.forEach((l, i) => { if (l / counts[i] > lens[bi] / counts[bi]) bi = i; });
      counts[bi]++; sum++;
    }
    const pts = [], links = [];
    segs.forEach((q, si) => {
      const c = counts[si];
      for (let k = 0; k < c; k++) {
        const t = k / (c - 1);
        pts.push([q[0] + (q[3] - q[0]) * t, q[1] + (q[4] - q[1]) * t, q[2] + (q[5] - q[2]) * t, q[6]]);
        if (k > 0) links.push([pts.length - 2, pts.length - 1, q[6]]);
      }
    });
    pts.length = Math.min(pts.length, N);
    return { pts, links: links.filter(([a, b]) => a < N && b < N) };
  }

  function mount (canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const val = v => (typeof v === 'function' ? v() : v);
    const lib = (global.HeroScene && global.HeroScene.shapes) || {};
    const names = (opts.shapes || ['house', 'web', 'city', 'ai']).filter(n => lib[n]);
    const T = { drift: opts.drift || 2600, hold: opts.hold || 5200, burst: 700 };

    let W = 0, H = 0, N = 0;
    let shapes = [], parts = [], perm = [];
    let mode = 'drift', modeStart = performance.now() - (T.drift - 1200);
    let index = 0, nextIndex = 0, skipDrift = false, linkCount = 0;
    let yaw = 0.6, yawMouse = 0, yawTarget = 0, tilt = 0.22, tiltTarget = 0.22;
    const mouse = { x: -1e4, y: -1e4 };
    const pulses = [], signals = [];
    let visible = true, raf = 0, statsAt = 0;

    const view = () => ({
      scale: Math.min(W, H) * (val(opts.scale) || 0.28),
      cx: W * (val(opts.cx) ?? 0.5),
      cy: H * (val(opts.cy) ?? 0.5),
    });

    function project (x, y, z, v) {
      const cy = Math.cos(yaw + yawMouse), sy = Math.sin(yaw + yawMouse);
      const X = x * cy - z * sy;
      let Z = x * sy + z * cy;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const Y = y * ct - Z * st;
      Z = y * st + Z * ct;
      const f = 3.6 / (3.6 - Z);
      return [v.cx + X * v.scale * f, v.cy - Y * v.scale * f, f];
    }

    function build () {
      const n = W < 760 ? 360 : 560;
      if (n === N && shapes.length) return;
      N = n;
      shapes = names.map(name => sampleShape(normalize(lib[name]()), N));
      while (parts.length < N) parts.push({ x: rand(0, W), y: rand(0, H), vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4), tx: 0, ty: 0, s: rand(0.8, 1.9), c: DIM, depth: 1, target: -1 });
      parts.length = N;
      if (mode === 'form') assign(index);
    }

    function resize () {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    // 画面上の並び（左上→右下）が近いもの同士を対応させ、組み上がりが一方向に流れて見えるようにする
    function assign (i) {
      const sh = shapes[i], v = view();
      const order = sh.pts.map((p, k) => { const r = project(p[0], p[1], p[2], v); return [k, r[0] + r[1] * 0.3]; }).sort((a, b) => a[1] - b[1]);
      const byPos = parts.map((p, k) => [k, p.x + p.y * 0.3]).sort((a, b) => a[1] - b[1]);
      parts.forEach(p => { p.target = -1; });
      perm = new Array(sh.pts.length);
      order.forEach(([k], j) => {
        const pi = byPos[j][0];
        perm[k] = pi;
        parts[pi].target = k;
        parts[pi].c = sh.pts[k][3];
      });
    }

    function form (i, now) {
      index = i;
      nextIndex = (i + 1) % names.length;
      mode = 'form'; modeStart = now;
      assign(i);
      signals.length = 0;
      if (opts.onShape) opts.onShape(i, names[i]);
    }

    function release (now) {
      const v = view();
      mode = 'burst'; modeStart = now;
      parts.forEach(p => {
        const dx = p.x - v.cx, dy = p.y - v.cy, d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * rand(2, 5); p.vy += (dy / d) * rand(2, 5);
        p.target = -1; p.c = DIM;
      });
      signals.length = 0;
    }

    function update (dt, now) {
      const el = now - modeStart;
      if (mode === 'drift' && el > T.drift) form(nextIndex, now);
      else if (mode === 'form' && el > T.hold) release(now);
      else if (mode === 'burst' && el > T.burst) {
        if (skipDrift) { skipDrift = false; form(nextIndex, now); }
        else { mode = 'drift'; modeStart = now; }
      }

      yaw += 0.0032 * dt;
      yawMouse += (yawTarget - yawMouse) * 0.06;
      tilt += (tiltTarget - tilt) * 0.06;

      const sh = mode === 'form' ? shapes[index] : null;
      const v = view();
      const settle = clamp((now - modeStart) / 900);
      for (const p of parts) {
        if (sh && p.target >= 0) {
          const q = sh.pts[p.target];
          const r = project(q[0], q[1], q[2], v);
          let tx = r[0], ty = r[1];
          const dx = tx - mouse.x, dy = ty - mouse.y, d = Math.hypot(dx, dy);
          if (d < 120 && d > 0.1) { const f = (1 - d / 120) * 26; tx += (dx / d) * f; ty += (dy / d) * f; }
          p.tx = tx; p.ty = ty; p.depth = r[2];
          const k = 0.03 + 0.09 * settle;
          p.vx += (tx - p.x) * k; p.vy += (ty - p.y) * k;
          p.vx *= 0.78; p.vy *= 0.78;
        } else {
          p.depth = 1;
          p.vx += rand(-0.03, 0.03); p.vy += rand(-0.03, 0.03);
          p.vx *= mode === 'burst' ? 0.95 : 0.985; p.vy *= mode === 'burst' ? 0.95 : 0.985;
          const sp = Math.hypot(p.vx, p.vy), cap = mode === 'burst' ? 6 : 1.3;
          if (sp > cap) { p.vx *= cap / sp; p.vy *= cap / sp; }
          const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
          if (d < 110 && d > 0.1) { p.vx += (dx / d) * 0.25 * (1 - d / 110); p.vy += (dy / d) * 0.25 * (1 - d / 110); }
        }
        for (const u of pulses) {
          const dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
          if (Math.abs(d - u.r) < 28 && d > 0.1) { p.vx += (dx / d) * 2; p.vy += (dy / d) * 2; }
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.target < 0) {
          if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
          if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
        }
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i].r += 7 * dt; pulses[i].a -= 0.018 * dt;
        if (pulses[i].a <= 0) pulses.splice(i, 1);
      }
    }

    // 近い点どうしをつなぐ（格子で近所だけ調べる）
    function proximity (L, alphas, color) {
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
      paths.forEach((path, b) => { ctx.strokeStyle = `rgba(${color},${alphas[b]})`; ctx.stroke(path); });
      return n;
    }

    function draw () {
      ctx.clearRect(0, 0, W, H);
      linkCount = 0;

      if (mode === 'form') {
        const sh = shapes[index];
        // 形の辺：色と濃さごとにまとめて描く
        const groups = new Map();
        const wire = [];
        for (const [a, b, c] of sh.links) {
          const pa = parts[perm[a]], pb = parts[perm[b]];
          if (!pa || !pb) continue;
          const arrive = clamp(1 - (Math.hypot(pa.x - pa.tx, pa.y - pa.ty) + Math.hypot(pb.x - pb.tx, pb.y - pb.ty)) / 80);
          if (arrive <= 0.02) continue;
          const depth = (pa.depth + pb.depth) / 2;
          const alpha = arrive * clamp((depth - 0.62) * 1.3) * (c === DIM ? 0.35 : 0.95);
          const bucket = Math.min(3, Math.floor((1 - alpha) * 4));
          const key = `${c}|${bucket}`;
          if (!groups.has(key)) groups.set(key, new Path2D());
          groups.get(key).moveTo(pa.x, pa.y); groups.get(key).lineTo(pb.x, pb.y);
          if (c !== DIM && arrive > 0.9) wire.push([pa, pb]);
          linkCount++;
        }
        const levels = [0.95, 0.62, 0.36, 0.14];
        groups.forEach((path, key) => {
          const [c, bucket] = key.split('|').map(Number);
          ctx.strokeStyle = `rgba(${COLORS[c]},${levels[bucket]})`;
          ctx.lineWidth = c === DIM ? 0.8 : 1.3;
          ctx.stroke(path);
        });
        // 組み上がった後も、細かいつながりを薄く残して「ネットワーク感」を出す
        linkCount += proximity(26, [0.14, 0.06], '150,210,255');

        // 辺を伝う信号
        if (wire.length && signals.length < 18 && Math.random() < 0.3) {
          const [a, b] = wire[(Math.random() * wire.length) | 0];
          signals.push({ a, b, t: 0 });
        }
      } else {
        linkCount = proximity(W < 760 ? 70 : 94, [0.5, 0.3, 0.16, 0.07], '120,210,255');
      }

      if (mouse.x > -1e3) {
        const path = new Path2D();
        for (const p of parts) if (Math.hypot(p.x - mouse.x, p.y - mouse.y) < 170) { path.moveTo(mouse.x, mouse.y); path.lineTo(p.x, p.y); }
        ctx.strokeStyle = 'rgba(200,165,255,.24)'; ctx.lineWidth = 1;
        ctx.stroke(path);
      }

      // 点：色ごとにまとめる
      for (let c = 0; c < COLORS.length; c++) {
        ctx.fillStyle = `rgb(${COLORS[c]})`;
        for (const p of parts) {
          const pc = mode === 'form' && p.target >= 0 ? p.c : (p.x / Math.max(W, 1) < 0.5 ? 0 : 2);
          if (pc !== c) continue;
          const sz = p.s * (mode === 'form' ? clamp(p.depth, 0.6, 1.4) * 1.15 : 1);
          ctx.globalAlpha = mode === 'form' && p.target >= 0 ? clamp((p.depth - 0.55) * 1.4, 0.25, 1) : 0.9;
          ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
        }
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#fff'; ctx.shadowColor = '#6ee7ff'; ctx.shadowBlur = 14;
      for (let i = signals.length - 1; i >= 0; i--) {
        const s = signals[i];
        s.t += 0.06;
        if (s.t >= 1) { signals.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(s.a.x + (s.b.x - s.a.x) * s.t, s.a.y + (s.b.y - s.a.y) * s.t, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      for (const u of pulses) {
        ctx.strokeStyle = `rgba(180,150,255,${Math.max(0, u.a)})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2); ctx.stroke();
      }
    }

    function stats (now) {
      if (!opts.onStats || now - statsAt < 250) return;
      statsAt = now;
      const state = mode === 'form' ? `BUILDING : ${names[index].toUpperCase()}` : mode === 'burst' ? 'RELEASE' : 'LEARNING';
      opts.onStats({ nodes: N, links: linkCount, state });
    }

    let last = performance.now();
    function loop (now) {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = Math.min((now - last) / 16.667, 3); last = now;
      update(dt, now); draw(); stats(now);
      raf = requestAnimationFrame(loop);
    }
    const start = () => { if (!raf && !reduce) { last = performance.now(); raf = requestAnimationFrame(loop); } };

    function show (i) {
      if (i < 0 || i >= names.length) return;
      const now = performance.now();
      nextIndex = i;
      if (reduce) { form(i, now); snap(); return; }
      if (mode === 'form') { if (i === index) return; release(now); skipDrift = true; }
      else if (mode === 'drift') form(i, now);
      else skipDrift = true;
    }
    // 動きを減らす設定のときは、組み上がった状態をそのまま描く
    function snap () {
      const v = view();
      const sh = shapes[index];
      parts.forEach(p => {
        if (p.target < 0) return;
        const q = sh.pts[p.target], r = project(q[0], q[1], q[2], v);
        p.x = p.tx = r[0]; p.y = p.ty = r[1]; p.depth = r[2];
      });
      draw(); stats(performance.now() + 1000);
    }

    const host = opts.pointerTarget || canvas;
    host.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      yawTarget = (mouse.x / Math.max(W, 1) - 0.5) * 1.1;
      tiltTarget = 0.22 + (mouse.y / Math.max(H, 1) - 0.5) * 0.5;
    });
    host.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e4; yawTarget = 0; tiltTarget = 0.22; });
    canvas.addEventListener('click', e => {
      const r = canvas.getBoundingClientRect();
      pulses.push({ x: e.clientX - r.left, y: e.clientY - r.top, r: 4, a: 0.9 });
      show(mode === 'form' ? nextIndex : index);
    });
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); }).observe(canvas);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    window.addEventListener('resize', () => { resize(); if (reduce) snap(); });

    resize();
    if (reduce) { form(0, performance.now()); snap(); }
    else start();

    return {
      show,
      // 組み上がった状態へ即座に切り替える（スクリーンショットや、動きを止めたいとき用）
      snapTo (i) {
        if (i < 0 || i >= names.length) return;
        form(i, performance.now());
        snap();
      },
      get index () { return index; },
    };
  }

  global.NeuralMorph = { mount };
})(window);
