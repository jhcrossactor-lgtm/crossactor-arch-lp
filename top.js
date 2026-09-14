/* =========================================================
   トップの動き
   1. 線画の3Dシーンと、見出しの語・サービス切替ボタンの連動
   2. サービスカードの傾きとスポットライト
   3. カーソルに吸い寄せられるボタン
   4. 固定の相談ボタン（トップを過ぎたら出し、診断・問い合わせでは隠す）
   ========================================================= */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover)').matches;

  /* ---------- 1. 線画シーン ---------- */
  const canvas = document.getElementById('hero-canvas');
  const hero = document.querySelector('.hero');
  if (canvas && hero && window.HeroScene) {
    const word = document.getElementById('hero-word');
    const chips = [...document.querySelectorAll('.chip')];
    const WORDS = ['建築', 'Web', 'AI'];
    const TONES = ['is-cyan', 'is-green', 'is-purple'];
    const narrow = () => window.innerWidth <= 980;
    let first = true;

    const setWord = i => {
      chips.forEach((c, k) => {
        c.classList.toggle('is-active', k === i);
        c.setAttribute('aria-pressed', String(k === i));
      });
      if (first || reduce) {
        first = false;
        word.textContent = WORDS[i];
        word.className = `hero__word-in ${TONES[i]}`;
        return;
      }
      word.classList.add('is-out');
      setTimeout(() => {
        word.textContent = WORDS[i];
        word.className = `hero__word-in is-in ${TONES[i]}`;
      }, 260);
    };

    const scene = window.HeroScene.mount(canvas, {
      shapes: ['house', 'web', 'ai'],
      onShape: setWord,
      pointerTarget: hero,
      // PC は文字の右に、スマホは文字の上に置く
      cx: () => (narrow() ? 0.5 : 0.7),
      cy: () => (narrow() ? 0.3 : 0.5),
      scale: () => (narrow() ? 0.3 : 0.31),
    });
    chips.forEach(c => c.addEventListener('click', () => scene.show(Number(c.dataset.shape))));

    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty('--gx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      hero.style.setProperty('--gy', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    });
  }

  /* ---------- 2. サービスカード ---------- */
  if (!reduce && canHover) {
    document.querySelectorAll('.svc__card').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
        card.style.setProperty('--ry', `${((x - 0.5) * 6).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${((0.5 - y) * 6).toFixed(2)}deg`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ---------- 3. 吸い寄せボタン ---------- */
  if (!reduce && canHover) {
    document.querySelectorAll('.btn--primary').forEach(btn => {
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${(x * 0.18).toFixed(1)}px, ${(y * 0.3).toFixed(1)}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
  }

  /* ---------- 4. 固定の相談ボタン ---------- */
  const floatCta = document.getElementById('float-cta');
  if (floatCta && hero) {
    const hideIn = ['diagnosis', 'contact'].map(id => document.getElementById(id)).filter(Boolean);
    const inside = new Set();
    let pastHero = false;
    const apply = () => floatCta.classList.toggle('is-shown', pastHero && inside.size === 0);

    new IntersectionObserver(([en]) => { pastHero = !en.isIntersecting; apply(); }, { threshold: 0.1 }).observe(hero);
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => (en.isIntersecting ? inside.add(en.target) : inside.delete(en.target)));
      apply();
    }, { threshold: 0.15 });
    hideIn.forEach(el => io.observe(el));
  }
})();
