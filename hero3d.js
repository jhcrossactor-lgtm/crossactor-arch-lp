/* =========================================================
   CROSSACTOR hero scene
   線だけの3Dモデルが「家 → Webサイト → AIネットワーク」と組み替わる。
   ライブラリ無しの Canvas 2D。3D座標を透視投影して線で結ぶだけの軽量実装。

   HeroScene.mount(canvas, {
     shapes:  ['house', 'web', 'ai'],   // 出す順番
     onShape: (index, name) => {},      // 形が切り替わり始めたときに呼ばれる
   })
   ========================================================= */
(function (global) {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // 色の番号：0=シアン 1=グリーン 2=パープル 3=補助線（薄い）
  const CYAN = 0, GREEN = 1, PURPLE = 2, DIM = 3;

  /* ---------- 形状：線分 [x1,y1,z1, x2,y2,z2, 色] の配列。y は上が正 ---------- */
  function rectXY (out, x0, y0, x1, y1, z, c) {
    out.push([x0, y0, z, x1, y0, z, c], [x1, y0, z, x1, y1, z, c],
             [x1, y1, z, x0, y1, z, c], [x0, y1, z, x0, y0, z, c]);
  }
  function box (out, x0, y0, z0, x1, y1, z1, c) {
    const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
               [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
      .forEach(([a, b]) => out.push([...P[a], ...P[b], c]));
  }

  // 家：切妻の2階建て。正面に開口、側面に間柱、足元に敷地の方眼
  function house () {
    const s = [];
    const eave = 0.25, ridge = 0.85, oh = 0.12;
    box(s, -0.9, -0.8, -0.6, 0.9, eave, 0.6, CYAN);
    s.push([-0.9 - oh, eave - 0.06, -0.6 - oh, -0.9 - oh, ridge, 0, CYAN],
           [-0.9 - oh, ridge, 0, -0.9 - oh, eave - 0.06, 0.6 + oh, CYAN],
           [0.9 + oh, eave - 0.06, -0.6 - oh, 0.9 + oh, ridge, 0, CYAN],
           [0.9 + oh, ridge, 0, 0.9 + oh, eave - 0.06, 0.6 + oh, CYAN],
           [-0.9 - oh, ridge, 0, 0.9 + oh, ridge, 0, CYAN],
           [-0.9 - oh, eave - 0.06, -0.6 - oh, 0.9 + oh, eave - 0.06, -0.6 - oh, CYAN],
           [-0.9 - oh, eave - 0.06, 0.6 + oh, 0.9 + oh, eave - 0.06, 0.6 + oh, CYAN],
           [-0.9, -0.28, 0.6, 0.9, -0.28, 0.6, DIM]);
    rectXY(s, -0.7, -0.1, -0.3, 0.15, 0.6, GREEN);
    rectXY(s, 0.3, -0.1, 0.7, 0.15, 0.6, GREEN);
    rectXY(s, -0.15, -0.8, 0.15, -0.38, 0.6, GREEN);
    rectXY(s, -0.7, -0.65, -0.35, -0.42, 0.6, GREEN);
    for (let z = -0.45; z <= 0.46; z += 0.3) s.push([0.9, -0.8, z, 0.9, eave, z, DIM]);
    for (let x = -1.3; x <= 1.31; x += 0.325) s.push([x, -0.8, -1, x, -0.8, 1, DIM]);
    for (let z = -1; z <= 1.01; z += 0.5) s.push([-1.3, -0.8, z, 1.3, -0.8, z, DIM]);
    return s;
  }

  // Webサイト：ブラウザの枠と、奥行きをずらして浮かぶヒーロー・画像・カード
  function web () {
    const s = [];
    const W = 1.25, H = 0.85;
    rectXY(s, -W, -H, W, H, 0, CYAN);
    rectXY(s, -W, -H, W, H, -0.12, DIM);
    [[-W, -H], [W, -H], [W, H], [-W, H]].forEach(([x, y]) => s.push([x, y, 0, x, y, -0.12, DIM]));
    s.push([-W, H - 0.2, 0, W, H - 0.2, 0, CYAN]);
    [-1.12, -1.02, -0.92].forEach(x => rectXY(s, x - 0.03, H - 0.13, x + 0.03, H - 0.07, 0, PURPLE));
    rectXY(s, -0.55, H - 0.14, 0.75, H - 0.06, 0, DIM);
    rectXY(s, -1.1, 0.05, 0.2, 0.5, 0.18, GREEN);
    s.push([-1.0, 0.38, 0.18, -0.2, 0.38, 0.18, CYAN], [-1.0, 0.28, 0.18, -0.45, 0.28, 0.18, CYAN]);
    rectXY(s, -1.0, 0.1, -0.62, 0.2, 0.18, PURPLE);
    rectXY(s, 0.35, 0.05, 1.1, 0.5, 0.34, CYAN);
    s.push([0.35, 0.05, 0.34, 1.1, 0.5, 0.34, DIM], [1.1, 0.05, 0.34, 0.35, 0.5, 0.34, DIM]);
    [-1.1, -0.33, 0.44].forEach(x => {
      rectXY(s, x, -0.7, x + 0.66, -0.12, 0.1, CYAN);
      s.push([x + 0.08, -0.25, 0.1, x + 0.5, -0.25, 0.1, DIM], [x + 0.08, -0.35, 0.1, x + 0.4, -0.35, 0.1, DIM]);
    });
    return s;
  }

  // AI：球面に散らした点を近いもの同士でつないだネットワークと、中心の吹き出し
  function ai () {
    const s = [];
    const N = 34, R = 0.95, pts = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - ((i + 0.5) / N) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996;
      pts.push([Math.cos(th) * r * R, y * R * 0.92, Math.sin(th) * r * R]);
    }
    const seen = new Set();
    pts.forEach((p, i) => {
      pts.map((q, j) => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2])
        .filter(([j]) => j !== i)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3)
        .forEach(([j]) => {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (seen.has(key)) return;
          seen.add(key);
          s.push([...p, ...pts[j], (i + j) % 7 === 0 ? PURPLE : CYAN]);
        });
    });
    const ring = 14;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * TAU, b = ((i + 1) / ring) * TAU;
      s.push([Math.cos(a) * 0.36, Math.sin(a) * 0.3, 0, Math.cos(b) * 0.36, Math.sin(b) * 0.3, 0, PURPLE]);
    }
    s.push([-0.16, 0.06, 0, 0.16, 0.06, 0, GREEN], [-0.16, -0.05, 0, 0.06, -0.05, 0, GREEN],
           [-0.1, -0.29, 0, -0.22, -0.48, 0, PURPLE], [-0.22, -0.48, 0, 0.04, -0.3, 0, PURPLE]);
    return s;
  }

  const BUILDERS = { house, web, ai };

  /* ---------- 線分の本数をそろえる（長い線を半分に割って増やす） ---------- */
  function equalize (shape, n) {
    const s = shape.map(q => q.slice());
    while (s.length < n) {
      let bi = 0, bl = -1;
      s.forEach((q, i) => {
        const l = (q[0] - q[3]) ** 2 + (q[1] - q[4]) ** 2 + (q[2] - q[5]) ** 2;
        if (l > bl) { bl = l; bi = i; }
      });
      const q = s[bi];
      const m = [(q[0] + q[3]) / 2, (q[1] + q[4]) / 2, (q[2] + q[5]) / 2];
      s.splice(bi, 1, [q[0], q[1], q[2], ...m, q[6]], [...m, q[3], q[4], q[5], q[6]]);
    }
    // 高さ→方位の順に並べ、形が変わるとき近い位置の線どうしが対応するようにする
    const key = q => Math.round((q[1] + q[4]) * 3) * 10 + Math.atan2(q[2] + q[5], q[0] + q[3]);
    return s.sort((a, b) => key(a) - key(b));
  }

  function mount (canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    // 位置や大きさは画面幅で変えたいので、関数でも受け取れるようにする
    const val = v => (typeof v === 'function' ? v() : v);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const names = (opts.shapes || ['house', 'web', 'ai']).filter(n => BUILDERS[n]);
    const raw = names.map(n => BUILDERS[n]());
    const N = Math.max(...raw.map(s => s.length));
    const shapes = raw.map(s => equalize(s, N));
    const scatter = Array.from({ length: N }, () => {
      const p = [rand(-2.6, 2.6), rand(-1.7, 1.7), rand(-2, 2)];
      return [...p, p[0] + rand(-0.12, 0.12), p[1] + rand(-0.12, 0.12), p[2] + rand(-0.12, 0.12), DIM];
    });

    const COLORS = ['0,200,255', '122,186,42', '180,74,240', '150,170,205'];
    const HOLD = opts.hold || 3600, MORPH = opts.morph || 1500, INTRO = opts.intro || 2000;

    let w = 0, h = 0;
    let index = 0;
    let from = reduce ? shapes[0] : scatter, to = shapes[0];
    let morphing = !reduce, phaseStart = performance.now(), intro = !reduce;
    let yaw = 0.55, yawMouse = 0, yawTarget = 0, tilt = 0.18, tiltTarget = 0.18;
    let mx = -1e4, my = -1e4;
    let visible = true, raf = 0;
    let pending = -1;   // 組み替え中に別の形を指定されたら、終わってから向かう

    function resize () {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) draw(performance.now());
    }

    function project (x, y, z, scale, cx, cy) {
      const cyw = Math.cos(yaw + yawMouse), syw = Math.sin(yaw + yawMouse);
      const X = x * cyw - z * syw;
      let Z = x * syw + z * cyw;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const Y = y * ct - Z * st;
      Z = y * st + Z * ct;
      const f = 3.6 / (3.6 - Z);
      return [cx + X * scale * f, cy - Y * scale * f, f];
    }

    // カーソルの近くの点を押しのける（画面座標で処理）
    function repel (p) {
      const dx = p[0] - mx, dy = p[1] - my, R = 130;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R * R) return;
      const d = Math.sqrt(d2) || 1, force = (1 - d / R) * 30;
      p[0] += (dx / d) * force;
      p[1] += (dy / d) * force;
    }

    function goTo (next, now) {
      from = to;
      index = next;
      to = shapes[index];
      morphing = true;
      intro = false;
      phaseStart = now;
      if (opts.onShape) opts.onShape(index, names[index]);
    }

    function draw (now) {
      const t = now - phaseStart;
      let e = 1;
      if (morphing) {
        e = easeInOut(clamp(t / (intro ? INTRO : MORPH)));
        if (e >= 1) {
          morphing = false; intro = false; from = to; phaseStart = now;
          if (pending >= 0 && pending !== index) { const p = pending; pending = -1; goTo(p, now); }
          else pending = -1;
        }
      } else if (!reduce && names.length > 1 && t > HOLD) {
        goTo((index + 1) % names.length, now);
        e = 0;
      }

      if (!reduce) yaw += 0.0028;
      yawMouse += (yawTarget - yawMouse) * 0.06;
      tilt += (tiltTarget - tilt) * 0.06;

      ctx.clearRect(0, 0, w, h);
      const scale = Math.min(w, h) * (val(opts.scale) || 0.34);
      const cx = w * (val(opts.cx) ?? 0.5), cy = h * (val(opts.cy) ?? 0.5);
      ctx.lineCap = 'round';

      for (let i = 0; i < N; i++) {
        const a = from[i], b = to[i];
        // 線ごとに少しずつ遅らせて、波のように組み上がる
        const k = morphing ? clamp(e * 1.4 - (i / N) * 0.4) : 1;
        const bulge = morphing ? Math.sin(k * Math.PI) * 0.28 : 0;
        const q = [];
        for (let j = 0; j < 6; j++) q.push(lerp(a[j], b[j], k) * (1 + bulge));
        const p1 = project(q[0], q[1], q[2], scale, cx, cy);
        const p2 = project(q[3], q[4], q[5], scale, cx, cy);
        repel(p1); repel(p2);

        const color = k > 0.5 ? b[6] : a[6];
        const depth = (p1[2] + p2[2]) / 2;
        const alpha = clamp((depth - 0.62) * 1.3) * (color === DIM ? 0.38 : 0.95);
        ctx.strokeStyle = `rgba(${COLORS[color]},${alpha.toFixed(3)})`;
        ctx.lineWidth = (color === DIM ? 0.9 : 1.5) * depth;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
        if (i % 3 === 0 && color !== DIM) {
          ctx.fillStyle = `rgba(${COLORS[color]},${(alpha * 0.9).toFixed(3)})`;
          ctx.fillRect(p2[0] - 1.2, p2[1] - 1.2, 2.4, 2.4);
        }
      }
    }

    function loop (now) {
      raf = 0;
      if (!visible || document.hidden) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    }
    const start = () => { if (!raf && !reduce) raf = requestAnimationFrame(loop); };

    const host = opts.pointerTarget || canvas;
    host.addEventListener('pointermove', ev => {
      const r = canvas.getBoundingClientRect();
      mx = ev.clientX - r.left;
      my = ev.clientY - r.top;
      yawTarget = ((ev.clientX - r.left) / r.width - 0.5) * 1.1;
      tiltTarget = 0.18 + ((ev.clientY - r.top) / r.height - 0.5) * 0.5;
    });
    host.addEventListener('pointerleave', () => {
      mx = my = -1e4;
      yawTarget = 0;
      tiltTarget = 0.18;
    });
    canvas.addEventListener('click', () => {
      if (!reduce && !morphing && names.length > 1) goTo((index + 1) % names.length, performance.now());
    });

    new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); }).observe(canvas);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { phaseStart = performance.now(); start(); } });
    window.addEventListener('resize', resize);
    resize();
    if (opts.onShape) opts.onShape(0, names[0]);
    start();

    return {
      next: () => goTo((index + 1) % names.length, performance.now()),
      show (i) {
        if (i < 0 || i >= names.length) return;
        if (reduce) {
          index = i; from = to = shapes[i];
          if (opts.onShape) opts.onShape(i, names[i]);
          draw(performance.now());
          return;
        }
        if (morphing) pending = i;
        else if (i !== index) goTo(i, performance.now());
      },
      get index () { return index; },
    };
  }

  global.HeroScene = { mount };
})(window);
