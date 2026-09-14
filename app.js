/* =========================================================
   CROSSACTOR — interactions
   1. 立面図と構造材の線を組み立てる（SVG）
   2. SEQUENCE：スクロールで 図面 → 構造 → 完成 → 体験
   3. BEFORE / AFTER：比較スライダー＋360度の見回し
   4. ページ共通：ナビ・リビール・工程の線
   ========================================================= */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = v => Math.min(Math.max(v, 0), 1);
const easeOut = t => 1 - Math.pow(1 - t, 3);

/* ---------------------------------------------------------
   1. 線の組み立て
   すべての線に pathLength=1 を付け、dashoffset 1→0 で「引かれていく」ようにする
   --------------------------------------------------------- */
(function buildDrawing () {
  const svg = document.getElementById('drawing');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const plan = svg.querySelector('#g-plan');
  const struct = svg.querySelector('#g-struct');

  const add = (parent, tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    el.setAttribute('pathLength', '1');
    parent.appendChild(el);
    return el;
  };
  const text = (x, y, str, anchor = 'middle') => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('text-anchor', anchor);
    t.textContent = str;
    plan.appendChild(t);
  };

  // 立面図の基準線（2階建て・切妻）
  const GL = 470, L = 210, R = 590, EAVE = 250, FL2 = 360, RIDGE = 112;
  const MID = (L + R) / 2, OH = 26;   // OH = 軒の出

  add(plan, 'line', { x1: 110, y1: GL, x2: 690, y2: GL });                                   // 地盤面
  add(plan, 'polyline', { points: `${L},${GL} ${L},${EAVE} ${R},${EAVE} ${R},${GL}` });       // 外壁
  add(plan, 'polyline', { points: `${L - OH},${EAVE + 14} ${MID},${RIDGE} ${R + OH},${EAVE + 14}` }); // 屋根
  add(plan, 'line', { x1: L, y1: FL2, x2: R, y2: FL2 });                                     // 2階床
  [[248, 278, 70, 56], [362, 278, 76, 56], [482, 278, 70, 56],
   [248, 392, 92, 60], [398, 390, 64, 80], [500, 392, 62, 60]]
    .forEach(([x, y, w, h]) => add(plan, 'rect', { x, y, width: w, height: h }));             // 開口部
  add(plan, 'polyline', { class: 'dim', points: `${L},${GL + 22} ${L},${GL + 40} ${L},${GL + 32} ${R},${GL + 32} ${R},${GL + 22} ${R},${GL + 40}` });
  add(plan, 'polyline', { class: 'dim', points: `${R + 58},${GL} ${R + 58},${RIDGE} ${R + 50},${RIDGE} ${R + 66},${RIDGE}` });
  text(MID, GL + 56, '7,280');
  text(R + 70, (GL + RIDGE) / 2, 'H 7,450', 'start');
  text(L, 88, 'ELEVATION  S=1:100', 'start');

  // 構造材：柱・間柱、胴差し・土台、小屋束、筋かい
  for (let x = L; x <= R + 0.1; x += 38) add(struct, 'line', { class: 'struct', x1: x, y1: GL, x2: x, y2: EAVE });
  [EAVE, FL2, GL - 2].forEach(y => add(struct, 'line', { class: 'struct', x1: L, y1: y, x2: R, y2: y }));
  for (let i = 1; i <= 5; i++) {
    const k = i / 6;
    const y = EAVE + 14 + (RIDGE - (EAVE + 14)) * k;
    const xl = (L - OH) + (MID - (L - OH)) * k;
    const xr = (R + OH) - ((R + OH) - MID) * k;
    if (y < EAVE) {
      add(struct, 'line', { class: 'struct', x1: xl, y1: y, x2: xl, y2: EAVE });
      add(struct, 'line', { class: 'struct', x1: xr, y1: y, x2: xr, y2: EAVE });
    }
  }
  [[L, GL, L + 76, FL2], [R, GL, R - 76, FL2], [L, FL2, L + 76, EAVE], [R, FL2, R - 76, EAVE]]
    .forEach(([x1, y1, x2, y2]) => add(struct, 'line', { class: 'struct', x1, y1, x2, y2 }));
})();

/* ---------------------------------------------------------
   2. SEQUENCE
   --------------------------------------------------------- */
