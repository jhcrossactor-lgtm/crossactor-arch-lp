/* 黄色トップの再生バーと、試作用の案の切り替え */
(function () {
  const hero = document.querySelector('.town');
  const canvas = document.getElementById('town-canvas');
  if (!hero || !canvas || !window.TownScene) return;
  const S = window.TownScene;
  const tc = document.getElementById('town-tc');
  const bar = document.getElementById('town-bar');
  const steps = [...hero.querySelectorAll('.town__steps button')];
  let shown = -1;
  S.onFrame((t, ph) => {
    const sec = Math.floor(t);
    if (sec !== shown) { tc.textContent = `00:${String(sec).padStart(2, '0')}`; shown = sec; }
    bar.style.width = `${(t / S.LOOP * 100).toFixed(2)}%`;
    steps.forEach((b, i) => { if (i === ph) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  });
  steps.forEach(b => b.addEventListener('click', () => S.seek(Number(b.dataset.step))));

  const log = document.getElementById('town-log');
  const LOG = [
    ['物件資料を読み込み中…', '区画図・価格表を認識しました'],
    ['区割りを計算中…', '12区画／道路幅 6.0m'],
    ['建物を配置中…', '住宅パターン3種から選びました'],
    ['街並みPVを書き出し中…', 'CUT 01 を決定／00:18'],
  ];
  let lastLog = '';
  S.onFrame((t, ph) => {
    if (!log) return;
    const html = LOG.slice(0, ph + 1).map(([cmd, res], i) => {
      const el = i === ph ? t - S.PHASES[ph] : 99;
      const n = Math.floor(el * 26);
      const c = cmd.slice(0, n), r = n > cmd.length + 6 ? res : '';
      const cur = i === ph && !r ? '<b class="town__cursor"></b>' : '';
      return `<p><span class="p">&gt;</span> ${c}${cur}</p>` + (r ? `<p class="ok">✓ ${r}</p>` : '');
    }).join('');
    if (html !== lastLog) { log.innerHTML = html; lastLog = html; }
  });

  const LAYOUT = { 1: { zoom: 0.6, cx: 0.7, cy: 0.6 }, 2: { zoom: 1.05, cx: 0.5, cy: 0.56 }, 3: { zoom: 0.56, cx: 0.5, cy: 0.79 } };
  const buttons = [...document.querySelectorAll('.vswitch button')];
  function setV (v) {
    hero.dataset.v = v;
    Object.assign(canvas.dataset, window.innerWidth <= 820 ? { zoom: 0.9, cx: 0.5, cy: 0.5 } : LAYOUT[v]);
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
    S.redraw();
  }
  buttons.forEach(b => b.addEventListener('click', () => setV(b.dataset.v)));
  window.addEventListener('resize', () => setV(hero.dataset.v));
  setV(hero.dataset.v);
  const q = new URLSearchParams(location.search);
  if (q.get('v')) setV(q.get('v'));
  if (q.get('t')) S.hold(parseFloat(q.get('t')));
})();
