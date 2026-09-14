/* =========================================================
   WEB VARIANTS（HERO LAB 08）
   FLOW SCENE の「Web」の場面に差し込む、5通りの見せ方。

   どれも同じ形のオブジェクトを返す：
     resize(W, H, narrow)
     update(dt, t, mouse)          // mouse = { x, y, active }
     draw(ctx, t, alpha, build)    // build 0→1 で組み上がっていく
     targets(n, t) → [[x, y], …]   // 点が吸い込まれる輪郭上の位置（画面座標）
     click(x, y)
   ========================================================= */
(function (global) {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const CY = '110,231,255', IN = '165,180,252', PK = '240,171,252', WH = '238,241,250';

  /* ---------- 共通の道具 ---------- */

  // 平面（u 右、v 下、z 奥）を傾けて画面に写す
  function projector (view) {
    return (u, v, z = 0) => {
      const cy = Math.cos(view.ry), sy = Math.sin(view.ry);
      const X = u * cy + z * sy;
      let Z = -u * sy + z * cy;
      const cx = Math.cos(view.rx), sx = Math.sin(view.rx);
      const Y = v * cx - Z * sx;
      Z = v * sx + Z * cx;
      const f = 3.2 / (3.2 + Z);
      return [view.cx + X * view.s * f, view.cy + Y * view.s * f, f];
    };
  }
  function quad (ctx, P, u, v, w, h, z = 0) {
    const a = P(u, v, z), b = P(u + w, v, z), c = P(u + w, v + h, z), d = P(u, v + h, z);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
    return [a, b, c, d];
  }
  function seg (ctx, P, u1, v1, u2, v2, z = 0) {
    const a = P(u1, v1, z), b = P(u2, v2, z);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  function stroke (ctx, color, alpha, width) { ctx.strokeStyle = `rgba(${color},${alpha})`; ctx.lineWidth = width; ctx.stroke(); }
  function fill (ctx, color, alpha) { ctx.fillStyle = `rgba(${color},${alpha})`; ctx.fill(); }
  function inPoly (x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function roundRect (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // 長方形の外周に n 個の点を、周の長さに比例して並べる。[u, v, z, 何番目の長方形か] を返す
  function perimeter (rects, n) {
    const per = rects.map(r => 2 * (r.w + r.h));
    const tot = per.reduce((a, b) => a + b, 0) || 1;
    const counts = per.map(p => Math.max(4, Math.round((p / tot) * n)));
    let sum = counts.reduce((a, b) => a + b, 0), i = 0;
    while (sum > n) { const k = counts.indexOf(Math.max(...counts)); counts[k]--; sum--; }
    while (sum < n) { counts[i % counts.length]++; sum++; i++; }
    const out = [];
    rects.forEach((r, ri) => {
      for (let k = 0; k < counts[ri]; k++) {
        const t = (k / counts[ri]) * per[ri];
        let u, v;
        if (t < r.w) { u = r.u + t; v = r.v; }
        else if (t < r.w + r.h) { u = r.u + r.w; v = r.v + (t - r.w); }
        else if (t < 2 * r.w + r.h) { u = r.u + r.w - (t - r.w - r.h); v = r.v + r.h; }
        else { u = r.u; v = r.v + r.h - (t - 2 * r.w - r.h); }
        out.push([u, v, r.z || 0, ri]);
      }
    });
    return out.slice(0, n);
  }
  // 画面上の枠（パネル）
  function panel (ctx, b, alpha, label) {
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fillStyle = `rgba(6,10,28,${0.86 * alpha})`; ctx.fill();
    ctx.strokeStyle = `rgba(${CY},${0.85 * alpha})`; ctx.lineWidth = 1.3;
    ctx.shadowColor = `rgba(${CY},.45)`; ctx.shadowBlur = 16; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(b.x, b.y + 24); ctx.lineTo(b.x + b.w, b.y + 24);
    ctx.strokeStyle = `rgba(${IN},${0.35 * alpha})`; ctx.lineWidth = 1; ctx.stroke();
    [PK, IN, CY].forEach((c, k) => { ctx.fillStyle = `rgba(${c},${0.9 * alpha})`; ctx.beginPath(); ctx.arc(b.x + 12 + k * 11, b.y + 12, 3, 0, TAU); ctx.fill(); });
    ctx.font = '10px "Space Mono", monospace'; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${WH},${0.55 * alpha})`; ctx.fillText(label, b.x + 50, b.y + 12);
  }

  /* =========================================================
     A. UNFOLD LAYOUT：傾いた平面にサイトのレイアウトが広がる
     ========================================================= */
  function unfold () {
    const view = { cx: 0, cy: 0, s: 1, rx: 0.3, ry: -0.3 };
    const P = projector(view);
    let W = 0, H = 0, hover = -1, cache = null;
    const R = [
      { u: -1.2, v: -0.8, w: 2.4, h: 1.6, k: 'frame' },
      { u: -1.2, v: -0.8, w: 2.4, h: 0.17, k: 'nav' },
      { u: -1.1, v: -0.5, w: 1.08, h: 0.62, k: 'hero' },
      { u: 0.08, v: -0.5, w: 1.02, h: 0.62, k: 'image' },
      { u: -1.1, v: 0.24, w: 0.7, h: 0.46, k: 'card' },
      { u: -0.35, v: 0.24, w: 0.7, h: 0.46, k: 'card' },
      { u: 0.4, v: 0.24, w: 0.7, h: 0.46, k: 'card' },
    ];
    const lift = R.map(() => 0);

    return {
      resize (w, h, narrow) {
        W = w; H = h;
        view.cx = W * (narrow ? 0.5 : 0.68); view.cy = H * (narrow ? 0.3 : 0.5);
        view.s = Math.min(W, H) * (narrow ? 0.24 : 0.29);
      },
      update (dt, t, mouse) {
        const ry = mouse.active ? (mouse.x / W - 0.5) * 0.8 : -0.3 + Math.sin(t * 0.0004) * 0.1;
        const rx = mouse.active ? 0.3 - (mouse.y / H - 0.5) * 0.3 : 0.3;
        const k = Math.min(1, 0.05 * dt);
        view.ry += (ry - view.ry) * k; view.rx += (rx - view.rx) * k;
        // カーソルの下のブロックを持ち上げる
        hover = -1;
        if (mouse.active) for (let i = R.length - 1; i >= 1; i--) {
          const r = R[i];
          if (inPoly(mouse.x, mouse.y, [P(r.u, r.v), P(r.u + r.w, r.v), P(r.u + r.w, r.v + r.h), P(r.u, r.v + r.h)])) { hover = i; break; }
        }
        R.forEach((r, i) => { lift[i] += ((i === hover ? 0.14 : 0) - lift[i]) * Math.min(1, 0.15 * dt); });
      },
      draw (ctx, t, alpha, build) {
        ctx.save();
        ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const lw = Math.max(1, view.s * 0.02);
        R.forEach((r, i) => {
          const a = easeOut(clamp(build * 1.5 - i * 0.09));
          if (a <= 0) return;
          const z = -lift[i] + (1 - a) * 0.5;   // 奥から手前へ出てくる
          const hh = r.h * a, hot = i === hover;
          quad(ctx, P, r.u, r.v, r.w, hh, z);
          if (r.k === 'frame') { ctx.fillStyle = 'rgba(6,10,28,.8)'; ctx.fill(); }
          else if (r.k === 'image') {
            const p0 = P(r.u, r.v, z), p1 = P(r.u + r.w, r.v + hh, z);
            const g = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
            g.addColorStop(0, `rgba(${PK},.24)`); g.addColorStop(1, `rgba(${CY},.12)`);
            ctx.fillStyle = g; ctx.fill();
          } else fill(ctx, r.k === 'nav' ? CY : IN, hot ? 0.16 : 0.06);
          if (hot) { ctx.shadowColor = `rgba(${CY},.9)`; ctx.shadowBlur = 18; }
          stroke(ctx, hot ? WH : CY, 0.9 * a, hot ? 2 : 1.2);
          ctx.shadowBlur = 0;
          if (a < 0.7) return;
          const c = (a - 0.7) / 0.3;

          if (r.k === 'nav') {
            ctx.beginPath();
            seg(ctx, P, r.u + 0.08, r.v + 0.085, r.u + 0.32, r.v + 0.085, z);
            for (let k = 0; k < 4; k++) seg(ctx, P, 0.1 + k * 0.2, r.v + 0.085, 0.22 + k * 0.2, r.v + 0.085, z);
            stroke(ctx, WH, 0.8 * c, lw);
            quad(ctx, P, 0.92, r.v + 0.04, 0.2, 0.09, z); fill(ctx, PK, 0.7 * c);
          } else if (r.k === 'hero') {
            ctx.beginPath();
            seg(ctx, P, r.u + 0.06, r.v + 0.12, r.u + 0.9, r.v + 0.12, z);
            seg(ctx, P, r.u + 0.06, r.v + 0.24, r.u + 0.66, r.v + 0.24, z);
            stroke(ctx, WH, 0.9 * c, lw * 2.2);
            ctx.beginPath();
            seg(ctx, P, r.u + 0.06, r.v + 0.36, r.u + 0.84, r.v + 0.36, z);
            seg(ctx, P, r.u + 0.06, r.v + 0.42, r.u + 0.7, r.v + 0.42, z);
            stroke(ctx, IN, 0.7 * c, lw * 0.8);
            quad(ctx, P, r.u + 0.06, r.v + 0.5, 0.3, 0.08, z); fill(ctx, CY, 0.85 * c * (0.6 + 0.4 * Math.sin(t * 0.004)));
            quad(ctx, P, r.u + 0.4, r.v + 0.5, 0.26, 0.08, z); stroke(ctx, CY, 0.8 * c, 1);
          } else if (r.k === 'image') {
            ctx.beginPath();
            seg(ctx, P, r.u, r.v, r.u + r.w, r.v + r.h, z); seg(ctx, P, r.u + r.w, r.v, r.u, r.v + r.h, z);
            stroke(ctx, WH, 0.3 * c, 1);
            const su = r.u + clamp(((t * 0.0004) % 1.6) - 0.3) * r.w;   // 光が横切る
            ctx.beginPath(); seg(ctx, P, su, r.v, su, r.v + r.h, z); stroke(ctx, WH, 0.5 * c, lw * 1.5);
          } else if (r.k === 'card') {
            quad(ctx, P, r.u + 0.04, r.v + 0.04, r.w - 0.08, r.h * 0.46, z); fill(ctx, i % 2 ? PK : CY, (hot ? 0.3 : 0.14) * c);
            ctx.beginPath(); seg(ctx, P, r.u + 0.06, r.v + 0.32, r.u + 0.5, r.v + 0.32, z); stroke(ctx, WH, 0.75 * c, lw);
            ctx.beginPath(); seg(ctx, P, r.u + 0.06, r.v + 0.39, r.u + 0.6, r.v + 0.39, z); stroke(ctx, IN, 0.55 * c, lw * 0.7);
          }
        });
        ctx.restore();
      },
      targets (n) {
        if (!cache || cache.n !== n) cache = { n, pts: perimeter(R, n) };
        return cache.pts.map(([u, v]) => P(u, v, 0));
      },
      click () {},
    };
  }

  /* =========================================================
     B. PHONE FEED：浮かぶスマホの中でフィードが流れる
     ========================================================= */
  function phoneFeed () {
    const view = { cx: 0, cy: 0, s: 1, rx: 0.12, ry: -0.4 };
    const P = projector(view);
    let W = 0, H = 0, scroll = 0, lastBuild = 0, cache = null;
    const ripples = [];
    const BODY = { u: -0.5, v: -1.02, w: 1.0, h: 2.04 };
    const SCR = { u: -0.44, v: -0.94, w: 0.88, h: 1.88 };
    const CARD_H = 0.5, GAP = 0.06, FEED_TOP = -0.56;
    const TARGET_RECTS = [
      BODY, SCR,
      { u: SCR.u, v: SCR.v, w: SCR.w, h: 0.3 },
      { u: SCR.u, v: 0.8, w: SCR.w, h: 0.14 },
      { u: SCR.u + 0.04, v: FEED_TOP, w: SCR.w - 0.08, h: CARD_H },
      { u: SCR.u + 0.04, v: FEED_TOP + CARD_H + GAP, w: SCR.w - 0.08, h: CARD_H },
    ];

    return {
      resize (w, h, narrow) {
        W = w; H = h;
        view.cx = W * (narrow ? 0.5 : 0.7); view.cy = H * (narrow ? 0.31 : 0.5);
        view.s = Math.min(W, H) * (narrow ? 0.19 : 0.27);
      },
      update (dt, t, mouse) {
        const ry = mouse.active ? (mouse.x / W - 0.5) * 0.9 : -0.4 + Math.sin(t * 0.0005) * 0.14;
        const rx = mouse.active ? 0.12 - (mouse.y / H - 0.5) * 0.3 : 0.12 + Math.sin(t * 0.0007) * 0.04;
        const k = Math.min(1, 0.05 * dt);
        view.ry += (ry - view.ry) * k; view.rx += (rx - view.rx) * k;
        scroll += 0.0045 * dt * clamp((lastBuild - 0.6) / 0.4);
        for (let i = ripples.length - 1; i >= 0; i--) {
          ripples[i].r += 3 * dt; ripples[i].a -= 0.025 * dt;
          if (ripples[i].a <= 0) ripples.splice(i, 1);
        }
      },
      draw (ctx, t, alpha, build) {
        lastBuild = build;
        ctx.save();
        ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const a = easeOut(clamp(build * 1.3));
        const z = (1 - a) * 0.8;
        const lw = Math.max(1, view.s * 0.018);

        quad(ctx, P, BODY.u, BODY.v, BODY.w, BODY.h, z); ctx.fillStyle = 'rgba(5,8,22,.92)'; ctx.fill();
        ctx.shadowColor = `rgba(${CY},.6)`; ctx.shadowBlur = 22; stroke(ctx, CY, 0.9 * a, 2.2); ctx.shadowBlur = 0;

        quad(ctx, P, SCR.u, SCR.v, SCR.w, SCR.h, z); stroke(ctx, IN, 0.5 * a, 1);
        ctx.save();
        ctx.clip();
        const c = clamp((build - 0.4) / 0.6);
        if (c > 0) {
          const step = CARD_H + GAP, off = scroll % step, base = Math.floor(scroll / step);
          for (let k = -1; k < 5; k++) {
            const v = FEED_TOP + k * step - off;
            if (v > 0.8 || v + CARD_H < SCR.v + 0.3) continue;
            const hue = [CY, PK, IN][(((base + k) % 3) + 3) % 3];
            quad(ctx, P, SCR.u + 0.04, v, SCR.w - 0.08, CARD_H, z); fill(ctx, IN, 0.06 * c); stroke(ctx, CY, 0.55 * c, 1);
            quad(ctx, P, SCR.u + 0.08, v + 0.04, SCR.w - 0.16, CARD_H * 0.52, z); fill(ctx, hue, 0.25 * c);
            ctx.beginPath(); seg(ctx, P, SCR.u + 0.1, v + 0.34, SCR.u + 0.56, v + 0.34, z); stroke(ctx, WH, 0.8 * c, lw);
            ctx.beginPath(); seg(ctx, P, SCR.u + 0.1, v + 0.41, SCR.u + 0.7, v + 0.41, z); stroke(ctx, IN, 0.6 * c, lw * 0.7);
            const hp = P(SCR.u + SCR.w - 0.14, v + 0.4, z);
            ctx.beginPath(); ctx.arc(hp[0], hp[1], Math.max(2, view.s * 0.02 * hp[2]), 0, TAU); fill(ctx, PK, 0.8 * c);
          }
          // 上：ヘッダーとストーリー
          quad(ctx, P, SCR.u, SCR.v, SCR.w, 0.3, z); ctx.fillStyle = 'rgba(5,8,22,.97)'; ctx.fill();
          ctx.beginPath(); seg(ctx, P, SCR.u + 0.08, SCR.v + 0.08, SCR.u + 0.38, SCR.v + 0.08, z); stroke(ctx, WH, 0.85 * c, lw * 1.3);
          for (let k = 0; k < 5; k++) {
            const p = P(SCR.u + 0.12 + k * 0.16, SCR.v + 0.2, z);
            ctx.beginPath(); ctx.arc(p[0], p[1], view.s * 0.05 * p[2], 0, TAU);
            stroke(ctx, k % 2 ? PK : CY, 0.9 * c, 1.5);
          }
          // 下：タブバー
          quad(ctx, P, SCR.u, 0.8, SCR.w, 0.14, z); ctx.fillStyle = 'rgba(5,8,22,.97)'; ctx.fill();
          for (let k = 0; k < 4; k++) {
            const p = P(SCR.u + 0.13 + k * 0.2, 0.87, z);
            ctx.fillStyle = `rgba(${k === 0 ? CY : WH},${(k === 0 ? 0.95 : 0.4) * c})`;
            ctx.fillRect(p[0] - 3, p[1] - 3, 6, 6);
          }
          // 右下の丸いボタン
          const fp = P(SCR.u + SCR.w - 0.14, 0.66, z);
          ctx.beginPath(); ctx.arc(fp[0], fp[1], view.s * 0.07 * fp[2] * (1 + 0.08 * Math.sin(t * 0.005)), 0, TAU);
          ctx.shadowColor = `rgba(${PK},.9)`; ctx.shadowBlur = 18; fill(ctx, PK, 0.9 * c); ctx.shadowBlur = 0;
        }
        for (const r of ripples) { ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); stroke(ctx, WH, r.a, 2); }
        ctx.restore();
        quad(ctx, P, -0.12, SCR.v + 0.015, 0.24, 0.045, z); ctx.fillStyle = '#02040c'; ctx.fill();   // ノッチ
        ctx.restore();
      },
      targets (n) {
        if (!cache || cache.n !== n) cache = { n, pts: perimeter(TARGET_RECTS, n) };
        return cache.pts.map(([u, v]) => P(u, v, 0));
      },
      click (x, y) { ripples.push({ x, y, r: 4, a: 0.9 }); },
    };
  }

  /* =========================================================
     C. MULTI SCREEN：幅の違う画面が3Dに浮かぶ（レスポンシブ）
     ========================================================= */
  function multiScreen () {
    const view = { cx: 0, cy: 0, s: 1, rx: 0.16, ry: -0.25 };
    const P = projector(view);
    let W = 0, H = 0, cache = null;
    const WINS = [
      { label: 'CODE', u: 0.2, v: -1.0, w: 0.9, h: 0.52, z: 0.7, code: true },
      { label: '768px', u: -1.45, v: -0.5, w: 0.66, h: 0.9, z: 0.4, cols: 2 },
      { label: '1440px', u: -0.85, v: -0.62, w: 1.5, h: 0.98, z: 0, cols: 3 },
      { label: '375px', u: 0.78, v: -0.18, w: 0.36, h: 0.74, z: -0.45, cols: 1 },
    ];
    const bob = (i, t) => Math.sin(t * 0.0012 + i * 1.7) * 0.03;

    return {
      resize (w, h, narrow) {
        W = w; H = h;
        view.cx = W * (narrow ? 0.52 : 0.68); view.cy = H * (narrow ? 0.3 : 0.5);
        view.s = Math.min(W, H) * (narrow ? 0.21 : 0.27);
      },
      update (dt, t, mouse) {
        const ry = mouse.active ? (mouse.x / W - 0.5) * 0.9 : -0.25 + Math.sin(t * 0.0004) * 0.15;
        const rx = mouse.active ? 0.16 - (mouse.y / H - 0.5) * 0.25 : 0.16;
        const k = Math.min(1, 0.05 * dt);
        view.ry += (ry - view.ry) * k; view.rx += (rx - view.rx) * k;
      },
      draw (ctx, t, alpha, build) {
        ctx.save();
        ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const lw = Math.max(1, view.s * 0.016);

        // 画面どうしをつなぐ点線（同じデザインが各画面に展開されている感じ）
        if (build > 0.5) {
          const d = WINS[2];
          ctx.save();
          ctx.setLineDash([4, 6]); ctx.lineDashOffset = -t * 0.03;
          ctx.beginPath();
          [[1, d.u, d.v + 0.1], [3, d.u + d.w, d.v + d.h * 0.6], [0, d.u + d.w * 0.7, d.v]].forEach(([j, uu, vv]) => {
            const o = WINS[j];
            const a = P(uu, vv + bob(2, t), d.z), b = P(o.u + o.w / 2, o.v + o.h / 2 + bob(j, t), o.z);
            ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
          });
          stroke(ctx, IN, 0.45 * clamp((build - 0.5) / 0.5), 1);
          ctx.restore();
        }

        const order = WINS.map((_, i) => i).sort((a, b) => WINS[b].z - WINS[a].z);
        order.forEach((i, rank) => {
          const win = WINS[i];
          const a = easeOut(clamp(build * 1.6 - rank * 0.15));
          if (a <= 0) return;
          const z = win.z + (1 - a) * 0.9, v0 = win.v + bob(i, t);
          quad(ctx, P, win.u, v0, win.w, win.h, z); ctx.fillStyle = 'rgba(6,10,28,.88)'; ctx.fill();
          ctx.shadowColor = `rgba(${CY},.5)`; ctx.shadowBlur = 14; stroke(ctx, CY, 0.9 * a, 1.4); ctx.shadowBlur = 0;
          ctx.beginPath(); seg(ctx, P, win.u, v0 + 0.08, win.u + win.w, v0 + 0.08, z); stroke(ctx, IN, 0.5 * a, 1);
          [PK, IN, CY].forEach((col, k) => {
            const p = P(win.u + 0.05 + k * 0.045, v0 + 0.04, z);
            ctx.fillStyle = `rgba(${col},${0.9 * a})`; ctx.fillRect(p[0] - 2, p[1] - 2, 4, 4);
          });
          const lp = P(win.u, v0 - 0.05, z);
          ctx.font = `${Math.round(Math.max(9, 10 * lp[2]))}px "Space Mono", monospace`; ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = `rgba(${CY},${0.85 * a})`; ctx.fillText(win.label, lp[0], lp[1]);
          if (a < 0.6) return;

          const c = (a - 0.6) / 0.4, pad = 0.05, top = v0 + 0.13, iw = win.w - pad * 2;
          if (win.code) {
            const lines = 7, sc = (t * 0.00025) % 1;
            for (let k = 0; k < lines; k++) {
              const vv = top + ((k / lines + 1 - sc) % 1) * (win.h - 0.18);
              const len = 0.25 + ((k * 37) % 10) / 16;
              ctx.beginPath(); seg(ctx, P, win.u + pad + (k % 3) * 0.05, vv, win.u + pad + Math.min(iw, len * iw), vv, z);
              stroke(ctx, [CY, PK, IN, WH][k % 4], 0.7 * c, lw);
            }
            return;
          }
          const heroH = win.h * 0.3;
          quad(ctx, P, win.u + pad, top, iw, heroH, z); fill(ctx, PK, 0.12 * c);
          ctx.beginPath(); seg(ctx, P, win.u + pad * 2, top + heroH * 0.35, win.u + pad * 2 + iw * 0.55, top + heroH * 0.35, z); stroke(ctx, WH, 0.85 * c, lw * 1.5);
          ctx.beginPath(); seg(ctx, P, win.u + pad * 2, top + heroH * 0.62, win.u + pad * 2 + iw * 0.4, top + heroH * 0.62, z); stroke(ctx, IN, 0.6 * c, lw * 0.8);
          // カードの列数が、画面の幅で変わる
          const cols = win.cols, gap = 0.03, cw = (iw - gap * (cols - 1)) / cols, ch = win.h * 0.2;
          for (let r = 0; r < 2; r++) for (let q = 0; q < cols; q++) {
            const cu = win.u + pad + q * (cw + gap), cv = top + heroH + 0.04 + r * (ch + gap);
            if (cv + ch > v0 + win.h - 0.03) continue;
            const pop = clamp(c * 3 - (r * cols + q) * 0.25);
            quad(ctx, P, cu, cv, cw, ch * pop, z); fill(ctx, CY, 0.08 * pop); stroke(ctx, CY, 0.6 * pop, 1);
          }
        });
        ctx.restore();
      },
      targets (n, t) {
        if (!cache || cache.n !== n) cache = { n, pts: perimeter(WINS.map(w => ({ u: w.u, v: w.v, w: w.w, h: w.h, z: w.z })), n) };
        return cache.pts.map(([u, v, z, i]) => P(u, v + bob(i, t), z));
      },
      click () {},
    };
  }

  /* =========================================================
     D. CODE → PAGE：左で打ったコードが、右のページになる
     ========================================================= */
  function codeToPage () {
    let W = 0, H = 0, narrow = false, startAt = null, hover = -1;
    let ed = { x: 0, y: 0, w: 1, h: 1 }, pg = { x: 0, y: 0, w: 1, h: 1 };
    const off = { x: 0, y: 0 };
    const LINES = [
      { seg: [['<', CY], ['header', PK], [' class=', IN], ['"nav"', WH], ['>', CY]], el: 0 },
      { seg: [['  <a ', CY], ['class=', IN], ['"logo"', WH], ['>CROSSACTOR</a>', CY]], el: 1 },
      { seg: [['</header>', CY]] },
      { seg: [['<', CY], ['section', PK], [' class=', IN], ['"hero"', WH], ['>', CY]], el: 2 },
      { seg: [['  <h1>', CY], ['見て、触れる。', WH], ['</h1>', CY]], el: 3 },
      { seg: [['  <a ', CY], ['class=', IN], ['"btn"', WH], ['>相談する</a>', CY]], el: 4 },
      { seg: [['</section>', CY]] },
      { seg: [['<', CY], ['ul', PK], [' class=', IN], ['"cards"', WH], ['>', CY]], el: 5 },
      { seg: [['  <li>', CY], ['3D VR', WH], ['</li><li>', CY], ['WEB', WH], ['</li><li>', CY], ['AI', WH], ['</li>', CY]], el: 6 },
      { seg: [['</ul>', CY]] },
    ];
    const LEN = LINES.map(l => l.seg.reduce((a, s) => a + [...s[0]].length, 0));
    const END = LEN.reduce((acc, l, i) => (acc.push((acc[i - 1] || 0) + l), acc), []);
    const TOTAL = END[END.length - 1];
    // ページの中の要素（ページ枠の中の 0〜1 の位置）
    const ELS = [
      { x: 0.03, y: 0.03, w: 0.94, h: 0.1 },    // nav
      { x: 0.06, y: 0.055, w: 0.24, h: 0.05 },  // logo
      { x: 0.03, y: 0.17, w: 0.94, h: 0.42 },   // hero
      { x: 0.08, y: 0.25, w: 0.6, h: 0.12 },    // title
      { x: 0.08, y: 0.44, w: 0.26, h: 0.08 },   // button
      { x: 0.03, y: 0.64, w: 0.94, h: 0.32 },   // cards
      { x: 0.03, y: 0.64, w: 0.94, h: 0.32 },   // card items
    ];
    const CPS = 32, HOLD = 3200;
    const CYCLE = (TOTAL / CPS) * 1000 + HOLD;
    const pgRect = (e, dx, dy) => ({ x: pg.x + dx + e.x * pg.w, y: pg.y + dy + e.y * pg.h, w: e.w * pg.w, h: e.h * pg.h });

    return {
      resize (w, h, n) {
        W = w; H = h; narrow = n;
        if (narrow) {
          // スマホは右上の HUD（〜高さ16%）の下から始める
          ed = { x: W * 0.05, y: H * 0.18, w: W * 0.44, h: H * 0.25 };
          pg = { x: W * 0.52, y: H * 0.17, w: W * 0.43, h: H * 0.27 };
        } else {
          ed = { x: W * 0.55, y: H * 0.26, w: W * 0.2, h: H * 0.46 };
          pg = { x: W * 0.77, y: H * 0.2, w: W * 0.2, h: H * 0.58 };
        }
      },
      update (dt, t, mouse) {
        const tx = mouse.active ? (mouse.x / W - 0.5) * 16 : 0, ty = mouse.active ? (mouse.y / H - 0.5) * 12 : 0;
        off.x += (tx - off.x) * Math.min(1, 0.06 * dt); off.y += (ty - off.y) * Math.min(1, 0.06 * dt);
        hover = -1;
        if (mouse.active) {
          for (const i of [4, 3, 1, 0, 2, 5]) {
            const r = pgRect(ELS[i], off.x, off.y);
            if (mouse.x > r.x && mouse.x < r.x + r.w && mouse.y > r.y && mouse.y < r.y + r.h) { hover = i; break; }
          }
        }
      },
      draw (ctx, t, alpha, build) {
        if (build < 1) startAt = null; else if (startAt === null) startAt = t;
        const el = startAt === null ? 0 : (t - startAt) % CYCLE;
        const typed = startAt === null ? 0 : Math.min(TOTAL, (el / 1000) * CPS);
        const fade = el > CYCLE - 600 ? 1 - (el - (CYCLE - 600)) / 600 : 1;
        const a = easeOut(clamp(build * 1.4));

        ctx.save();
        ctx.globalAlpha = alpha;
        const e0 = { x: ed.x + off.x * 0.5, y: ed.y + off.y * 0.5, w: ed.w, h: ed.h };
        const p0 = { x: pg.x + off.x, y: pg.y + off.y, w: pg.w, h: pg.h };
        panel(ctx, e0, a, 'index.html');
        panel(ctx, p0, a, 'preview');

        // コード
        const lh = (ed.h - 40) / LINES.length;
        const fs = Math.max(9, Math.min(12, lh * 0.6));
        ctx.font = `${fs}px "Space Mono", monospace`; ctx.textBaseline = 'middle';
        let caret = null;
        LINES.forEach((line, i) => {
          const start = i ? END[i - 1] : 0;
          const shown = clamp(typed - start, 0, LEN[i]);
          const y = e0.y + 34 + lh * (i + 0.5);
          ctx.fillStyle = `rgba(${IN},${0.35 * a})`; ctx.fillText(String(i + 1).padStart(2, ' '), e0.x + 8, y);
          if (line.el !== undefined && hover === line.el) { ctx.fillStyle = `rgba(${CY},${0.12 * a})`; ctx.fillRect(e0.x + 2, y - lh / 2, e0.w - 4, lh); }
          let x = e0.x + 30, left = shown;
          for (const [txt, col] of line.seg) {
            if (left <= 0) break;
            const part = [...txt].slice(0, left).join('');
            ctx.fillStyle = `rgba(${col},${0.95 * a * fade})`; ctx.fillText(part, x, y);
            x += ctx.measureText(part).width; left -= [...txt].length;
          }
          if (shown > 0 && shown < LEN[i]) caret = [x, y];
          if (line.el !== undefined) line.endX = x;
          line.y = y;
        });
        if (caret && Math.sin(t * 0.012) > 0) { ctx.fillStyle = `rgba(${CY},${a})`; ctx.fillRect(caret[0] + 1, caret[1] - fs * 0.6, 2, fs * 1.2); }

        // ページ：その行が打ち終わった要素から現れる
        LINES.forEach((line, i) => {
          if (line.el === undefined) return;
          const p = clamp((typed - END[i]) / 6) * fade;
          if (p <= 0) return;
          const r = pgRect(ELS[line.el], off.x, off.y), k = line.el, hot = hover === k;
          const pop = easeOut(p);
          ctx.save();
          ctx.globalAlpha = alpha * pop;
          if (k === 0) { roundRect(ctx, r.x, r.y, r.w, r.h, 4); fill(ctx, CY, 0.08); stroke(ctx, CY, 0.7, 1); }
          if (k === 1) { ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h / 2); ctx.lineTo(r.x + r.w, r.y + r.h / 2); stroke(ctx, WH, 0.9, Math.max(2, r.h * 0.5)); }
          if (k === 2) { roundRect(ctx, r.x, r.y, r.w, r.h, 6); fill(ctx, PK, 0.1); stroke(ctx, PK, 0.6, 1); }
          if (k === 3) {
            ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h * 0.3); ctx.lineTo(r.x + r.w * pop, r.y + r.h * 0.3);
            ctx.moveTo(r.x, r.y + r.h * 0.8); ctx.lineTo(r.x + r.w * 0.7 * pop, r.y + r.h * 0.8);
            stroke(ctx, WH, 0.95, Math.max(3, r.h * 0.28));
          }
          if (k === 4) { roundRect(ctx, r.x, r.y, r.w, r.h, r.h / 2); ctx.shadowColor = `rgba(${CY},.8)`; ctx.shadowBlur = 12; fill(ctx, CY, 0.9); ctx.shadowBlur = 0; }
          if (k === 5) { roundRect(ctx, r.x, r.y, r.w, r.h, 6); stroke(ctx, IN, 0.35, 1); }
          if (k === 6) {
            const cw = (r.w - 16) / 3;
            [CY, PK, IN].forEach((col, q) => {
              roundRect(ctx, r.x + 4 + q * (cw + 4), r.y + 6, cw, (r.h - 12) * pop, 5);
              fill(ctx, col, 0.14); stroke(ctx, col, 0.8, 1);
            });
          }
          if (hot) { roundRect(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 6); stroke(ctx, WH, 0.9, 1.5); }
          ctx.restore();
          // 打ち終わった直後、コードの行末からページへ光が飛ぶ
          if (p < 1 || hot) {
            const sx = line.endX, sy = line.y, ex = r.x + r.w / 2, ey = r.y + r.h / 2;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); stroke(ctx, CY, (hot ? 0.5 : 0.35 * (1 - p)) * alpha, 1);
            if (p < 1) {
              ctx.fillStyle = '#fff'; ctx.shadowColor = `rgba(${CY},1)`; ctx.shadowBlur = 12;
              ctx.beginPath(); ctx.arc(lerp(sx, ex, p), lerp(sy, ey, p), 2.5, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
            }
          }
        });
        ctx.restore();
      },
      targets (n) {
        const rects = [
          { u: ed.x, v: ed.y, w: ed.w, h: ed.h }, { u: pg.x, v: pg.y, w: pg.w, h: pg.h },
          ...[0, 2, 5].map(i => { const r = pgRect(ELS[i], 0, 0); return { u: r.x, v: r.y, w: r.w, h: r.h }; }),
        ];
        return perimeter(rects, n).map(([u, v]) => [u + off.x, v + off.y]);
      },
      click () {},
    };
  }

  /* =========================================================
     E. CURSOR BUILD：カーソルがデザインツールのように画面を組む
     ========================================================= */
  function cursorBuild () {
    let W = 0, H = 0, startAt = null, hover = -1;
    let board = { x: 0, y: 0, w: 1, h: 1 };
    const off = { x: 0, y: 0 };
    const CYCLE = 9400;
    const HERO = { x: 0.06, y: 0.1, w: 0.88, h: 0.36 };
    const TITLE = { x: 0.12, y: 0.2, w: 0.5, h: 0.06 };
    const BTN = { x: 0.12, y: 0.34, w: 0.2, h: 0.07 };
    const CARDS = [0, 1, 2].map(i => ({ x: 0.06 + i * 0.3, y: 0.56, w: 0.28, h: 0.3 }));
    const ELEMENTS = [HERO, TITLE, BTN, ...CARDS];
    // カーソルの台本：[時刻ms, x, y, 押しているか]
    const PATH = [
      [0, 0.5, 0.95, 0], [700, 0.06, 0.1, 0], [900, 0.06, 0.1, 1], [2000, 0.94, 0.46, 1], [2150, 0.94, 0.46, 0],
      [2700, 0.12, 0.2, 0], [2800, 0.12, 0.2, 1], [3600, 0.62, 0.26, 1], [3700, 0.62, 0.26, 0],
      [4200, 0.12, 0.34, 0], [4300, 0.12, 0.34, 1], [4900, 0.32, 0.41, 1], [5000, 0.32, 0.41, 0],
      [5500, 0.2, 0.71, 0], [5600, 0.2, 0.71, 1], [5700, 0.2, 0.71, 0],
      [6100, 0.5, 0.71, 0], [6200, 0.5, 0.71, 1], [6300, 0.5, 0.71, 0],
      [6700, 0.8, 0.71, 0], [6800, 0.8, 0.71, 1], [6900, 0.8, 0.71, 0],
      [7300, 0.02, 0.52, 0], [7400, 0.02, 0.52, 1], [8000, 0.98, 0.9, 1], [8100, 0.98, 0.9, 0],
      [9400, 0.5, 0.95, 0],
    ];
    const cursorAt = ms => {
      for (let i = 1; i < PATH.length; i++) {
        if (ms <= PATH[i][0]) {
          const [t0, x0, y0, d0] = PATH[i - 1], [t1, x1, y1] = PATH[i];
          const k = easeInOut(clamp((ms - t0) / Math.max(1, t1 - t0)));
          return { x: lerp(x0, x1, k), y: lerp(y0, y1, k), down: !!d0 };
        }
      }
      const l = PATH[PATH.length - 1];
      return { x: l[1], y: l[2], down: false };
    };
    const toPx = r => ({ x: board.x + off.x + r.x * board.w, y: board.y + off.y + r.y * board.h, w: r.w * board.w, h: r.h * board.h });

    function label (ctx, text, x, y, color, a) {
      ctx.font = '10px "Space Mono", monospace'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(text).width + 10;
      roundRect(ctx, x - w / 2, y - 8, w, 16, 4); fill(ctx, color, 0.95 * a);
      ctx.fillStyle = `rgba(3,4,10,${a})`; ctx.fillText(text, x - w / 2 + 5, y + 0.5);
    }

    return {
      resize (w, h, narrow) {
        W = w; H = h;
        // スマホは右上の HUD とロゴの下から始める
        board = narrow ? { x: W * 0.07, y: H * 0.19, w: W * 0.86, h: H * 0.25 } : { x: W * 0.56, y: H * 0.2, w: W * 0.4, h: H * 0.58 };
      },
      update (dt, t, mouse) {
        const tx = mouse.active ? (mouse.x / W - 0.5) * 14 : 0, ty = mouse.active ? (mouse.y / H - 0.5) * 10 : 0;
        off.x += (tx - off.x) * Math.min(1, 0.06 * dt); off.y += (ty - off.y) * Math.min(1, 0.06 * dt);
        hover = -1;
        if (mouse.active) {
          [BTN, TITLE, ...CARDS, HERO].some(r => {
            const p = toPx(r);
            if (mouse.x > p.x && mouse.x < p.x + p.w && mouse.y > p.y && mouse.y < p.y + p.h) { hover = ELEMENTS.indexOf(r); return true; }
            return false;
          });
        }
      },
      draw (ctx, t, alpha, build) {
        if (build < 1) startAt = null; else if (startAt === null) startAt = t;
        const ms = startAt === null ? 0 : (t - startAt) % CYCLE;
        const fade = ms > CYCLE - 700 ? 1 - (ms - (CYCLE - 700)) / 700 : 1;
        const a = easeOut(clamp(build * 1.4));
        const b = { x: board.x + off.x, y: board.y + off.y, w: board.w, h: board.h };

        ctx.save();
        ctx.globalAlpha = alpha;
        // アートボードと方眼の点
        roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.fillStyle = `rgba(6,10,28,${0.85 * a})`; ctx.fill();
        ctx.shadowColor = `rgba(${CY},.45)`; ctx.shadowBlur = 16; stroke(ctx, CY, 0.8 * a, 1.2); ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(${IN},${0.18 * a})`;
        for (let y = b.y + 16; y < b.y + b.h; y += 18) for (let x = b.x + 16; x < b.x + b.w; x += 18) ctx.fillRect(x, y, 1, 1);
        ctx.font = '10px "Space Mono", monospace'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = `rgba(${CY},${0.7 * a})`; ctx.fillText('Artboard — Desktop 1440', b.x, b.y - 8);

        // 組み上がる前は、完成形をうっすら見せておく（点が集まる先）
        if (build < 1) {
          ELEMENTS.forEach(r => { const p = toPx(r); roundRect(ctx, p.x, p.y, p.w, p.h, 5); stroke(ctx, CY, 0.35 * a, 1); });
        }

        if (startAt !== null) {
          const cur = cursorAt(ms);
          const cx = b.x + cur.x * b.w, cy = b.y + cur.y * b.h;
          ctx.globalAlpha = alpha * fade;

          // ヒーロー：ドラッグで描く
          if (ms > 900) {
            const done = ms > 2000;
            const x1 = done ? HERO.x + HERO.w : cur.x, y1 = done ? HERO.y + HERO.h : cur.y;
            const p = toPx({ x: HERO.x, y: HERO.y, w: Math.max(0.001, x1 - HERO.x), h: Math.max(0.001, y1 - HERO.y) });
            roundRect(ctx, p.x, p.y, p.w, p.h, 6); fill(ctx, PK, done ? 0.12 : 0.06); stroke(ctx, done ? PK : CY, 0.85, 1.2);
            if (!done) label(ctx, `${Math.round((x1 - HERO.x) * 1440)} × ${Math.round((y1 - HERO.y) * 900)}`, p.x + p.w / 2, p.y + p.h + 14, CY, 1);
          }
          // 見出し：文字を打つように伸びる
          if (ms > 2800) {
            const k = clamp((ms - 2800) / 800), p = toPx(TITLE);
            ctx.beginPath(); ctx.moveTo(p.x, p.y + p.h / 2); ctx.lineTo(p.x + p.w * k, p.y + p.h / 2);
            stroke(ctx, WH, 0.95, Math.max(4, p.h * 0.7));
          }
          // ボタン：左端をそろえるガイド線つき
          if (ms > 4300) {
            const k = easeOut(clamp((ms - 4300) / 600)), p = toPx(BTN), tp = toPx(TITLE);
            roundRect(ctx, p.x, p.y, p.w * k, p.h * k, (p.h * k) / 2); fill(ctx, CY, 0.9);
            if (ms < 5400) {
              ctx.beginPath(); ctx.moveTo(p.x, tp.y - 10); ctx.lineTo(p.x, p.y + p.h + 10); stroke(ctx, PK, 0.95, 1);
              label(ctx, `${Math.round((BTN.y - TITLE.y - TITLE.h) * 900)}`, p.x + 16, (tp.y + tp.h + p.y) / 2, PK, 1);
            }
          }
          // カード：クリックのたびに1枚ずつ置かれる
          [5600, 6200, 6800].forEach((at, i) => {
            if (ms < at) return;
            const k = easeOut(clamp((ms - at) / 350)), p = toPx(CARDS[i]);
            const s = 0.8 + 0.2 * k;
            roundRect(ctx, p.x + (p.w * (1 - s)) / 2, p.y + (p.h * (1 - s)) / 2, p.w * s, p.h * s, 6);
            fill(ctx, [CY, PK, IN][i], 0.12 * k); stroke(ctx, [CY, PK, IN][i], 0.85 * k, 1.2);
            if (k > 0.8) {
              ctx.beginPath(); ctx.moveTo(p.x + 10, p.y + p.h * 0.62); ctx.lineTo(p.x + p.w * 0.7, p.y + p.h * 0.62); stroke(ctx, WH, 0.8, 3);
            }
          });
          // カードの間隔の表示
          if (ms > 6900 && ms < 8600) {
            [0, 1].forEach(i => {
              const p = toPx(CARDS[i]), q = toPx(CARDS[i + 1]);
              const y = p.y + p.h + 12;
              ctx.beginPath(); ctx.moveTo(p.x + p.w, y); ctx.lineTo(q.x, y); stroke(ctx, PK, 0.9, 1);
              label(ctx, '24', (p.x + p.w + q.x) / 2, y + 12, PK, 1);
            });
          }
          // 範囲選択 → まとめて選択された枠
          if (ms > 7400 && ms <= 8000) {
            const x0 = b.x + 0.02 * b.w, y0 = b.y + 0.52 * b.h;
            ctx.save(); ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.rect(x0, y0, cx - x0, cy - y0); fill(ctx, CY, 0.08); stroke(ctx, CY, 0.9, 1);
            ctx.restore();
          }
          if (ms > 8000) {
            const p0 = toPx(CARDS[0]), p2 = toPx(CARDS[2]);
            const sel = { x: p0.x - 4, y: p0.y - 4, w: p2.x + p2.w - p0.x + 8, h: p0.h + 8 };
            ctx.beginPath(); ctx.rect(sel.x, sel.y, sel.w, sel.h); stroke(ctx, CY, 0.95, 1.2);
            [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]].forEach(([hx, hy]) => {
              ctx.fillStyle = '#fff'; ctx.fillRect(sel.x + sel.w * hx - 3, sel.y + sel.h * hy - 3, 6, 6);
              ctx.strokeStyle = `rgba(${CY},1)`; ctx.lineWidth = 1; ctx.strokeRect(sel.x + sel.w * hx - 3, sel.y + sel.h * hy - 3, 6, 6);
            });
          }

          // カーソル本体
          ctx.save();
          ctx.translate(cx, cy); ctx.scale(1.25, 1.25);
          ctx.beginPath();
          [[0, 0], [0, 17], [4.5, 13], [7.5, 20], [10, 19], [7, 12.5], [12.5, 12.5]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.closePath();
          ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
          ctx.strokeStyle = '#03040a'; ctx.lineWidth = 1; ctx.stroke();
          ctx.restore();
          if (cur.down) { ctx.beginPath(); ctx.arc(cx, cy, 12, 0, TAU); stroke(ctx, CY, 0.8, 1.5); }
        }

        // 見る人のカーソルが要素に乗ったら、寸法を表示する
        if (hover >= 0 && build >= 1) {
          const p = toPx(ELEMENTS[hover]);
          ctx.globalAlpha = alpha;
          ctx.beginPath(); ctx.rect(p.x - 2, p.y - 2, p.w + 4, p.h + 4); stroke(ctx, PK, 1, 1.5);
          label(ctx, `${Math.round(ELEMENTS[hover].w * 1440)} × ${Math.round(ELEMENTS[hover].h * 900)}`, p.x + p.w / 2, p.y - 12, PK, 1);
        }
        ctx.restore();
      },
      targets (n) {
        const rects = [board, ...ELEMENTS.map(r => ({ x: board.x + r.x * board.w, y: board.y + r.y * board.h, w: r.w * board.w, h: r.h * board.h }))]
          .map(r => ({ u: r.x, v: r.y, w: r.w, h: r.h }));
        return perimeter(rects, n).map(([u, v]) => [u + off.x, v + off.y]);
      },
      click () {},
    };
  }

  /* =========================================================
     F. LAYER SPACE：画面いっぱいに、何層にも重なった画面の中を進む
     C を CITY と同じ大きさにしたもの。一定の奥行きごとに「層」の枠があり、
     その間に幅の違う画面（PC・タブレット・スマホ・コード・グラフ…）が浮かぶ
     ========================================================= */
  function layerSpace () {
    const rand = (a, b) => a + Math.random() * (b - a);
    const FAR = 72, LAYER = 12;
    const cam = { x: 0, y: 0, z: 0 };
    let W = 0, H = 0, narrow = false, boost = 0, hover = null, lastBuild = 0;
    const KINDS = ['desktop', 'desktop', 'tablet', 'phone', 'phone', 'code', 'chart', 'image', 'form'];
    const SIZES = {
      desktop: [4.2, 2.6, '1440px'], tablet: [2.2, 2.8, '768px'], phone: [1.1, 2.2, '375px'],
      code: [3.0, 1.9, '</>'], chart: [2.6, 1.7, 'DATA'], image: [2.4, 1.6, 'IMAGE'], form: [2.0, 2.2, 'FORM'],
    };
    let uid = 0;
    const spawn = z => {
      const kind = KINDS[(Math.random() * KINDS.length) | 0];
      const [w, h, label] = SIZES[kind];
      const s = 0.8 + Math.random() * 0.5;
      return { id: uid++, kind, label, x: rand(-15, 15), y: rand(-7.5, 7.5), z, w: w * s, h: h * s, seed: Math.random() * 100, hue: [CY, PK, IN][(Math.random() * 3) | 0] };
    };
    const wins = Array.from({ length: 56 }, () => spawn(rand(3, FAR)));

    const centerX = () => W * (narrow ? 0.5 : 0.6);
    const proj = (x, y, z) => {
      const dz = z - cam.z;
      if (dz < 0.6) return null;
      const f = (Math.min(W, H) * 1.05) / dz;
      return [centerX() + (x - cam.x) * f, H / 2 + (y - cam.y) * f, f, dz];
    };
    const rectOf = win => {
      const c = proj(win.x, win.y, win.z);
      if (!c) return null;
      const w = win.w * c[2], h = win.h * c[2];
      return { x: c[0] - w / 2, y: c[1] - h / 2, w, h, dz: c[3] };
    };
    // 遠いほど薄く、目の前まで来たら消える（大きな画面で文字が隠れないように）
    const fogOf = dz => clamp(1 - dz / FAR) * clamp((dz - 1.2) / 3);

    function content (ctx, w, r, t) {
      const lw = Math.max(1, r.w * 0.012), p = r.w * 0.06, top = r.y + r.h * 0.14, iw = r.w - p * 2;
      const line = (x1, y1, x2, y2, col, a, width) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); stroke(ctx, col, a, width); };
      // タイトルバー
      line(r.x, r.y + r.h * 0.1, r.x + r.w, r.y + r.h * 0.1, IN, 0.4, 1);
      [PK, IN, CY].forEach((col, k) => { ctx.fillStyle = `rgba(${col},.9)`; ctx.fillRect(r.x + p * 0.6 + k * p * 0.5, r.y + r.h * 0.05 - 1.5, 3, 3); });

      if (w.kind === 'desktop' || w.kind === 'tablet') {
        const cols = w.kind === 'desktop' ? 3 : 2;
        roundRect(ctx, r.x + p, top, iw, r.h * 0.3, 3); fill(ctx, PK, 0.12);
        line(r.x + p * 1.6, top + r.h * 0.1, r.x + p * 1.6 + iw * 0.5, top + r.h * 0.1, WH, 0.85, lw * 1.6);
        line(r.x + p * 1.6, top + r.h * 0.19, r.x + p * 1.6 + iw * 0.34, top + r.h * 0.19, IN, 0.6, lw);
        const gap = iw * 0.03, cw = (iw - gap * (cols - 1)) / cols, ch = r.h * 0.2;
        for (let row = 0; row < 2; row++) for (let q = 0; q < cols; q++) {
          const cy = top + r.h * 0.34 + row * (ch + gap);
          if (cy + ch > r.y + r.h - p * 0.5) continue;
          roundRect(ctx, r.x + p + q * (cw + gap), cy, cw, ch, 3); fill(ctx, CY, 0.08); stroke(ctx, CY, 0.55, 1);
        }
      } else if (w.kind === 'phone') {
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(r.x + p + (k + 0.5) * (iw / 4), top + r.h * 0.05, r.w * 0.07, 0, TAU); stroke(ctx, k % 2 ? PK : CY, 0.8, 1); }
        for (let k = 0; k < 2; k++) {
          const cy = top + r.h * (0.13 + k * 0.33);
          roundRect(ctx, r.x + p, cy, iw, r.h * 0.28, 3); fill(ctx, [CY, PK][k], 0.12); stroke(ctx, CY, 0.5, 1);
          line(r.x + p * 1.8, cy + r.h * 0.22, r.x + p + iw * 0.6, cy + r.h * 0.22, WH, 0.7, lw);
        }
      } else if (w.kind === 'code') {
        const n = 7, sc = ((t * 0.00025) + w.seed) % 1;
        for (let k = 0; k < n; k++) {
          const yy = top + ((k / n + 1 - sc) % 1) * (r.h * 0.8);
          const len = 0.25 + (((k + Math.floor(w.seed)) * 37) % 10) / 16;
          line(r.x + p + (k % 3) * p * 0.8, yy, r.x + p + Math.min(iw, len * iw), yy, [CY, PK, IN, WH][k % 4], 0.7, lw);
        }
      } else if (w.kind === 'chart') {
        const bars = 7, bw = iw / (bars * 1.6);
        for (let k = 0; k < bars; k++) {
          const hk = r.h * (0.18 + 0.42 * (0.5 + 0.5 * Math.sin(t * 0.0012 + k * 0.9 + w.seed)));
          ctx.fillStyle = `rgba(${k % 3 === 0 ? PK : CY},.55)`;
          ctx.fillRect(r.x + p + k * bw * 1.6, r.y + r.h - p * 0.6 - hk, bw, hk);
        }
        ctx.beginPath();
        for (let k = 0; k <= 10; k++) {
          const xx = r.x + p + (iw * k) / 10, yy = top + r.h * (0.25 + 0.18 * Math.sin(k * 0.8 + t * 0.001 + w.seed));
          if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
        }
        stroke(ctx, WH, 0.75, lw);
      } else if (w.kind === 'image') {
        const g = ctx.createLinearGradient(r.x, top, r.x + r.w, r.y + r.h);
        g.addColorStop(0, `rgba(${PK},.28)`); g.addColorStop(1, `rgba(${CY},.14)`);
        roundRect(ctx, r.x + p, top, iw, r.h * 0.76, 3); ctx.fillStyle = g; ctx.fill();
        line(r.x + p, top, r.x + p + iw, top + r.h * 0.76, WH, 0.25, 1);
        line(r.x + p + iw, top, r.x + p, top + r.h * 0.76, WH, 0.25, 1);
        const sx = r.x + p + ((((t * 0.0004) + w.seed) % 1.4) / 1.4) * iw;
        line(sx, top, sx, top + r.h * 0.76, WH, 0.45, lw * 1.4);
      } else if (w.kind === 'form') {
        for (let k = 0; k < 3; k++) { roundRect(ctx, r.x + p, top + r.h * (0.06 + k * 0.2), iw, r.h * 0.12, 3); stroke(ctx, IN, 0.6, 1); }
        roundRect(ctx, r.x + p, top + r.h * 0.66, iw * 0.55, r.h * 0.12, r.h * 0.06); fill(ctx, CY, 0.85);
      }
    }

    return {
      resize (w, h, n) { W = w; H = h; narrow = n; },
      update (dt, t, mouse) {
        const nx = mouse.active ? mouse.x / W - 0.5 : Math.sin(t * 0.0003) * 0.2;
        const ny = mouse.active ? mouse.y / H - 0.5 : Math.cos(t * 0.00025) * 0.15;
        cam.x += (nx * 5 - cam.x) * Math.min(1, 0.04 * dt);
        cam.y += (ny * 3 - cam.y) * Math.min(1, 0.04 * dt);
        cam.z += (0.05 + boost) * clamp((lastBuild - 0.5) / 0.5) * dt;
        boost *= Math.pow(0.95, dt);
        for (const w of wins) if (w.z - cam.z < 1.2) Object.assign(w, spawn(cam.z + FAR + rand(0, 8)));
        // カーソルの下の、いちばん手前の画面
        hover = null;
        if (mouse.active) {
          let best = Infinity;
          for (const w of wins) {
            const r = rectOf(w);
            if (!r || fogOf(r.dz) < 0.15) continue;
            if (mouse.x > r.x && mouse.x < r.x + r.w && mouse.y > r.y && mouse.y < r.y + r.h && r.dz < best) { best = r.dz; hover = w.id; }
          }
        }
      },
      draw (ctx, t, alpha, build) {
        lastBuild = build;
        ctx.save();
        ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';

        // 層の枠：一定の奥行きごとに大きな枠が立ち、近づいて通り過ぎる
        for (let z = Math.ceil((cam.z + 1) / LAYER) * LAYER; z < cam.z + FAR; z += LAYER) {
          const a0 = proj(-17, -9.5, z), a1 = proj(17, 9.5, z);
          if (!a0 || !a1) continue;
          const fog = fogOf(z - cam.z) * clamp(build * 1.3);
          if (fog < 0.01) continue;
          const x0 = a0[0], y0 = a0[1], x1 = a1[0], y1 = a1[1];
          ctx.strokeStyle = `rgba(${IN},${0.2 * fog})`; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
          const tick = Math.min(22, (x1 - x0) * 0.04);
          ctx.beginPath();
          [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(([x, y, sx, sy]) => {
            ctx.moveTo(x + sx * tick, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * tick);
          });
          stroke(ctx, CY, 0.7 * fog, 1.5);
          ctx.font = '10px "Space Mono", monospace'; ctx.textBaseline = 'top';
          ctx.fillStyle = `rgba(${CY},${0.55 * fog})`;
          ctx.fillText(`LAYER ${String(Math.round(z / LAYER) % 100).padStart(2, '0')}`, x0 + 6, y0 + 6);
        }

        const list = wins.map(w => ({ w, r: rectOf(w) }))
          .filter(o => o.r && o.r.dz < FAR)
          .sort((a, b) => b.r.dz - a.r.dz);

        // 層をまたいで画面どうしをつなぐ点線
        ctx.save();
        ctx.setLineDash([3, 6]); ctx.lineDashOffset = -t * 0.03;
        ctx.beginPath();
        let prev = null;
        list.forEach(o => {
          if (o.w.id % 4 !== 0) return;
          if (prev && Math.abs(prev.r.dz - o.r.dz) > 4) {
            ctx.moveTo(prev.r.x + prev.r.w / 2, prev.r.y + prev.r.h / 2);
            ctx.lineTo(o.r.x + o.r.w / 2, o.r.y + o.r.h / 2);
          }
          prev = o;
        });
        stroke(ctx, IN, 0.22 * clamp((build - 0.5) / 0.5), 1);
        ctx.restore();

        list.forEach(({ w, r }) => {
          const appear = easeOut(clamp(build * 1.6 - (r.dz / FAR) * 0.6));   // 手前の画面から先に出る
          const a = fogOf(r.dz) * appear;
          if (a < 0.02) return;
          const hot = hover === w.id;
          ctx.save();
          ctx.globalAlpha = alpha * a;
          roundRect(ctx, r.x, r.y, r.w, r.h, Math.max(3, Math.min(10, r.w * 0.03)));
          ctx.fillStyle = 'rgba(6,10,28,.84)'; ctx.fill();
          if (hot) { ctx.shadowColor = `rgba(${CY},.95)`; ctx.shadowBlur = 24; }
          stroke(ctx, hot ? WH : w.hue, 0.9, hot ? 2 : 1.2);
          ctx.shadowBlur = 0;
          if (r.w > 60) content(ctx, w, r, t);
          if (r.w > 44) {
            ctx.font = `${Math.round(clamp(r.w * 0.05, 9, 13))}px "Space Mono", monospace`; ctx.textBaseline = 'bottom';
            ctx.fillStyle = `rgba(${hot ? WH : CY},.85)`; ctx.fillText(w.label, r.x, r.y - 4);
          }
          ctx.restore();
        });
        ctx.restore();
      },
      // 点が集まる先：画面内に見えている、手前の画面の枠
      targets (n) {
        const rects = wins.map(w => rectOf(w))
          .filter(r => r && r.dz > 3 && r.dz < FAR * 0.6 && r.x + r.w > 0 && r.x < W && r.y + r.h > 0 && r.y < H)
          .sort((a, b) => a.dz - b.dz)
          .slice(0, 18)
          .map(r => ({ u: r.x, v: r.y, w: r.w, h: r.h }));
        return rects.length ? perimeter(rects, n).map(([u, v]) => [u, v]) : [];
      },
      click () { boost = 0.5; },
    };
  }

  global.WebVariants = {
    a: { id: 'a', name: 'UNFOLD LAYOUT', ja: 'レイアウトが広がる', make: unfold },
    b: { id: 'b', name: 'PHONE FEED', ja: 'スマホの画面', make: phoneFeed },
    c: { id: 'c', name: 'MULTI SCREEN', ja: '幅の違う画面', make: multiScreen },
    d: { id: 'd', name: 'CODE → PAGE', ja: 'コードからページ', make: codeToPage },
    e: { id: 'e', name: 'CURSOR BUILD', ja: 'カーソルで組む', make: cursorBuild },
    f: { id: 'f', name: 'LAYER SPACE', ja: '何層にも重なる画面', make: layerSpace },
  };
})(window);
