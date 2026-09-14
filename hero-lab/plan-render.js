/* =========================================================
   PLAN → RENDER（HERO LAB 09）
   FLOW SCENE の3つ目の場面。上から見た方眼紙に平面図が1本ずつ描かれ、
   紙が倒れて床になり、壁と家具が立ち上がり、カメラが部屋に入って、
   最後に実写のパース（制作実例）がスキャンのように現れる。

   PlanRender.make({ image }) → FLOW SCENE の web に渡すオブジェクト
   ========================================================= */
(function (global) {
  const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const CY = '110,231,255', IN = '165,180,252', PK = '240,171,252', WH = '238,241,250', AM = '255,196,107';

  /* ---------- 3D の小道具 ---------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  /* ---------- 部屋（単位 m）。奥の壁 z=0、右の壁 x=6、天井高 2.6 ---------- */
  const RW = 6, RD = 4.8, RH = 2.6, WT = 0.12;
  const WALLS = [                       // 壁の中心線 [x1, z1, x2, z2]
    [0, 0, 0.7, 0], [3.3, 0, RW, 0],    // 奥の壁（0.7〜3.3 は掃き出し窓）
    [RW, 0, RW, RD],                    // 右の壁（テレビ側）
    [RW, RD, 0, RD],                    // 手前の壁
    [0, RD, 0, 3.2], [0, 2.3, 0, 0],    // 左の壁（2.3〜3.2 はドア）
  ];
  const WIN = [0.7, 3.3], WIN_H = 2.2;
  const DOOR = { hx: 0, hz: 2.3, len: 0.9 };
  const FURN = [
    { r: [0.4, 3.5, 2.9, 4.3], h: 0.42, c: CY },    // ソファ（L字の長い方）
    { r: [0.4, 2.6, 1.2, 3.5], h: 0.42, c: CY },    // ソファ（L字の短い方）
    { r: [2.7, 2.2, 3.9, 3.0], h: 0.38, c: PK },    // センターテーブル
    { r: [RW - 0.45, 0.8, RW - 0.05, 3.6], h: 0.5, c: IN },   // テレビボード
  ];
  const TV = { z0: 1.3, z1: 2.9, y0: 1.05, y1: 1.8 };
  const COVE = [1.4, 0.8, 5.0, 3.6];    // 天井の間接照明

  /* ---------- 平面図：描く順に並べた線 ---------- */
  function buildPlan () {
    const list = [];   // { pts:[[x,z],…], color, width }
    const add = (pts, color, width) => list.push({ pts, color, width });
    // 壁は二重線
    WALLS.forEach(([x1, z1, x2, z2]) => {
      const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * (WT / 2), nz = (dx / l) * (WT / 2);
      add([[x1 + nx, z1 + nz], [x2 + nx, z2 + nz]], WH, 2);
      add([[x1 - nx, z1 - nz], [x2 - nx, z2 - nz]], WH, 2);
    });
    // 掃き出し窓（三本線）
    [-0.04, 0, 0.04].forEach(o => add([[WIN[0], o], [WIN[1], o]], CY, 1.2));
    // ドアと開き勝手の弧
    add([[DOOR.hx, DOOR.hz], [DOOR.hx + DOOR.len, DOOR.hz]], IN, 1.2);
    const arc = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * (Math.PI / 2); arc.push([DOOR.hx + Math.cos(a) * DOOR.len, DOOR.hz + Math.sin(a) * DOOR.len]); }
    add(arc, IN, 1);
    // 家具
    FURN.forEach(f => { const [x0, z0, x1, z1] = f.r; add([[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]], f.c, 1.2); });
    add([[RW - 0.1, TV.z0], [RW - 0.1, TV.z1]], WH, 2);
    // 寸法線
    add([[0, -0.8], [RW, -0.8]], IN, 1); add([[0, -0.65], [0, -0.95]], IN, 1); add([[RW, -0.65], [RW, -0.95]], IN, 1);
    add([[-0.8, 0], [-0.8, RD]], IN, 1); add([[-0.65, 0], [-0.95, 0]], IN, 1); add([[-0.65, RD], [-0.95, RD]], IN, 1);
    // 長さを付けておく
    let total = 0;
    list.forEach(p => {
      p.len = 0;
      for (let i = 1; i < p.pts.length; i++) p.len += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]);
      p.start = total; total += p.len;
    });
    return { list, total };
  }

  // カメラの位置（上から見る → 斜め上から → 部屋の中の目線）
  const CAM = {
    top:    { pos: [3, 11.5, 2.4], target: [3, 0, 2.4], up: [0, 0, -1], focal: 1.2, cx: 0.62 },
    aerial: { pos: [9.2, 7.5, 9.6], target: [3, 0.6, 2.2], up: [0, 1, 0], focal: 1.25, cx: 0.62 },
    eye:    { pos: [0.9, 1.35, 4.5], target: [4.4, 1.15, 0.3], up: [0, 1, 0], focal: 0.72, cx: 0.5 },
  };

  function make (opts = {}) {
    const img = new Image();
    img.src = opts.image || '../assets/render-living.webp';
    const plan = buildPlan();
    const HOLD = 9600;   // ここまでで仕上がり、あとは実写を見せたまま AI へ戻る
    let W = 0, H = 0, narrow = false, startAt = null, cache = null;
    const look = { x: 0, y: 0 };
    let cam = CAM.top;

    // 時刻 ms での各工程の進み具合
    const stagesAt = ms => ({
      draw: clamp(ms / 3400),
      tilt: easeInOut(clamp((ms - 3400) / 1400)),
      rise: easeOut(clamp((ms - 4800) / 1600)),
      fly: easeInOut(clamp((ms - 6400) / 1500)),
      reveal: clamp((ms - 7900) / 1700),
      out: 0,
    });

    function cameraFor (s) {
      const a = CAM.top, b = CAM.aerial, c = CAM.eye;
      // 壁が立ち上がる間は、少しだけ回り込む
      const orbit = s.rise * (1 - s.fly) * 0.35;
      const bp = [b.target[0] + (b.pos[0] - b.target[0]) * Math.cos(orbit) - (b.pos[2] - b.target[2]) * Math.sin(orbit), b.pos[1],
                  b.target[2] + (b.pos[0] - b.target[0]) * Math.sin(orbit) + (b.pos[2] - b.target[2]) * Math.cos(orbit)];
      let pos = mix(mix(a.pos, bp, s.tilt), c.pos, s.fly);
      let target = mix(mix(a.target, b.target, s.tilt), c.target, s.fly);
      const up = norm(mix(mix(a.up, b.up, s.tilt), c.up, s.fly));
      const focal = lerp(lerp(a.focal, b.focal, s.tilt), c.focal, s.fly);
      const cx = lerp(a.cx, c.cx, s.fly);
      // 部屋の中では、マウスで少し見回せる
      target = [target[0] + look.x * 0.9 * s.fly, target[1] - look.y * 0.4 * s.fly, target[2]];
      return { pos, target, up, focal, cx };
    }

    function project (p) {
      const fwd = norm(sub(cam.target, cam.pos));
      const right = norm(cross(fwd, cam.up));
      const up = cross(right, fwd);
      const d = sub(p, cam.pos);
      const z = dot(d, fwd);
      if (z < 0.05) return null;
      const f = (Math.min(W, H) * cam.focal * (narrow ? 0.85 : 1)) / z;
      return [W * (narrow ? 0.5 : cam.cx) + dot(d, right) * f, H * (narrow ? 0.34 : 0.5) - dot(d, up) * f];
    }
    const line3 = (ctx, a, b) => {
      const p = project(a), q = project(b);
      if (!p || !q) return;
      ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    };
    const strokeRGBA = (ctx, color, a, w) => { ctx.strokeStyle = `rgba(${color},${a})`; ctx.lineWidth = w; ctx.stroke(); };

    function drawGrid (ctx, a) {
      if (a <= 0.01) return;
      ctx.beginPath();
      for (let x = -1.5; x <= 7.51; x += 0.5) line3(ctx, [x, 0, -1.5], [x, 0, 6.3]);
      for (let z = -1.5; z <= 6.31; z += 0.5) line3(ctx, [-1.5, 0, z], [7.5, 0, z]);
      strokeRGBA(ctx, CY, 0.08 * a, 1);
    }

    function drawPlan (ctx, progress, a, ghost) {
      const drawn = progress * plan.total;
      let tip = null;
      for (const p of plan.list) {
        if (!ghost && p.start >= drawn) break;
        ctx.beginPath();
        let left = ghost ? p.len : drawn - p.start;
        for (let i = 1; i < p.pts.length; i++) {
          const [x0, z0] = p.pts[i - 1], [x1, z1] = p.pts[i];
          const l = Math.hypot(x1 - x0, z1 - z0);
          if (left <= 0) break;
          const k = Math.min(1, left / l);
          const end = [lerp(x0, x1, k), 0, lerp(z0, z1, k)];
          line3(ctx, [x0, 0, z0], end);
          if (k < 1) tip = end;
          left -= l;
        }
        strokeRGBA(ctx, p.color, (ghost ? 0.35 : 0.95) * a, p.width);
      }
      // ペン先の光
      if (tip && !ghost) {
        const q = project(tip);
        if (q) { ctx.save(); ctx.fillStyle = '#fff'; ctx.shadowColor = `rgba(${CY},1)`; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      }
    }

    function drawLabels (ctx, a) {
      if (a <= 0.01) return;
      ctx.font = '12px "Space Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const put = (text, p, color) => { const q = project(p); if (q) { ctx.fillStyle = `rgba(${color},${a})`; ctx.fillText(text, q[0], q[1]); } };
      put('6,000', [RW / 2, 0, -1.1], IN);
      put('4,800', [-1.25, 0, RD / 2], IN);
      ctx.font = '14px "Space Mono", monospace';
      put('LDK  約17帖', [3.9, 0, 1.3], WH);
      ctx.textAlign = 'start';
    }

    function drawModel (ctx, rise, a) {
      if (rise <= 0.001 || a <= 0.01) return;
      const h = RH * rise;
      // 壁：床と天井の線、角の縦線、面をうっすら塗る
      WALLS.forEach(([x1, z1, x2, z2]) => {
        const p = [project([x1, 0, z1]), project([x2, 0, z2]), project([x2, h, z2]), project([x1, h, z1])];
        if (p.some(v => !v)) return;
        ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); p.slice(1).forEach(v => ctx.lineTo(v[0], v[1])); ctx.closePath();
        ctx.fillStyle = `rgba(${CY},${0.05 * a})`; ctx.fill();
        strokeRGBA(ctx, CY, 0.8 * a, 1.3);
      });
      // 掃き出し窓
      ctx.beginPath();
      const wh = WIN_H * rise;
      line3(ctx, [WIN[0], 0, 0], [WIN[0], wh, 0]); line3(ctx, [WIN[1], 0, 0], [WIN[1], wh, 0]);
      line3(ctx, [WIN[0], wh, 0], [WIN[1], wh, 0]); line3(ctx, [(WIN[0] + WIN[1]) / 2, 0, 0], [(WIN[0] + WIN[1]) / 2, wh, 0]);
      strokeRGBA(ctx, WH, 0.85 * a, 1.4);
      // テレビ
      if (rise > 0.5) {
        const k = (rise - 0.5) / 0.5;
        ctx.beginPath();
        const y0 = TV.y0, y1 = lerp(TV.y0, TV.y1, k), x = RW - 0.08;
        line3(ctx, [x, y0, TV.z0], [x, y0, TV.z1]); line3(ctx, [x, y0, TV.z1], [x, y1, TV.z1]);
        line3(ctx, [x, y1, TV.z1], [x, y1, TV.z0]); line3(ctx, [x, y1, TV.z0], [x, y0, TV.z0]);
        strokeRGBA(ctx, WH, 0.9 * a, 1.6);
      }
      // 家具の箱
      FURN.forEach(f => {
        const [x0, z0, x1, z1] = f.r, fh = f.h * rise;
        ctx.beginPath();
        [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(([x, z], i, arr) => {
          const [nx, nz] = arr[(i + 1) % 4];
          line3(ctx, [x, fh, z], [nx, fh, nz]);
          line3(ctx, [x, 0, z], [x, fh, z]);
        });
        strokeRGBA(ctx, f.c, 0.85 * a, 1.2);
      });
      // 天井の間接照明（立ち上がりきってから灯る）
      if (rise > 0.9) {
        const k = (rise - 0.9) / 0.1;
        const [x0, z0, x1, z1] = COVE;
        ctx.save();
        ctx.beginPath();
        line3(ctx, [x0, RH, z0], [x1, RH, z0]); line3(ctx, [x1, RH, z0], [x1, RH, z1]);
        line3(ctx, [x1, RH, z1], [x0, RH, z1]); line3(ctx, [x0, RH, z1], [x0, RH, z0]);
        ctx.shadowColor = `rgba(${AM},1)`; ctx.shadowBlur = 18;
        strokeRGBA(ctx, AM, 0.95 * a * k, 2.2);
        ctx.restore();
      }
    }

    function drawPhoto (ctx, reveal, fade, t) {
      if (reveal <= 0 || !img.complete || !img.naturalWidth) return;
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * 1.06;
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      const dx = (W - dw) / 2 - look.x * 18, dy = (H - dh) / 2 - look.y * 12;
      const edge = W * easeInOut(reveal);
      ctx.save();
      ctx.globalAlpha *= 1 - fade;
      ctx.beginPath(); ctx.rect(0, 0, edge, H); ctx.clip();
      ctx.drawImage(img, dx, dy, dw, dh);
      // 見出しが読めるよう、文字の側（PCは左、スマホは下）を暗くする
      const shade = narrow ? ctx.createLinearGradient(0, H * 0.3, 0, H) : ctx.createLinearGradient(0, 0, W * 0.6, 0);
      shade.addColorStop(0, narrow ? 'rgba(3,4,10,0)' : 'rgba(3,4,10,.78)');
      shade.addColorStop(narrow ? 0.45 : 0.55, 'rgba(3,4,10,.45)');
      shade.addColorStop(1, narrow ? 'rgba(3,4,10,.85)' : 'rgba(3,4,10,0)');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
      // 仕上がったあとは、ゆっくり光が横切る
      if (reveal >= 1) {
        const sx = ((t * 0.00012) % 1.6 - 0.3) * W;
        const g = ctx.createLinearGradient(sx - 160, 0, sx + 160, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,240,220,.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
      // 走査線
      if (reveal < 1) {
        ctx.save();
        const band = ctx.createLinearGradient(edge - 120, 0, edge, 0);
        band.addColorStop(0, `rgba(${AM},0)`); band.addColorStop(1, `rgba(${AM},.3)`);
        ctx.fillStyle = band; ctx.fillRect(edge - 120, 0, 120, H);
        ctx.fillStyle = '#ffe2b0'; ctx.shadowColor = `rgba(${AM},1)`; ctx.shadowBlur = 18;
        ctx.fillRect(edge - 1, 0, 2, H);
        ctx.restore();
      }
    }

    function drawSteps (ctx, s, a) {
      if (narrow || a <= 0.01) return;
      const names = ['PLAN', 'MODEL', 'CAMERA', 'RENDER'];
      const prog = [s.draw, s.rise, s.fly, s.reveal];
      const cx = W * 0.56, y = H * 0.2, gap = 96;
      ctx.font = '11px "Space Mono", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      names.forEach((n, i) => {
        const x = cx + (i - 1.5) * gap;
        const on = prog[i] > 0 && (i === 3 || prog[i + 1] <= 0);
        ctx.fillStyle = `rgba(${on ? WH : IN},${(on ? 0.95 : 0.45) * a})`;
        ctx.fillText(`0${i + 1} ${n}`, x, y);
        ctx.fillStyle = `rgba(${IN},${0.2 * a})`; ctx.fillRect(x - 40, y + 12, 80, 1);
        ctx.fillStyle = `rgba(${i === 3 ? AM : CY},${0.95 * a})`; ctx.fillRect(x - 40, y + 12, 80 * prog[i], 1);
      });
      ctx.textAlign = 'start';
    }

    return {
      resize (w, h, n) { W = w; H = h; narrow = n; },
      update (dt, t, mouse) {
        const tx = mouse.active ? mouse.x / W - 0.5 : 0, ty = mouse.active ? mouse.y / H - 0.5 : 0;
        look.x += (tx - look.x) * Math.min(1, 0.05 * dt);
        look.y += (ty - look.y) * Math.min(1, 0.05 * dt);
      },
      draw (ctx, t, alpha, build) {
        if (build < 1) startAt = null; else if (startAt === null) startAt = t;
        const ms = startAt === null ? 0 : Math.min(t - startAt, HOLD);
        const s = startAt === null ? { draw: 0, tilt: 0, rise: 0, fly: 0, reveal: 0, out: 0 } : stagesAt(ms);
        cam = cameraFor(s);
        const wires = (1 - s.reveal * 0.85) * (1 - s.out);

        ctx.save();
        ctx.globalAlpha = alpha;
        drawGrid(ctx, (1 - s.tilt * 0.7) * (1 - s.fly) * clamp(build * 1.4) * (1 - s.out));
        if (startAt === null) drawPlan(ctx, 1, clamp(build * 1.2), true);   // 点が集まる先として、完成形をうっすら
        else drawPlan(ctx, s.draw, (1 - s.fly * 0.5) * wires, false);
        drawLabels(ctx, clamp((s.draw - 0.9) / 0.1) * (1 - s.tilt) * (1 - s.out));
        drawModel(ctx, s.rise, wires);
        drawPhoto(ctx, s.reveal, s.out, t);
        drawSteps(ctx, s, clamp(build * 1.5) * (1 - s.out));
        ctx.restore();
      },
      // 点が集まる先：平面図の線の上（今のカメラで見た位置）
      targets (n) {
        if (!cache || cache.n !== n) {
          const pts = [];
          for (let i = 0; i < n; i++) {
            const d = ((i + 0.5) / n) * plan.total;
            const p = plan.list.find(q => d >= q.start && d < q.start + q.len) || plan.list[plan.list.length - 1];
            let left = d - p.start, pt = p.pts[0];
            for (let k = 1; k < p.pts.length; k++) {
              const l = Math.hypot(p.pts[k][0] - p.pts[k - 1][0], p.pts[k][1] - p.pts[k - 1][1]);
              if (left <= l) { const u = l ? left / l : 0; pt = [lerp(p.pts[k - 1][0], p.pts[k][0], u), lerp(p.pts[k - 1][1], p.pts[k][1], u)]; break; }
              left -= l; pt = p.pts[k];
            }
            pts.push(pt);
          }
          cache = { n, pts };
        }
        return cache.pts.map(([x, z]) => project([x, 0, z])).map(p => p || [W / 2, H / 2]);
      },
      click () {},
    };
  }

  global.PlanRender = { make };
})(window);
