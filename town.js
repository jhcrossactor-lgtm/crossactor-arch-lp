/* =========================================================
   CROSSACTOR 黄色トップ：自動区割り → 街ができていくPV
   敷地 → 区割り → 建物 → 街並み を 18 秒で繰り返す。Canvas 2D、ライブラリ無し。
   canvas の data-zoom / data-cx / data-cy で画面内の大きさと位置を変えられる。
   ========================================================= */
(function () {
  const canvas = document.getElementById('town-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LOOP = 18;
  const PHASES = [0, 2.5, 6, 11];           // 敷地・区割り・建物・街並み の開始秒
  const INK = '#141414';
  const AI = '#4B2BD6';            // AIが働いているところだけに使う色

  const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const back = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const seg = (t, a, b) => clamp((t - a) / (b - a));

  /* ---------- 街のデータ（単位はメートル。x=右、y=上、z=奥） ---------- */
  const SITE = [[0, 0], [64, 0], [64, 34], [56, 42], [0, 42]];
  const ROAD_PUB = [[-16, -9], [80, -9], [80, 0], [-16, 0]];
  const ROAD_IN = [[29, 0], [35, 0], [35, 42], [29, 42]];
  const COLS = [[0, 15], [15, 29], [35, 50.5], [50.5, 64]];
  const ROWS = [[0, 13.5], [13.5, 28], [28, 42]];

  const area = poly => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

  const lots = [];
  ROWS.forEach(([z0, z1]) => COLS.forEach(([x0, x1]) => {
    let poly = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    if (x1 === 64 && z1 === 42) poly = [[x0, z0], [x1, z0], [64, 34], [56, 42], [x0, z1]];
    lots.push({ x0, x1, z0, z1, poly, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, area: area(poly) });
  }));
  // 入口（道路の中央）に近い順に番号を振り、その順で建てる
  lots.sort((a, b) => Math.hypot(a.cx - 32, a.cz) - Math.hypot(b.cx - 32, b.cz));
  lots.forEach((l, i) => { l.no = i + 1; });

  const EDGES = [];
  lots.forEach((a, i) => lots.forEach((b, j) => {
    if (j <= i) return;
    const sameRow = a.z0 === b.z0 && Math.abs(a.cx - b.cx) < 21;
    const sameCol = a.x0 === b.x0 && Math.abs(a.cz - b.cz) < 15;
    if (sameRow || sameCol) EDGES.push([i, j]);
  }));

  const ROOFS = ['gx', 'gz', 'shed', 'gz', 'gx', 'shed', 'gx', 'gz', 'gx', 'shed', 'gz', 'gx'];
  const houses = lots.map((l, i) => {
    const left = l.x1 <= 29;
    const w = 8.5, d = 8;
    const x0 = left ? l.x1 - 2 - w : l.x0 + 2;
    let zc = l.cz;
    if (l.x1 === 64 && l.z1 === 42) zc -= 2.5;
    return { x0, x1: x0 + w, z0: zc - d / 2, z1: zc + d / 2, H: i % 4 === 3 ? 3.2 : 5.6, R: 2.4, roof: ROOFS[i], lot: l, door: left ? 'x1' : 'x0' };
  });
  const ACCENT = 4;   // 「CUT 01」を出す家

  const TREES = [];
  for (let z = 4; z <= 40; z += 7) { TREES.push([28, z], [36, z]); }
  for (let x = -10; x <= 74; x += 9) if (x < 26 || x > 38) TREES.push([x, -10.4]);

  /* ---------- カメラ ---------- */
  let W = 0, H = 0, dpr = 1, cam = null;
  function camera (t) {
    const yaw = lerp(-0.62, -0.16, ease(seg(t, 0, 16)));
    const pitch = lerp(1.22, 0.46, ease(seg(t, 4.5, 14)));
    const dist = lerp(118, 72, ease(seg(t, 5, 15.5)));
    const tx = lerp(32, 27, ease(seg(t, 8, 16)));
    const tz = lerp(21, 17, ease(seg(t, 8, 16)));
    const target = [tx, lerp(0, 2, ease(seg(t, 8, 16))), tz];
    const pos = [target[0] + dist * Math.cos(pitch) * Math.sin(yaw), target[1] + dist * Math.sin(pitch), target[2] - dist * Math.cos(pitch) * Math.cos(yaw)];
    const f = norm(sub(target, pos));
    const r = norm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    const zoom = parseFloat(canvas.dataset.zoom || '0.72');
    return { pos, f, r, u, focal: W * zoom, cx: W * parseFloat(canvas.dataset.cx || '0.62'), cy: H * parseFloat(canvas.dataset.cy || '0.58') };
  }
  function sub (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm (a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function P (p) {
    const d = sub(p, cam.pos);
    const z = Math.max(dot(d, cam.f), 0.1);
    return [cam.cx + dot(d, cam.r) * cam.focal / z, cam.cy - dot(d, cam.u) * cam.focal / z, z];
  }

  /* ---------- 描画の部品 ---------- */
  function path (pts3, close) {
    ctx.beginPath();
    pts3.forEach((p, i) => { const s = P(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
    if (close) ctx.closePath();
  }
  const ground = poly => poly.map(([x, z]) => [x, 0, z]);
  function partialLine (pts3, k, closed) {        // 線を k（0〜1）まで描く
    const pts = closed ? [...pts3, pts3[0]] : pts3;
    const sp = pts.map(P);
    let total = 0; const lens = [];
    for (let i = 1; i < sp.length; i++) { const l = Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]); lens.push(l); total += l; }
    let left = total * k;
    ctx.beginPath(); ctx.moveTo(sp[0][0], sp[0][1]);
    for (let i = 1; i < sp.length && left > 0; i++) {
      const l = lens[i - 1], q = Math.min(1, left / l);
      ctx.lineTo(lerp(sp[i - 1][0], sp[i][0], q), lerp(sp[i - 1][1], sp[i][1], q));
      left -= l;
    }
    ctx.stroke();
  }
  function label (text, p3, size, alpha, boxed, bg = INK, fg = '#FFD93B') {
    if (alpha <= 0) return;
    const s = P(p3);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = `700 ${size}px "Space Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (boxed) {
      const w = ctx.measureText(text).width + size * 1.1, h = size * 1.9;
      ctx.fillStyle = bg; ctx.fillRect(s[0] - w / 2, s[1] - h / 2, w, h);
      ctx.fillStyle = fg;
    } else ctx.fillStyle = INK;
    ctx.fillText(text, s[0], s[1]);
    ctx.restore();
  }
  function brackets (pts3, len, pad) {        // 四隅のかぎ括弧（AIが対象をつかまえた印）
    const sp = pts3.map(P);
    const xs = sp.map(p => p[0]), ys = sp.map(p => p[1]);
    corners(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad, len);
  }
  function screenBrackets (pts3, len, pad) { brackets(pts3, len, pad); }
  function corners (x0, y0, x1, y1, len) {
    ctx.strokeStyle = AI;
    [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath(); ctx.moveTo(x + sx * len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * len); ctx.stroke();
    });
  }
  const LIGHT = norm([-0.45, 0.85, -0.35]);
  function shade (base, n, dark) {
    const k = clamp(0.5 + 0.5 * dot(n, LIGHT));
    const c = base.map((v, i) => Math.round(lerp(dark[i], v, k)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  /* ---------- 家の面（立ち上がり k=0〜1.1） ---------- */
  function houseFaces (h, k, out, isAccent) {
    if (k <= 0) return;
    const { x0, x1, z0, z1 } = h;
    const Hh = h.H * k, R = h.R * k, xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
    const center = [xm, Hh / 2, zm];
    const WALL = [[255, 255, 255], [196, 196, 196]];
    const ROOF = isAccent ? [[255, 255, 255], [214, 214, 214]] : [[74, 74, 74], [20, 20, 20]];
    const faces = [];
    const wall = pts => faces.push({ pts, col: WALL, win: true });
    const roof = pts => faces.push({ pts, col: ROOF });
    const e = 0.6;
    if (h.roof === 'gx') {
      wall([[x0, 0, z0], [x1, 0, z0], [x1, Hh, z0], [x0, Hh, z0]]);
      wall([[x0, 0, z1], [x1, 0, z1], [x1, Hh, z1], [x0, Hh, z1]]);
      wall([[x0, 0, z0], [x0, 0, z1], [x0, Hh, z1], [x0, Hh + R, zm], [x0, Hh, z0]]);
      wall([[x1, 0, z0], [x1, 0, z1], [x1, Hh, z1], [x1, Hh + R, zm], [x1, Hh, z0]]);
      roof([[x0 - e, Hh - 0.3 * k, z0 - e], [x1 + e, Hh - 0.3 * k, z0 - e], [x1 + e, Hh + R, zm], [x0 - e, Hh + R, zm]]);
      roof([[x0 - e, Hh - 0.3 * k, z1 + e], [x1 + e, Hh - 0.3 * k, z1 + e], [x1 + e, Hh + R, zm], [x0 - e, Hh + R, zm]]);
    } else if (h.roof === 'gz') {
      wall([[x0, 0, z0], [x0, 0, z1], [x0, Hh, z1], [x0, Hh, z0]]);
      wall([[x1, 0, z0], [x1, 0, z1], [x1, Hh, z1], [x1, Hh, z0]]);
      wall([[x0, 0, z0], [x1, 0, z0], [x1, Hh, z0], [xm, Hh + R, z0], [x0, Hh, z0]]);
      wall([[x0, 0, z1], [x1, 0, z1], [x1, Hh, z1], [xm, Hh + R, z1], [x0, Hh, z1]]);
      roof([[x0 - e, Hh - 0.3 * k, z0 - e], [x0 - e, Hh - 0.3 * k, z1 + e], [xm, Hh + R, z1 + e], [xm, Hh + R, z0 - e]]);
      roof([[x1 + e, Hh - 0.3 * k, z0 - e], [x1 + e, Hh - 0.3 * k, z1 + e], [xm, Hh + R, z1 + e], [xm, Hh + R, z0 - e]]);
    } else {
      const Hb = Hh + R * 0.8;
      wall([[x0, 0, z0], [x1, 0, z0], [x1, Hh, z0], [x0, Hh, z0]]);
      wall([[x0, 0, z1], [x1, 0, z1], [x1, Hb, z1], [x0, Hb, z1]]);
      wall([[x0, 0, z0], [x0, 0, z1], [x0, Hb, z1], [x0, Hh, z0]]);
      wall([[x1, 0, z0], [x1, 0, z1], [x1, Hb, z1], [x1, Hh, z0]]);
      roof([[x0 - e, Hh, z0 - e], [x1 + e, Hh, z0 - e], [x1 + e, Hb, z1 + e], [x0 - e, Hb, z1 + e]]);
    }
    faces.forEach(fc => {
      const c = fc.pts.reduce((a, p) => [a[0] + p[0] / fc.pts.length, a[1] + p[1] / fc.pts.length, a[2] + p[2] / fc.pts.length], [0, 0, 0]);
      let n = norm(cross(sub(fc.pts[1], fc.pts[0]), sub(fc.pts[2], fc.pts[0])));
      if (dot(n, sub(c, center)) < 0) n = [-n[0], -n[1], -n[2]];
      if (dot(n, sub(cam.pos, c)) <= 0) return;               // 裏側は描かない
      const depth = fc.pts.reduce((s, p) => s + P(p)[2], 0) / fc.pts.length;
      out.push({ depth, draw () {
        path(fc.pts, true);
        ctx.fillStyle = shade(fc.col[0], n, fc.col[1]); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
        if (fc.win && k > 0.9) windows(fc, n);
      } });
    });
  }
  function windows (fc, n) {                 // 壁の下端の辺に沿って窓を並べる
    const [a, b] = [fc.pts[0], fc.pts[1]];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const dir = [(b[0] - a[0]) / len, 0, (b[2] - a[2]) / len];
    const off = [n[0] * 0.05, 0, n[2] * 0.05];
    const top = Math.min(...fc.pts.map(p => p[1]).filter(y => y > 0.1));
    const floors = top > 4 ? [0.9, 3.6] : [0.9];
    const count = len > 7 ? 2 : 1;
    ctx.fillStyle = INK;
    floors.forEach(y => {
      for (let i = 0; i < count; i++) {
        const s = count === 1 ? len / 2 - 0.8 : (i === 0 ? len * 0.2 : len * 0.62);
        const q = [[s, y], [s + 1.6, y], [s + 1.6, y + 1.3], [s, y + 1.3]]
          .map(([u, v]) => [a[0] + dir[0] * u + off[0], v, a[2] + dir[2] * u + off[2]]);
        path(q, true); ctx.fill();
      }
    });
  }
  function treeItem (x, z, k, out) {
    if (k <= 0) return;
    const base = [x, 0, z], top = [x, 1.4 * k, z], crown = [x, 2.6 * k, z];
    out.push({ depth: P(crown)[2], draw () {
      const a = P(base), b = P(top), c = P(crown);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      const r = Math.max(2, 1.5 * k * cam.focal / c[2]);
      ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.stroke();
    } });
  }
  function carItem (t, out) {                // 前の道路から敷地の中の道路へ入ってくる車
    const k = seg(t, 11.4, 15.6);
    if (k <= 0 || k >= 1) return;
    const L1 = 48, L2 = 40, s = ease(k) * (L1 + L2);
    let x, z, ang;
    if (s < L1) { x = -16 + s; z = -4.5; ang = 0; } else { x = 32; z = -4.5 + (s - L1); ang = Math.PI / 2; }
    const hl = 2.1, hw = 0.95, ht = 1.4;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const corner = (u, v, y) => [x + u * ca - v * sa, y, z + u * sa + v * ca];
    const B = [corner(-hl, -hw, 0), corner(hl, -hw, 0), corner(hl, hw, 0), corner(-hl, hw, 0)];
    const T = B.map(p => [p[0], ht, p[2]]);
    const faces = [[B[0], B[1], T[1], T[0]], [B[1], B[2], T[2], T[1]], [B[2], B[3], T[3], T[2]], [B[3], B[0], T[0], T[3]], T];
    const center = [x, ht / 2, z];
    faces.forEach((pts, i) => {
      const c = pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
      let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
      if (dot(n, sub(c, center)) < 0) n = [-n[0], -n[1], -n[2]];
      if (dot(n, sub(cam.pos, c)) <= 0) return;
      out.push({ depth: P(c)[2], draw () {
        path(pts, true); ctx.fillStyle = i === 4 ? '#FFFFFF' : INK; ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
      } });
    });
  }

  /* ---------- 1コマ描く ---------- */
  function draw (t) {
    cam = camera(t);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 1 - seg(t, 16.9, 17.9);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // 物件資料の紙（最初に置かれ、区割りが始まるころに消える）
    const paperIn = seg(t, 0, 0.7), paperOut = seg(t, 3.0, 4.2);
    const paperA = easeOut(paperIn) * (1 - paperOut);
    if (paperA > 0) {
      ctx.save(); ctx.globalAlpha *= paperA;
      const PAPER = [[-14, -12], [78, -12], [78, 58], [-14, 58]];
      path(ground(PAPER), true);
      ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      path(ground([[-14, 52], [78, 52], [78, 58], [-14, 58]]), true); ctx.fillStyle = INK; ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,20,.45)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) { path([[67, 0, 44 - i * 5], [76, 0, 44 - i * 5]]); ctx.stroke(); }
      for (let i = 0; i < 4; i++) { path([[-12, 0, 44 - i * 5], [-4, 0, 44 - i * 5]]); ctx.stroke(); }
      ctx.restore();
      label('物件資料　分譲地 12区画', [32, 0, 55], 14, paperA, true);
      label('区画図', [-8, 0, 48.5], 11, paperA * 0.8, false);
      label('価格表', [71.5, 0, 48.5], 11, paperA * 0.8, false);
    }
    // 前の道路
    const pub = seg(t, 0.2, 1.4);
    if (pub > 0) {
      ctx.save(); ctx.globalAlpha *= pub;
      path(ground(ROAD_PUB), true); ctx.fillStyle = INK; ctx.fill();
      ctx.setLineDash([10, 10]); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
      path([[-16, 0, -4.5], [80, 0, -4.5]]); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
    // 敷地の外形と寸法
    const site = seg(t, 0.3, 2.3);
    if (site > 0) {
      path(ground(SITE), true);
      ctx.fillStyle = `rgba(255,255,255,${0.35 * site})`; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
      partialLine(ground(SITE), easeOut(site), true);
    }
    const dimA = seg(t, 1.6, 2.4) * (1 - seg(t, 11.5, 12.5));
    if (dimA > 0) {
      ctx.save(); ctx.globalAlpha *= dimA; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      path([[0, 0, 47], [64, 0, 47]]); ctx.stroke();
      path([[0, 0, 44], [0, 0, 49]]); ctx.stroke(); path([[64, 0, 44], [64, 0, 49]]); ctx.stroke();
      path([[-5, 0, 0], [-5, 0, 42]]); ctx.stroke();
      path([[-7, 0, 0], [-3, 0, 0]]); ctx.stroke(); path([[-7, 0, 42], [-3, 0, 42]]); ctx.stroke();
      ctx.restore();
      label('64.00m', [32, 0, 50], 12, dimA, false);
      label('42.00m', [-9, 0, 21], 12, dimA, false);
    }
    // 区割り：敷地の中の道路 → 区画線が順に走る
    const roadIn = seg(t, 2.6, 3.4);
    if (roadIn > 0) {
      ctx.save(); ctx.globalAlpha *= roadIn;
      path(ground(ROAD_IN), true); ctx.fillStyle = INK; ctx.fill();
      ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
      path([[32, 0, 0], [32, 0, 42]]); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
    lots.forEach((l, i) => {
      const k = seg(t, 3.2 + i * 0.18, 3.9 + i * 0.18);
      if (k <= 0) return;
      const flash = seg(t, 3.6 + i * 0.18, 4.0 + i * 0.18) * (1 - seg(t, 4.4 + i * 0.18, 5.2 + i * 0.18));
      path(ground(l.poly), true);
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.5 * flash})`; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
      partialLine(ground(l.poly), easeOut(k), true);
    });
    const tagA = 1 - seg(t, 11.8, 12.8);
    lots.forEach((l, i) => {
      const k = seg(t, 3.7 + i * 0.18, 4.2 + i * 0.18);
      if (k <= 0) return;
      const a = Math.min(back(k), 1.15) * tagA * (1 - seg(t, 6.2 + i * 0.4, 6.6 + i * 0.4) * 0.65);
      label(`No.${l.no}`, [l.cx, 0, l.cz + 2.6], 12, a, true);
      label(`${l.area.toFixed(1)}㎡`, [l.cx, 0, l.cz - 2.4], 11, a, false);
    });

    // AI：物件資料を読み取るスキャン
    const scanK = seg(t, 0.6, 2.7), scanA = seg(t, 0.5, 0.8) * (1 - seg(t, 2.7, 3.3));
    if (scanA > 0) {
      const z = lerp(58, -12, ease(scanK));
      ctx.save(); ctx.globalAlpha *= scanA;
      path(ground([[-14, z], [78, z], [78, Math.min(z + 7, 58)], [-14, Math.min(z + 7, 58)]]), true);
      ctx.fillStyle = 'rgba(75,43,214,.14)'; ctx.fill();
      ctx.strokeStyle = AI; ctx.lineWidth = 2.4; path([[-14, 0, z], [78, 0, z]]); ctx.stroke();
      brackets([[-14, 0, -12], [78, 0, -12], [78, 0, 58], [-14, 0, 58]], 26, 6);
      ctx.restore();
      label(`AI 読み取り中  ${Math.round(scanK * 100)}%`, [4, 0, -17], 12, scanA, true, AI, '#FFFFFF');
    }
    // AI：区割りを計算しているネットワーク
    const netA = seg(t, 3.4, 4.2) * (1 - seg(t, 7.4, 8.4));
    if (netA > 0) {
      ctx.save(); ctx.globalAlpha *= netA;
      ctx.strokeStyle = AI; ctx.lineWidth = 1.4; ctx.setLineDash([4, 5]);
      EDGES.forEach(([a, b]) => { path([[lots[a].cx, 0.05, lots[a].cz], [lots[b].cx, 0.05, lots[b].cz]]); ctx.stroke(); });
      ctx.setLineDash([]);
      EDGES.forEach(([a, b], i) => {
        const q = (t * 0.7 + i * 0.137) % 1;
        const s = P([lerp(lots[a].cx, lots[b].cx, q), 0.05, lerp(lots[a].cz, lots[b].cz, q)]);
        ctx.beginPath(); ctx.arc(s[0], s[1], 2.6, 0, Math.PI * 2); ctx.fillStyle = AI; ctx.fill();
      });
      lots.forEach(l => {
        const s = P([l.cx, 0.05, l.cz]);
        ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, Math.PI * 2);
        ctx.fillStyle = AI; ctx.fill(); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.stroke();
      });
      ctx.restore();
    }

    // 建物・木・車（奥から順に描く）
    const items = [];
    houses.forEach((h, i) => {
      const k = seg(t, 6.2 + i * 0.4, 7.2 + i * 0.4);
      houseFaces(h, k > 0 ? Math.max(back(k), 0.02) : 0, items, i === ACCENT);
    });
    TREES.forEach(([x, z], i) => treeItem(x, z, seg(t, 10.6 + i * 0.06, 11.2 + i * 0.06) > 0 ? back(seg(t, 10.6 + i * 0.06, 11.2 + i * 0.06)) : 0, items));
    carItem(t, items);
    items.sort((a, b) => b.depth - a.depth).forEach(it => it.draw());

    // AI：建てた家に「生成」のタグ
    houses.forEach((h, i) => {
      const s0 = 6.2 + i * 0.4;
      const a = seg(t, s0 + 0.25, s0 + 0.5) * (1 - seg(t, s0 + 1.5, s0 + 1.9));
      if (a > 0) label(`GEN ${String(i + 1).padStart(2, '0')}`, [(h.x0 + h.x1) / 2, h.H + h.R + 2.2, (h.z0 + h.z1) / 2], 11, a, true, AI, '#FFFFFF');
    });

    // CUT 01：カメラが寄る家に印
    const cutA = seg(t, 12.6, 13.2);
    if (cutA > 0) {
      const h = houses[ACCENT];
      const top = [(h.x0 + h.x1) / 2, h.H + h.R + 1.2, (h.z0 + h.z1) / 2];
      const tag = [top[0], top[1] + 4.2, top[2]];
      ctx.save(); ctx.globalAlpha *= cutA; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
      path([top, tag]); ctx.stroke(); ctx.restore();
      label('CUT 01  ここから撮る', tag, 13, Math.min(back(cutA), 1), true);
      const box = [];
      [h.x0, h.x1].forEach(x => [h.z0, h.z1].forEach(z => { box.push([x, 0, z], [x, h.H + h.R, z]); }));
      ctx.save(); ctx.globalAlpha *= cutA; ctx.strokeStyle = AI; ctx.lineWidth = 2.4; screenBrackets(box, 14, 18); ctx.restore();
    }
    ctx.restore();
  }

  /* ---------- 再生 ---------- */
  let start = performance.now(), paused = null, raf = 0, visible = true, lastPhase = -1;
  const listeners = [];
  const timeAt = now => (paused !== null ? paused : ((now - start) / 1000) % LOOP);
  function frame (now) {
    raf = 0;
    const t = timeAt(now);
    draw(t);
    let ph = 0; PHASES.forEach((s, i) => { if (t >= s) ph = i; });
    listeners.forEach(fn => fn(t, ph, ph !== lastPhase));
    lastPhase = ph;
    if (!reduce && paused === null && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  function resize () {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    kick();
  }
  if (reduce) paused = 15.5;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); }).observe(canvas);
  document.addEventListener('visibilitychange', kick);
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);
  resize();

  window.TownScene = {
    LOOP, PHASES,
    onFrame (fn) { listeners.push(fn); },
    seek (i) { start = performance.now() - PHASES[i] * 1000; if (paused !== null && !reduce) paused = null; kick(); },
    hold (sec) { paused = sec; kick(); },
    play () { if (!reduce) { start = performance.now() - (paused || 0) * 1000; paused = null; kick(); } },
    redraw: resize,
  };
})();