(function sequence () {
  const sec = document.querySelector('.seq');
  if (!sec) return;

  const frame = sec.querySelector('.frame');
  const planImg = sec.querySelector('.layer--plan');
  const structImg = sec.querySelector('.layer--structure');
  const finish = sec.querySelector('.layer--finish');
  const svg = sec.querySelector('.layer--draw');
  const planLines = [...svg.querySelectorAll('#g-plan > :not(text)')];
  const labels = [...svg.querySelectorAll('#g-plan > text')];
  const structLines = [...svg.querySelectorAll('#g-struct > *')];
  const phases = [...sec.querySelectorAll('.phase')];
  const hudNo = sec.querySelector('.hud__no');
  const hudName = sec.querySelector('.hud__name');
  const hudBar = sec.querySelector('.hud__bar i');
  const NAMES = ['PLAN', 'STRUCTURE', 'FINISH', 'EXPERIENCE'];

  // 線を1本ずつ少し遅らせて引く（t は 0→1 のそのグループの進み具合）
  const draw = (els, t) => {
    const n = els.length;
    els.forEach((el, i) => {
      const start = (i / n) * 0.55;
      el.style.strokeDashoffset = (1 - clamp01((t - start) / 0.45)).toFixed(4);
    });
  };

  let finishK = 0, vr = false;
  // 読み込み直後にスクロール前でも枠が空にならないよう、図面だけは時間で描き始める
  let intro = reduceMotion ? 1 : 0;
  let lookX = 0, lookY = 0, targetX = 0, targetY = 0, raf = 0;

  function applyFinish () {
    // 完成パースは塗り終わると等倍に戻り、VR中は少し寄って視線移動の余白を作る
    const scale = 1.12 - 0.12 * finishK + (vr ? 0.08 : 0);
    finish.style.transform =
      `translate(${(lookX * -3).toFixed(3)}%, ${(lookY * -2).toFixed(3)}%) scale(${scale.toFixed(4)})`;
  }

  function update () {
    const range = Math.max(sec.offsetHeight - window.innerHeight, 1);
    const p = clamp01(-sec.getBoundingClientRect().top / range);

    // 01 PLAN：図面を薄く敷き、立面の線を引く
    draw(planLines, Math.max(intro, clamp01(p / 0.2)));
    labels.forEach(t => { t.style.opacity = Math.max(clamp01((intro - 0.7) / 0.3), clamp01((p - 0.14) / 0.06)).toFixed(3); });
    planImg.style.opacity = (Math.max(clamp01(intro * 1.6), clamp01(p / 0.08)) * 0.5 * (1 - clamp01((p - 0.42) / 0.1))).toFixed(3);

    // 02 STRUCTURE：構造材の線 → 実際の骨組み写真が下から立ち上がる
    draw(structLines, clamp01((p - 0.22) / 0.2));
    const rise = easeOut(clamp01((p - 0.36) / 0.16));
    structImg.style.opacity = clamp01((p - 0.34) / 0.06).toFixed(3);
    structImg.style.clipPath = `inset(${((1 - rise) * 100).toFixed(2)}% 0 0 0)`;
    svg.style.opacity = (1 - clamp01((p - 0.58) / 0.08)).toFixed(3);

    // 03 FINISH：完成パースを左から塗る
    finishK = easeOut(clamp01((p - 0.52) / 0.18));
    finish.style.clipPath = `inset(0 ${((1 - finishK) * 100).toFixed(2)}% 0 0)`;

    // 04 EXPERIENCE：VR表示に切り替え、マウスで見回せるようにする
    const nowVR = p > 0.76;
    if (nowVR !== vr) {
      vr = nowVR;
      frame.classList.toggle('is-vr', vr);
      if (!vr) { targetX = targetY = 0; }
    }
    applyFinish();

    const ph = Math.min(3, Math.floor(p * 4));
    const local = clamp01(p * 4 - ph);
    phases.forEach((li, i) => {
      li.classList.toggle('is-active', i === ph);
      li.classList.toggle('is-done', i < ph);
      li.style.setProperty('--t', i < ph ? 1 : i === ph ? local.toFixed(3) : 0);
    });
    hudNo.textContent = `0${ph + 1} / 04`;
    hudName.textContent = NAMES[ph];
    hudBar.style.width = `${(p * 100).toFixed(2)}%`;
  }

  // 視線移動はなめらかに追従させる（止まったらループを止める）
  function look () {
    lookX += (targetX - lookX) * 0.12;
    lookY += (targetY - lookY) * 0.12;
    applyFinish();
    if (Math.abs(targetX - lookX) > 0.001 || Math.abs(targetY - lookY) > 0.001) raf = requestAnimationFrame(look);
    else raf = 0;
  }
  frame.addEventListener('pointermove', e => {
    if (!vr || reduceMotion) return;
    const b = frame.getBoundingClientRect();
    targetX = ((e.clientX - b.left) / b.width - 0.5) * 2;
    targetY = ((e.clientY - b.top) / b.height - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(look);
  });
  frame.addEventListener('pointerleave', () => {
    targetX = targetY = 0;
    if (!raf) raf = requestAnimationFrame(look);
  });

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });
  window.addEventListener('resize', update);
  update();

  if (!reduceMotion) {
    const t0 = performance.now();
    (function play (t) {
      intro = easeOut(clamp01((t - t0) / 2200));
      update();
      if (intro < 1) requestAnimationFrame(play);
    })(t0);
  }
})();

