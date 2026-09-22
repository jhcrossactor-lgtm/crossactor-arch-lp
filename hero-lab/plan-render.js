/* =========================================================
   PLAN → RENDER（HERO LAB 09）
   FLOW SCENE の3つ目の場面。方眼紙の背景の上で平面図が1本ずつ描かれ、
   紙が倒れて床になり、壁と家具が立ち上がり、カメラが部屋に入って、
   実写のパース（制作実例）がスキャンのように現れる。
   続けて opts.walk のパースへクロスフェードでつながる（1枚目はゆっくり引き、
   2枚目は右へゆっくりパン）。AI へ戻るときは、写真の素材の縁取りが
   青い線で浮き出て、写真だけが暗く沈み、残った線がタイル状に砕けて
   点に分解され、AI の最初へ戻る。

   PlanRender.make({ image, walk: [src, …] }) → FLOW SCENE の web に渡すオブジェクト
   ページ側では FlowScene.mount に webRain: 0 を渡し、AI のコードレインと
   背景がかぶらないようにする（こちらが方眼紙を描く）。
   ========================================================= */
(function (global) {
  const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const smooth = t => t * t * (3 - 2 * t);
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
    // 0: 平面図から仕上がるパース、1〜: ウォークスルーで続けて見せるパース
    const imgs = [opts.image || '../assets/render-living.webp', ...(opts.walk || [])].map(src => {
      const im = new Image(); im.src = src;
      if (im.decode) im.decode().catch(() => {});   // 使う瞬間ではなく、先にデコードしておく
      return im;
    });
    const plan = buildPlan();
    let W = 0, H = 0, narrow = false, startAt = null, cache = null, gridCache = null;
    let edge = null, edgeCache = null;   // AI へ戻るときの縁取り（Sobel）と、そこから採った点
    const look = { x: 0, y: 0 };
    let cam = CAM.top;

    /* ---------- 画像の下絵。画面サイズに合わせて一度だけ縮小しておき、
       毎フレームはこのキャンバスから描く（切り替わりのカクつき対策） ---------- */
    const scaled = imgs.map(() => null);
    let scaleKey = '';
    function ensureScaled () {
      const key = `${W}x${H}`;
      if (key !== scaleKey) { scaled.fill(null); scaleKey = key; edge = null; edgeCache = null; }
      imgs.forEach((im, i) => {
        if (scaled[i] || !im.complete || !im.naturalWidth || !W) return;
        const cover = Math.max(W / im.naturalWidth, H / im.naturalHeight);
        const k = Math.min(1, cover * 1.3);   // 最大ズームでも足りる大きさ。等倍より大きくはしない
        const cv = document.createElement('canvas');
        cv.width = Math.max(2, Math.round(im.naturalWidth * k));
        cv.height = Math.max(2, Math.round(im.naturalHeight * k));
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        scaled[i] = cv;
      });
    }

    // 時刻 ms での各工程の進み具合
    const stagesAt = ms => ({
      draw: clamp(ms / 3400),
      tilt: easeInOut(clamp((ms - 3400) / 1400)),
      rise: easeOut(clamp((ms - 4800) / 1600)),
      fly: easeInOut(clamp((ms - 6400) / 1500)),
      reveal: clamp((ms - 7900) / 1700),
      walk: clamp((ms - WALK_FROM) / (END - WALK_FROM)),
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

    /* カメラの向きは1フレームに1回だけ求める。
       project は線や点の数だけ呼ばれるので、ここで毎回やり直すと重くなる */
    let basis = null;
    function setBasis () {
      const fwd = norm(sub(cam.target, cam.pos));
      const right = norm(cross(fwd, cam.up));
      const up = cross(right, fwd);
      basis = {
        fwd, right, up, pos: cam.pos,
        f0: Math.min(W, H) * cam.focal * (narrow ? 0.85 : 1),
        cx: W * (narrow ? 0.5 : cam.cx),
        cy: H * (narrow ? 0.34 : 0.5),
      };
    }
    function project (p) {
      const b = basis || (setBasis(), basis);
      const dx = p[0] - b.pos[0], dy = p[1] - b.pos[1], dz = p[2] - b.pos[2];
      const z = dx * b.fwd[0] + dy * b.fwd[1] + dz * b.fwd[2];
      if (z < 0.05) return null;
      const f = b.f0 / z;
      return [b.cx + (dx * b.right[0] + dy * b.right[1] + dz * b.right[2]) * f,
              b.cy - (dx * b.up[0] + dy * b.up[1] + dz * b.up[2]) * f];
    }
    const line3 = (ctx, a, b) => {
      const p = project(a), q = project(b);
      if (!p || !q) return;
      ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    };
    const strokeRGBA = (ctx, color, a, w) => { ctx.strokeStyle = `rgba(${color},${a})`; ctx.lineWidth = w; ctx.stroke(); };

    /* ---------- 背景：製図用の方眼紙（AI のコードレインの代わり）。
       画面いっぱいの細罫＋太罫が、紙が流れるようにゆっくり動く ---------- */
    function drawBackdrop (ctx, a, t) {
      if (a <= 0.01) return;
      ctx.save();
      ctx.globalAlpha = a;
      const g = narrow ? 22 : 28, major = g * 5;
      const off = (t * 0.006) % major;   // ゆっくり左上へ流れる
      ctx.strokeStyle = `rgba(${CY},0.05)`; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -off; x < W + g; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = -off; y < H + g; y += g) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      ctx.strokeStyle = `rgba(${CY},0.1)`;
      ctx.beginPath();
      for (let x = -off; x < W + major; x += major) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = -off; y < H + major; y += major) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      // 太罫の交点に、製図の「＋」印
      ctx.strokeStyle = `rgba(${IN},0.22)`;
      ctx.beginPath();
      for (let x = -off; x < W + major; x += major) {
        for (let y = -off; y < H + major; y += major) {
          ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
          ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

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

    /* ---------- カットのつなぎ。k は [時刻ms, 注視点x, 注視点y, 拡大率]。
       揺れはなし。1枚目はゆっくり引き、2枚目は右へゆっくりパン。 ---------- */
    const SHOTS = [
      { img: 0, t0: 0,     room: 'LIVING',          k: [[9600, 0.5, 0.5, 1.14], [15400, 0.5, 0.5, 1.03]] },      // 仕上がったリビング。ゆっくり引いて全体を見せる
      { img: 1, t0: 14200, room: 'LIVING → DINING', k: [[14200, 0.42, 0.47, 1.12], [20000, 0.56, 0.47, 1.12]] }, // ズームは固定のまま、カウンターの方へ右にパン
    ];
    const FADE = 1600;
    const WALK_FROM = 9600, END = 20000;

    function shotView (shot, ms) {
      const k = shot.k;
      if (ms <= k[0][0]) return k[0].slice(1);
      for (let i = 1; i < k.length; i++) {
        if (ms <= k[i][0]) {
          const u = easeInOut((ms - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
          return [lerp(k[i - 1][1], k[i][1], u), lerp(k[i - 1][2], k[i][2], u), lerp(k[i - 1][3], k[i][3], u)];
        }
      }
      return k[k.length - 1].slice(1);
    }

    /* 写真の置き方。PC は画面いっぱい（cover）。
       スマホ（縦長）は画面いっぱいだとアップになりすぎるので、上半分の帯の高さに合わせて置き、
       帯の下端を背景色へフェードさせる。寄りの量も半分にして、引きの画角にする */
    const BAND = 0.5, FADE_FROM = 0.36, PHOTO_H = 0.56;   // 帯の高さ／フェード開始／写真が見える下端（画面比）
    function photoRect (nw, nh, cw, ch, fx, fy, zoom, lx, ly) {
      if (!narrow) {
        const s = Math.max(cw / nw, ch / nh) * zoom;
        const dw = nw * s, dh = nh * s;
        return [clamp(cw / 2 - fx * dw - lx, cw - dw, 0), clamp(ch / 2 - fy * dh - ly, ch - dh, 0), dw, dh];
      }
      const bh = ch * BAND;
      const s = Math.max(cw / nw, bh / nh) * (1 + (zoom - 1) * 0.5);
      const dw = nw * s, dh = nh * s;
      return [clamp(cw / 2 - fx * dw - lx, cw - dw, 0), clamp(bh / 2 - fy * dh - ly, bh - dh, 0), dw, dh];
    }

    function drawCover (ctx, idx, fx, fy, zoom) {
      const src = scaled[idx] || imgs[idx];
      const nw = src.width || src.naturalWidth, nh = src.height || src.naturalHeight;
      const [dx, dy, dw, dh] = photoRect(nw, nh, W, H, fx, fy, zoom, look.x * 18, look.y * 12);
      ctx.drawImage(src, dx, dy, dw, dh);
    }

    const currentShot = ms => { let i = 0; SHOTS.forEach((s, j) => { if (ms >= s.t0 + FADE / 2 && (j === 0 || imgs[s.img].naturalWidth)) i = j; }); return i; };

    /* ---------- AI へ戻るときの縁取り。最後に映っている構図を縮小して描き、
       Sobel で素材のエッジをシアンの線として抜き出しておく ---------- */
    function buildEdges () {
      const last = SHOTS[SHOTS.length - 1];
      const im = scaled[last.img] || imgs[last.img];
      if (!im || (!im.width && !im.naturalWidth)) return;
      const scaleTo = Math.min(1, 460 / Math.max(1, W));
      const w = Math.max(2, Math.round(W * scaleTo)), h = Math.max(2, Math.round(H * scaleTo));
      const src = document.createElement('canvas'); src.width = w; src.height = h;
      const sctx = src.getContext('2d', { willReadFrequently: true });
      // 画面と同じ構図（END 時点のビュー）で描く
      const [fx, fy, z] = shotView(last, END);
      const nw = im.width || im.naturalWidth, nh = im.height || im.naturalHeight;
      const [dx, dy, dw, dh] = photoRect(nw, nh, w, h, fx, fy, z, 0, 0);
      sctx.drawImage(im, dx, dy, dw, dh);
      // スマホは画面と同じく帯の下をフェードさせ、縁取りの線もそこで消えるようにする
      if (narrow) {
        const f = sctx.createLinearGradient(0, h * FADE_FROM, 0, h * PHOTO_H);
        f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,1)');
        sctx.fillStyle = f; sctx.fillRect(0, h * FADE_FROM, w, h);
      }
      const data = sctx.getImageData(0, 0, w, h).data;
      const lum = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) lum[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
      const out = sctx.createImageData(w, h);
      const pts = [];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          const gx = -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] + lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
          const gy = -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
          const g = Math.hypot(gx, gy);
          if (g > 72) {   // 木目や小さな模様は拾わず、家具や建具の輪郭を中心に
            out.data[i * 4] = 110; out.data[i * 4 + 1] = 231; out.data[i * 4 + 2] = 255;
            out.data[i * 4 + 3] = Math.min(225, (g - 72) * 1.7);
            if (g > 120 && (x * 7 + y * 13) % 3 === 0) pts.push([x / w, y / h]);   // 点分解の候補（線の上）
          }
        }
      }
      sctx.putImageData(out, 0, 0);
      // 点をばらして偏りをなくす
      for (let i = pts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const q = pts[i]; pts[i] = pts[j]; pts[j] = q; }
      edge = { cv: src, w, h, pts, tiles: null };
    }

    // 縁取りの線：浮き出たあと、細かい破片と点・短い線に分解されて飛散する
    function drawEdges (ctx, out) {
      if (!edge || out <= 0.01) return;
      const appear = smooth(clamp(out / 0.32));
      const dissolve = smooth(clamp((out - 0.42) / 0.52));
      if (!edge.tiles) {
        // 約15px角の細片
        edge.tc = Math.max(24, Math.round(W / 15));
        edge.tr = Math.max(16, Math.round(H / 15));
        edge.tiles = [];
        for (let i = 0; i < edge.tc * edge.tr; i++) {
          const a = Math.random() * Math.PI * 2;
          edge.tiles.push({ r: Math.random() * 0.8, dx: Math.cos(a), dy: Math.sin(a) - 0.8 });
        }
        // 線の上から剥がれる、細かい点と短い線
        edge.frag = [];
        const n = Math.min(1100, edge.pts.length);
        for (let i = 0; i < n; i++) {
          const q = edge.pts[(Math.random() * edge.pts.length) | 0];
          const a = Math.random() * Math.PI * 2;
          edge.frag.push({
            x: q[0], y: q[1], r: Math.random() * 0.75,
            vx: Math.cos(a) * (30 + Math.random() * 90), vy: Math.sin(a) * (30 + Math.random() * 90) - 50,
            seg: Math.random() < 0.3, ang: Math.random() * Math.PI * 2, len: 4 + Math.random() * 10,
          });
        }
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (dissolve <= 0.001) {
        // まだ砕けていない間は、線の層をそのまま重ねる
        ctx.globalAlpha = appear * 0.95;
        ctx.drawImage(edge.cv, -look.x * 18, -look.y * 12, W, H);
      } else {
        const tc = edge.tc, tr = edge.tr;
        const tw = edge.w / tc, th = edge.h / tr, dw = W / tc, dh = H / tr;
        for (let r = 0; r < tr; r++) {
          for (let c = 0; c < tc; c++) {
            const tile = edge.tiles[r * tc + c];
            const k = dissolve <= tile.r ? 0 : (dissolve - tile.r) / (1 - tile.r + 1e-4);
            const a = appear * (1 - k) * (1 - k);   // 破片は早めに薄く。あとは点と線が引き継ぐ
            if (a <= 0.02) continue;
            ctx.globalAlpha = a * 0.95;
            ctx.drawImage(edge.cv, c * tw, r * th, tw, th,
              c * dw + tile.dx * k * 46 - look.x * 18, r * dh + tile.dy * k * 46 - look.y * 12, dw, dh);
          }
        }
        // 剥がれた点と短い線
        ctx.strokeStyle = `rgba(${CY},0.8)`; ctx.lineWidth = 1;
        ctx.fillStyle = `rgba(${CY},0.9)`;
        for (const f of edge.frag) {
          if (dissolve <= f.r) continue;
          const k = (dissolve - f.r) / (1 - f.r + 1e-4);
          const a = appear * (1 - k);
          if (a <= 0.02) continue;
          const x = f.x * W + f.vx * k - look.x * 18, y = f.y * H + f.vy * k - look.y * 12;
          ctx.globalAlpha = a;
          if (f.seg) {
            const l = f.len * (1 - k * 0.6);
            ctx.beginPath();
            ctx.moveTo(x - Math.cos(f.ang) * l, y - Math.sin(f.ang) * l);
            ctx.lineTo(x + Math.cos(f.ang) * l, y + Math.sin(f.ang) * l);
            ctx.stroke();
          } else {
            ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
          }
        }
      }
      ctx.restore();
    }

    // out: AI へ戻る進み具合（0→1）。彩度を落として紺に寄せてから薄くなる
    function drawPhoto (ctx, reveal, ms, t, alpha, out) {
      if (reveal <= 0 || !imgs[0].complete || !imgs[0].naturalWidth) return;
      ensureScaled();
      // 写真は縁取りより先に暗く沈む（線だけが残る）
      const photoK = alpha * (1 - smooth(clamp((out - 0.08) / 0.5)));
      if (photoK <= 0.01) return;
      const edge = W * easeInOut(reveal);
      const ph = narrow ? H * PHOTO_H : H;   // 写真が見える高さ（スマホは上の帯だけ）
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, edge, ph); ctx.clip();
      const canFilter = ctx.filter !== undefined;
      if (out > 0.01 && canFilter) ctx.filter = `saturate(${Math.round(clamp(1 - out * 1.15) * 100)}%)`;
      SHOTS.forEach((shot, i) => {
        const im = imgs[shot.img];
        if (!im.complete || !im.naturalWidth || ms < shot.t0) return;
        const next = SHOTS[i + 1];
        const nextReady = next && imgs[next.img].complete && imgs[next.img].naturalWidth;
        if (nextReady && ms > next.t0 + FADE) return;   // 次のカットに入りきったら描かない
        const fadeIn = i === 0 ? 1 : smooth(clamp((ms - shot.t0) / FADE));
        const [fx, fy, z] = shotView(shot, ms);
        ctx.globalAlpha = photoK * fadeIn;
        drawCover(ctx, shot.img, fx, fy, z);
      });
      if (canFilter) ctx.filter = 'none';
      ctx.globalAlpha = photoK;
      // AI へ戻るとき：彩度が落ちた写真を、AI の場面の紺に沈めていく
      if (out > 0.01) {
        ctx.fillStyle = `rgba(6,12,32,${0.8 * clamp(out * 1.5)})`; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = `rgba(${CY},${0.04 * out})`; ctx.fillRect(0, 0, W, H);
      }
      // 見出しが読めるよう、PC は文字の側（左）を暗くする。スマホは写真の帯の下端を背景色へフェード
      const shade = narrow ? ctx.createLinearGradient(0, H * FADE_FROM, 0, ph) : ctx.createLinearGradient(0, 0, W * 0.6, 0);
      if (narrow) {
        shade.addColorStop(0, 'rgba(3,4,10,0)'); shade.addColorStop(1, 'rgba(3,4,10,1)');
      } else {
        shade.addColorStop(0, 'rgba(3,4,10,.78)'); shade.addColorStop(0.55, 'rgba(3,4,10,.45)'); shade.addColorStop(1, 'rgba(3,4,10,0)');
      }
      ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
      // 上の工程ラベルと HUD の下も少し暗くする
      const top = ctx.createLinearGradient(0, 0, 0, H * 0.26);
      top.addColorStop(0, 'rgba(3,4,10,.7)'); top.addColorStop(1, 'rgba(3,4,10,0)');
      ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * 0.26);
      if (reveal >= 1 && out < 0.01) {
        const sx = ((t * 0.00012) % 1.6 - 0.3) * W;
        const g = ctx.createLinearGradient(sx - 160, 0, sx + 160, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,240,220,.06)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
      // 走査線
      if (reveal < 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const band = ctx.createLinearGradient(edge - 120, 0, edge, 0);
        band.addColorStop(0, `rgba(${AM},0)`); band.addColorStop(1, `rgba(${AM},.3)`);
        ctx.fillStyle = band; ctx.fillRect(edge - 120, 0, 120, ph);
        ctx.fillStyle = '#ffe2b0'; ctx.shadowColor = `rgba(${AM},1)`; ctx.shadowBlur = 18;
        ctx.fillRect(edge - 1, 0, 2, ph);
        ctx.restore();
      }
    }

    function drawSteps (ctx, s, a, ms) {
      if (a <= 0.01) return;
      const names = ['PLAN', 'MODEL', 'CAMERA', 'RENDER', 'VIEWS'];
      const prog = [s.draw, s.rise, s.fly, s.reveal, s.walk];
      if (!narrow) {
        const cx = W * 0.6, y = H * 0.13, gap = 88;
        ctx.font = '11px "Space Mono", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
        names.forEach((n, i) => {
          const x = cx + (i - 2) * gap;
          const on = prog[i] > 0 && (i === names.length - 1 || prog[i + 1] <= 0);
          ctx.fillStyle = `rgba(${on ? WH : IN},${(on ? 0.95 : 0.45) * a})`;
          ctx.fillText(`0${i + 1} ${n}`, x, y);
          ctx.fillStyle = `rgba(${IN},${0.2 * a})`; ctx.fillRect(x - 36, y + 12, 72, 1);
          ctx.fillStyle = `rgba(${i >= 3 ? AM : CY},${0.95 * a})`; ctx.fillRect(x - 36, y + 12, 72 * prog[i], 1);
        });
      }
      // 歩いている間は、今いる場所の名前
      if (s.walk > 0) {
        const room = SHOTS[currentShot(ms)].room;
        ctx.font = `${narrow ? 10 : 12}px "Space Mono", monospace`; ctx.textBaseline = 'middle';
        ctx.textAlign = narrow ? 'right' : 'center';
        ctx.fillStyle = `rgba(255,226,176,${0.9 * a * clamp(s.walk * 8)})`;
        ctx.fillText(`● ${room}`, narrow ? W - 20 : W * 0.6, narrow ? H * 0.47 : H * 0.13 + 34);
      }
      ctx.textAlign = 'start';
    }

    return {
      resize (w, h, n) { W = w; H = h; narrow = n; ensureScaled(); },
      update (dt, t, mouse) {
        const tx = mouse.active ? mouse.x / W - 0.5 : 0, ty = mouse.active ? mouse.y / H - 0.5 : 0;
        look.x += (tx - look.x) * Math.min(1, 0.05 * dt);
        look.y += (ty - look.y) * Math.min(1, 0.05 * dt);
      },
      draw (ctx, t, alpha, build) {
        if (build < 1) startAt = null; else if (startAt === null) startAt = t;
        const ms = startAt === null ? 0 : Math.min(t - startAt, END);
        const s = startAt === null ? { draw: 0, tilt: 0, rise: 0, fly: 0, reveal: 0, walk: 0 } : stagesAt(ms);
        cam = cameraFor(s);
        setBasis();
        const wires = 1 - s.reveal * 0.85;
        // 組み上がったまま外側のフェードが始まった＝AI へ戻り始めた
        const out = build >= 1 && alpha < 0.999 ? clamp(1 - alpha) : 0;

        ctx.save();
        ctx.globalAlpha = alpha;
        drawBackdrop(ctx, clamp(build * 1.2) * (1 - s.reveal), t);
        drawGrid(ctx, (1 - s.tilt * 0.7) * (1 - s.fly) * clamp(build * 1.4));
        if (startAt === null) drawPlan(ctx, 1, clamp(build * 1.2), true);   // 点が集まる先として、完成形をうっすら
        else drawPlan(ctx, s.draw, (1 - s.fly * 0.5) * wires, false);
        drawLabels(ctx, clamp((s.draw - 0.9) / 0.1) * (1 - s.tilt));
        drawModel(ctx, s.rise, wires);
        // 縁取りは AI へ戻る少し前（最後の静止中）に用意しておく
        if (startAt !== null && ms >= END - 150 && !edge && imgs[SHOTS[SHOTS.length - 1].img].naturalWidth) buildEdges();
        drawPhoto(ctx, s.reveal, ms, t, alpha, out);
        drawEdges(ctx, out);   // 青い線は写真のフェードと別に残り、砕けて消える
        drawSteps(ctx, s, clamp(build * 1.5), ms);
        ctx.restore();
      },
      // 点が集まる先／散らばる元
      targets (n, now) {
        const ms = startAt === null ? 0 : Math.min((now !== undefined ? now : performance.now()) - startAt, END);
        // 実写が出てからは、縁取りの線の上の点：AIへ戻るとき、青い線が点に分解されて見える
        if (startAt !== null && ms > 8600 && edge && edge.pts.length > 48) {
          if (!edgeCache || edgeCache.n !== n) {
            const step = edge.pts.length / n, pts = [];
            for (let i = 0; i < n; i++) {
              const q = edge.pts[Math.min(edge.pts.length - 1, Math.floor(i * step))];
              pts.push([q[0] * W, q[1] * H]);
            }
            edgeCache = { n, pts };
          }
          return edgeCache.pts;
        }
        // 縁取りがまだ無ければ画面全体に散らばった点
        if (startAt !== null && ms > 8600) {
          if (!gridCache || gridCache.n !== n || gridCache.w !== W || gridCache.h !== H) {
            const cols = Math.max(2, Math.ceil(Math.sqrt(n * W / Math.max(1, H))));
            const rows = Math.max(2, Math.ceil(n / cols));
            const pts = [];
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols && pts.length < n; c++) {
                pts.push([((c + 0.5) / cols + (Math.random() - 0.5) * 0.8 / cols) * W,
                          ((r + 0.5) / rows + (Math.random() - 0.5) * 0.8 / rows) * H]);
              }
            }
            while (pts.length < n) pts.push([Math.random() * W, Math.random() * H]);
            gridCache = { n, w: W, h: H, pts };
          }
          return gridCache.pts;
        }
        // それまでは平面図の線の上（今のカメラで見た位置）
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
          cache = { n, pts, out: Array.from({ length: n }, () => [0, 0]), tmp: [0, 0, 0] };
        }
        // 毎フレーム呼ばれるので、配列は作り直さず使い回す
        setBasis();
        const { pts, out, tmp } = cache;
        for (let i = 0; i < pts.length; i++) {
          tmp[0] = pts[i][0]; tmp[2] = pts[i][1];
          const q = project(tmp);
          out[i][0] = q ? q[0] : W / 2;
          out[i][1] = q ? q[1] : H / 2;
        }
        return out;
      },
      click () {},
    };
  }

  global.PlanRender = { make };
})(window);
