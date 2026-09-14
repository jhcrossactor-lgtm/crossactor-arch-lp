/* HERO LAB：パターン切替バー（←→キーでも移動できる） */
const LAB_PATTERNS = [
  { file: '01-neural.html', name: 'NEURAL FIELD' },
  { file: '02-terminal.html', name: 'AI TERMINAL' },
  { file: '03-grid.html', name: 'HORIZON GRID' },
  { file: '04-aurora.html', name: 'LIQUID AURORA' },
  { file: '05-scan.html', name: 'VISION SCAN' },
  { file: '06-neural-morph.html', name: 'NEURAL MORPH' },
  { file: '07-flow.html', name: 'FLOW : AI → CITY' },
];

(function () {
  const here = location.pathname.split('/').pop();
  const i = LAB_PATTERNS.findIndex(p => p.file === here);
  if (i < 0) return;

  const n = LAB_PATTERNS.length;
  const prev = LAB_PATTERNS[(i - 1 + n) % n];
  const next = LAB_PATTERNS[(i + 1) % n];

  const bar = document.createElement('nav');
  bar.className = 'lab-switch';
  bar.setAttribute('aria-label', 'パターンの切り替え');

  const link = (href, text, label) => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    if (label) a.setAttribute('aria-label', label);
    return a;
  };
  const sep = () => { const s = document.createElement('span'); s.className = 'lab-switch__sep'; return s; };

  bar.append(link('index.html', '一覧'), sep(), link(prev.file, '←', `前のパターン：${prev.name}`));
  LAB_PATTERNS.forEach((p, k) => {
    const a = link(p.file, String(k + 1).padStart(2, '0'), p.name);
    if (k === i) a.setAttribute('aria-current', 'page');
    bar.append(a);
  });
  bar.append(link(next.file, '→', `次のパターン：${next.name}`));
  const name = document.createElement('span');
  name.className = 'lab-switch__name';
  name.textContent = LAB_PATTERNS[i].name;
  bar.append(sep(), name);
  document.body.append(bar);

  window.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') location.href = next.file;
    if (e.key === 'ArrowLeft') location.href = prev.file;
  });
})();