/* ---------------------------------------------------------
   3. BEFORE / AFTER
   --------------------------------------------------------- */
(function compare () {
  const cmp = document.getElementById('cmp');
  if (!cmp) return;

  const imgA = cmp.querySelector('.cmp__img--a');
  const imgB = cmp.querySelector('.cmp__img--b');
  const handle = cmp.querySelector('.cmp__handle');
  const tagA = cmp.querySelector('.cmp__tag--a');
  const tagB = cmp.querySelector('.cmp__tag--b');
  const tabs = [...document.querySelectorAll('.cmp-tab')];

  let pos = 50, pan = 0, mode = null, startX = 0, startPan = 0;

  const render = () => {
    cmp.style.setProperty('--pos', `${pos}%`);
    cmp.style.setProperty('--pan', `${pan.toFixed(1)}px`);
    handle.setAttribute('aria-valuenow', String(Math.round(pos)));
  };
  const touched = () => cmp.classList.add('is-touched');

  function select (tab) {
    tabs.forEach(t => t.setAttribute('aria-selected', String(t === tab)));
    imgA.style.backgroundImage = `url("${tab.dataset.a}")`;
    imgB.style.backgroundImage = `url("${tab.dataset.b}")`;
    tagA.textContent = tab.dataset.la;
    tagB.textContent = tab.dataset.lb;
  }
  tabs.forEach(t => t.addEventListener('click', () => select(t)));
  select(tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0]);

  // つまみ：比較位置
  handle.addEventListener('pointerdown', e => {
    mode = 'split';
    handle.setPointerCapture(e.pointerId);
    touched();
    e.stopPropagation();
    e.preventDefault();
  });
  handle.addEventListener('pointermove', e => {
    if (mode !== 'split') return;
    const r = cmp.getBoundingClientRect();
    pos = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    render();
  });
  const endSplit = () => { if (mode === 'split') mode = null; };
  handle.addEventListener('pointerup', endSplit);
  handle.addEventListener('pointercancel', endSplit);
  handle.addEventListener('keydown', e => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') pos = Math.max(0, pos - step);
    else if (e.key === 'ArrowRight') pos = Math.min(100, pos + step);
    else if (e.key === 'Home') pos = 0;
    else if (e.key === 'End') pos = 100;
    else return;
    e.preventDefault();
    touched();
    render();
  });

  // 画像のドラッグ：360度写真を横に回す（2枚は同じ位置で一緒に回る）
  cmp.addEventListener('pointerdown', e => {
    if (e.target.closest('.cmp__handle')) return;
    mode = 'pan';
    startX = e.clientX;
    startPan = pan;
    cmp.setPointerCapture(e.pointerId);
    cmp.classList.add('is-panning');
    touched();
  });
  cmp.addEventListener('pointermove', e => {
    if (mode !== 'pan') return;
    pan = startPan + (e.clientX - startX);
    render();
  });
  const endPan = () => {
    if (mode !== 'pan') return;
    mode = null;
    cmp.classList.remove('is-panning');
  };
  cmp.addEventListener('pointerup', endPan);
  cmp.addEventListener('pointercancel', endPan);

  // 触られるまでは、ゆっくり自動で見回して「回せる」ことを伝える
  if (!reduceMotion) {
    let prev = performance.now();
    (function drift (t) {
      if (cmp.classList.contains('is-touched')) return;
      pan -= (t - prev) * 0.02;
      prev = t;
      render();
      requestAnimationFrame(drift);
    })(prev);
  }
  render();
})();

/* ---------------------------------------------------------
   4. ページ共通
   --------------------------------------------------------- */
(function page () {
  const nav = document.querySelector('.nav');
  const steps = [...document.querySelectorAll('.steps')];

  const drawSteps = () => steps.forEach(s => {
    const r = s.getBoundingClientRect();
    const t = clamp01((window.innerHeight * 0.8 - r.top) / (r.height + window.innerHeight * 0.1));
    s.style.setProperty('--draw', reduceMotion ? 1 : t.toFixed(3));
  });

  let ticking = false;
  const onScroll = () => {
    nav.classList.toggle('is-stuck', window.scrollY > 40);
    drawSteps();
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScroll);
  }, { passive: true });
  onScroll();

  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => {
    if (el.dataset.delay) el.style.transitionDelay = `${el.dataset.delay}ms`;
    io.observe(el);
  });
})();
