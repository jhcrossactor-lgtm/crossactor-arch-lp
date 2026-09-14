/* =========================================================
   相談診断とお問い合わせ
   質問に答える → 相談メモと「最初の一歩」を出す → Googleフォームを入力済みで開く
   サーバーは使わない。送信するのはユーザーがフォームを開いて送ったときだけ。
   ========================================================= */

/* ---------------------------------------------------------
   お問い合わせ先の設定（README「Googleフォームのつなぎ方」を参照）
   formUrl が空のあいだは、フォームを開く代わりにメモをコピーして案内を出す
   --------------------------------------------------------- */
const CONTACT = {
  formUrl: '',          // 例: 'https://docs.google.com/forms/d/e/1FAIpQLSxxxxxxxx/viewform'
  entries: {
    service: '',        // 例: 'entry.1234567890'（「ご相談の種類」の質問）
    memo: '',           // 例: 'entry.2345678901'（「ご相談内容」の質問）
  },
};

(function () {
  const panel = document.getElementById('diag');
  if (!panel) return;

  const SERVICES = {
    vr: '3D VRパース制作',
    web: 'Webサイト・LP制作',
    ai: 'AI導入・活用の相談',
    undecided: 'まだ決まっていない',
  };

  const QUESTIONS = {
    service: {
      q: 'ご相談したいことは？', label: 'ご相談の種類',
      opts: [
        { v: 'vr', label: '3D VRパースをつくりたい', sub: '図面や写真から、歩けるVR空間に' },
        { v: 'web', label: 'Webサイト・LPをつくりたい', sub: '新しく作る／今のサイトを見直す' },
        { v: 'ai', label: 'AIを仕事に活かしたい', sub: '何に使えるかの整理から' },
        { v: 'undecided', label: 'まだ決まっていない', sub: '話しながら整理したい' },
      ],
    },
    vr_source: {
      q: '何をもとにつくりますか？', label: 'もとにする資料',
      opts: [
        { v: 'plan', label: '図面がある（新築・計画中）' },
        { v: 'photo', label: '今の部屋の写真から（リフォーム）' },
        { v: 'unknown', label: 'まだわからない' },
      ],
    },
    vr_use: {
      q: 'どんな場面で使いますか？', label: '使う場面',
      opts: [
        { v: 'sales', label: '完成前の販売・集客' },
        { v: 'proposal', label: '設計の提案・コンペ' },
        { v: 'reform', label: 'リフォームの提案' },
        { v: 'other', label: 'その他・相談して決めたい' },
      ],
    },
    web_goal: {
      q: 'サイトでいちばん叶えたいことは？', label: 'サイトの目的',
      opts: [
        { v: 'leads', label: '問い合わせ・予約を増やしたい' },
        { v: 'brand', label: '会社や商品の魅力を伝えたい' },
        { v: 'launch', label: '新サービス・イベントを告知したい' },
        { v: 'unknown', label: 'まだ整理できていない' },
      ],
    },
    web_current: {
      q: '今のサイトの状況は？', label: '今のサイト',
      opts: [
        { v: 'none', label: 'まだサイトがない' },
        { v: 'old', label: 'あるが、古い・更新しにくい' },
        { v: 'partial', label: 'あるので、LPなど一部をつくりたい' },
      ],
    },
    ai_pain: {
      q: 'いちばん時間を取られていることは？', label: '困っていること',
      opts: [
        { v: 'docs', label: '資料・書類づくり' },
        { v: 'research', label: '情報収集・調べもの' },
        { v: 'reply', label: '問い合わせ・メールの対応' },
        { v: 'unknown', label: '何に使えるか、まず知りたい' },
      ],
    },
    ai_team: {
      q: 'AIを使うのは誰ですか？', label: '使う人',
      opts: [
        { v: 'solo', label: '自分ひとり' },
        { v: 'team', label: 'チーム・部署' },
        { v: 'company', label: '会社全体' },
      ],
    },
    timing: {
      q: 'いつ頃から進めたいですか？', label: '時期',
      opts: [
        { v: 'soon', label: 'すぐにでも（1か月以内）' },
        { v: 'quarter', label: '3か月以内' },
        { v: 'research', label: 'まずは情報収集' },
      ],
    },
  };

  // 最初の質問の答えで、その後に聞く質問が変わる
  const FLOW = {
    vr: ['service', 'vr_source', 'vr_use', 'timing'],
    web: ['service', 'web_goal', 'web_current', 'timing'],
    ai: ['service', 'ai_pain', 'ai_team', 'timing'],
    undecided: ['service', 'timing'],
  };

  // 最初の一歩の案。料金や納期の約束はせず、進め方の目安だけを出す
  const FIRST_STEP = {
    vr: {
      plan: '平面図（PDF・画像どちらでも）をお送りください。どの部屋から見せるかを一緒に決めます。',
      photo: 'お部屋の写真を数枚お送りください。360度撮影が必要かどうかも含めてご案内します。',
      unknown: '計画の状況を伺い、図面から作るか写真から作るかを一緒に決めます。',
    },
    web: {
      leads: '今の集客の流れを伺い、問い合わせにつながるページ構成のたたき台をつくります。',
      brand: '伝えたい魅力を言葉にするところから始め、見せ方の方向性を決めます。',
      launch: '告知の時期から逆算して、LPの構成と公開までの段取りを決めます。',
      unknown: '目的の整理から始めます。参考にしたいサイトがあれば教えてください。',
    },
    ai: {
      docs: 'よく作る資料を1つ選び、AIでたたき台を作る流れを一緒に試してみましょう。',
      research: '調べものの流れを伺い、AIに任せられる部分を洗い出します。',
      reply: 'よくある問い合わせを伺い、返信のたたき台をAIで作る流れを検討します。',
      unknown: '普段の業務を伺い、AIを使えそうな場面を一緒に洗い出します。',
    },
    undecided: 'まずはお話を伺い、3D VR・Web・AIのどれが合うかを一緒に整理します。',
  };

  const view = document.getElementById('diag-view');
  const bar = document.getElementById('diag-bar');
  const back = document.getElementById('diag-back');

  let answers = {};   // { 質問ID: { v, label } }
  let history = [];   // 答えた質問IDの順番

  const flow = () => FLOW[answers.service?.v] || FLOW.vr;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const enter = () => {
    view.classList.remove('is-enter');
    void view.offsetWidth;   // アニメーションをかけ直す
    view.classList.add('is-enter');
  };

  function renderQuestion (id) {
    const Q = QUESTIONS[id];
    const f = flow();
    const i = f.indexOf(id);

    view.replaceChildren();
    view.append(el('p', 'diag__step', `QUESTION ${i + 1} / ${f.length}`), el('h3', 'diag__q', Q.q));
    const opts = el('div', 'diag__opts');
    Q.opts.forEach((o, k) => {
      const b = el('button', 'opt');
      b.type = 'button';
      const body = el('span', null, o.label);
      if (o.sub) body.append(el('small', null, o.sub));
      b.append(el('span', 'opt__key', String(k + 1)), body);
      b.addEventListener('click', () => choose(id, o));
      opts.append(b);
    });
    view.append(opts);

    bar.style.width = `${(i / f.length) * 100}%`;
    back.hidden = history.length === 0;
    view.dataset.current = id;
    enter();
  }

  function choose (id, option) {
    answers[id] = { v: option.v, label: option.label };
    history.push(id);
    const f = flow();
    const next = f[f.indexOf(id) + 1];
    if (next) renderQuestion(next);
    else renderResult();
  }

  function buildMemo () {
    const lines = [`【ご相談の種類】${SERVICES[answers.service.v]}`];
    flow().slice(1).forEach(id => {
      if (answers[id]) lines.push(`【${QUESTIONS[id].label}】${answers[id].label}`);
    });
    lines.push('', '【ご相談内容（自由にお書きください）】', '');
    return lines.join('\n');
  }

  function firstStep () {
    const s = FIRST_STEP[answers.service.v];
    if (typeof s === 'string') return s;
    const key = answers[flow()[1]]?.v;
    return s[key] || Object.values(s)[0];
  }

  function formLink (memo) {
    if (!CONTACT.formUrl) return null;
    const url = new URL(CONTACT.formUrl);
    url.searchParams.set('usp', 'pp_url');
    if (CONTACT.entries.service) url.searchParams.set(CONTACT.entries.service, SERVICES[answers.service.v]);
    if (CONTACT.entries.memo) url.searchParams.set(CONTACT.entries.memo, memo);
    return url.toString();
  }

  async function copyText (text, textarea) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // クリップボードAPIが使えない環境（http 直開きなど）
      if (!textarea) return false;
      textarea.select();
      return document.execCommand('copy');
    }
  }

  function renderResult () {
    view.replaceChildren();
    view.append(el('p', 'diag__step', 'RESULT'), el('h3', 'diag__q', '相談メモができました'));

    const label = el('label', 'memo-label', '送る前に、自由に書き足せます');
    label.htmlFor = 'memo';
    const memo = el('textarea', 'memo');
    memo.id = 'memo';
    memo.value = buildMemo();

    const next = el('div', 'next');
    next.append(el('h4', null, 'FIRST STEP'), el('p', null, firstStep()));

    const actions = el('div', 'diag__actions');
    const toForm = el('a', 'btn btn--primary', 'この内容でフォームを開く');
    toForm.href = '#';
    toForm.target = '_blank';
    toForm.rel = 'noopener';
    const copy = el('button', 'btn btn--line', 'メモをコピー');
    copy.type = 'button';
    const retry = el('button', 'diag__back', 'もう一度診断する');
    retry.type = 'button';
    actions.append(toForm, copy, retry);

    const msg = el('p', 'diag__msg', '');
    const say = (text, tone) => { msg.textContent = text; msg.className = `diag__msg ${tone || ''}`; };

    toForm.addEventListener('click', async e => {
      const link = formLink(memo.value);
      if (link) { toForm.href = link; return; }
      e.preventDefault();
      const ok = await copyText(memo.value, memo);
      say(ok
        ? 'フォームのURLがまだ設定されていません（検証用）。メモはコピーしました。'
        : 'フォームのURLがまだ設定されていません（検証用）。メモを選択してコピーしてください。', 'is-warn');
    });
    copy.addEventListener('click', async () => {
      const ok = await copyText(memo.value, memo);
      say(ok ? 'コピーしました。' : 'コピーできませんでした。メモを選択してコピーしてください。', ok ? 'is-ok' : 'is-warn');
    });
    retry.addEventListener('click', () => start());

    view.append(label, memo, next, actions, msg);
    bar.style.width = '100%';
    back.hidden = false;
    view.dataset.current = 'result';
    enter();
  }

  function start (preset) {
    answers = {};
    history = [];
    if (preset && FLOW[preset]) {
      const o = QUESTIONS.service.opts.find(x => x.v === preset);
      answers.service = { v: o.v, label: o.label };
      history.push('service');
      renderQuestion(FLOW[preset][1]);
    } else {
      renderQuestion('service');
    }
  }

  back.addEventListener('click', () => {
    const prev = history.pop();
    if (!prev) return;
    if (view.dataset.current !== 'result') delete answers[view.dataset.current];
    delete answers[prev];
    renderQuestion(prev);
  });

  // 数字キーで選べる（診断パネルにフォーカスがあるとき）
  panel.addEventListener('keydown', e => {
    const n = Number(e.key);
    if (!n || e.target.tagName === 'TEXTAREA') return;
    const btn = view.querySelectorAll('.opt')[n - 1];
    if (btn) { e.preventDefault(); btn.click(); }
  });

  // サービスカードなどの「この内容で相談」から来たら、最初の質問を飛ばす
  document.querySelectorAll('[data-consult]').forEach(a => {
    a.addEventListener('click', () => start(a.dataset.consult));
  });

  // 診断を通さずにフォームへ
  const direct = document.getElementById('form-direct');
  const note = document.getElementById('form-note');
  if (direct) {
    if (CONTACT.formUrl) {
      direct.href = CONTACT.formUrl;
      direct.target = '_blank';
      direct.rel = 'noopener';
    } else {
      direct.addEventListener('click', e => {
        e.preventDefault();
        note.textContent = '※ フォームのURLがまだ設定されていません（検証用）。';
      });
    }
  }

  start();
})();
