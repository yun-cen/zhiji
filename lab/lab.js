'use strict';

const $ = (id) => document.getElementById(id);
const thread = $('thread');
const empty = $('empty');
const stage = $('stage');
const questionEl = $('question');
const composer = $('composer');
const sendButton = composer.querySelector('button[type=submit]');
const capsule = $('profile-capsule');
const panel = $('profile-panel');
const profileList = $('profile-list');
const profileDate = $('profile-date');
const profileHour = $('profile-hour');
const hourHint = $('hour-hint');
const profileError = $('profile-error');
const statusEl = $('talk-status');

const STORAGE_KEY = 'zhiji.profiles.v1';
const RECENT_KEY = 'zhiji.recent.v1';
const THINKING_LINES = [
  '星盘初定，墨痕未干。',
  '两盘对坐，灯下无言。',
  '一页星河，正待落笔。',
  '风过竹梢，字句自会来。',
  '纸上有局，笔下有路。',
  '把天机翻成人话，尚需片刻。'
];
const EXACT_HOURS = [
  [0, '早子时 · 00:00–00:59'],
  [1, '丑时 · 01:00–02:59'],
  [2, '寅时 · 03:00–04:59'],
  [3, '卯时 · 05:00–06:59'],
  [4, '辰时 · 07:00–08:59'],
  [5, '巳时 · 09:00–10:59'],
  [6, '午时 · 11:00–12:59'],
  [7, '未时 · 13:00–14:59'],
  [8, '申时 · 15:00–16:59'],
  [9, '酉时 · 17:00–18:59'],
  [10, '戌时 · 19:00–20:59'],
  [11, '亥时 · 21:00–22:59'],
  [12, '晚子时 · 23:00–23:59']
];
const layout = [
  ['巳', 'si'], ['午', 'wu'], ['未', 'wei'], ['申', 'shen'],
  ['辰', 'chen'], ['酉', 'you'], ['卯', 'mao'], ['戌', 'xu'],
  ['寅', 'yin'], ['丑', 'chou'], ['子', 'zi'], ['亥', 'hai']
];
const qimenOrder = [4, 9, 2, 3, 5, 7, 8, 1, 6];
const QUICK = [
  '下个月这个合作，我该先谈条件，还是先做个小样？',
  '这件事拖到现在，是该动，还是再等一个信号？',
  '这段关系里，我是该靠近，还是先停一停？'
];
const STAR_TRAITS = {
  紫微: '别人常觉得你要自己拿主意，不太爱被安排。',
  天机: '你习惯把事情在脑子里转很多遍，再决定动不动手。',
  太阳: '你更在意这件事有没有帮上别人，也在意做出来被谁看见。',
  武曲: '你做选择时，会先算能不能落地、划不划算。',
  天同: '你更想把日子过得顺，不太愿意硬扛一场冲突。',
  廉贞: '你对认定的人或事会很较真，情绪来得比别人快。',
  天府: '你习惯先把退路和家底安排好，再往前走。',
  太阴: '你很多判断放在心里，不喜欢当众把底牌摊开。',
  贪狼: '你容易被新鲜的人、手艺或场面吸住注意力。',
  巨门: '你在意一句话怎么说，也容易因为一句话反复想。',
  天相: '你常站在两边中间，把规矩和面子一起顾上。',
  天梁: '你习惯先看风险，也容易先听长辈或过来人的意见。',
  七杀: '你遇事更想先切开，拖久了会不耐烦。',
  破军: '你换过方向，推倒重来对你来说并不罕见。'
};

let store = loadStore();
let recent = loadRecent();
const historyByProfile = new Map();
const pluginState = {
  filesEnabled: false,
  calendarEnabled: false,
  workspace: null,
  files: [],
  attached: null,
  events: [],
  calendarPath: null
};
let thinkingTimer = null;
let busy = false;
let pendingQuestion = '';
let awaitingFixConsent = false;
let fixState = null;

function el(tag, cls, value) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (value != null) node.textContent = value;
  return node;
}
function setStatus(text) { statusEl.textContent = text; }

function loadStore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '');
    if (data && Array.isArray(data.profiles)) return data;
  } catch { /* 空档案 */ }
  return { activeId: null, profiles: [] };
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
function loadRecent() {
  try {
    const data = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(data) ? data.filter((item) => typeof item === 'string').slice(0, 8) : [];
  } catch { return []; }
}
function saveRecent() {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8))); } catch { /* 本地失败不挡问事 */ }
}
function addRecent(text) {
  const value = String(text || '').trim();
  if (!value) return;
  recent = [value, ...recent.filter((item) => item !== value)].slice(0, 8);
  saveRecent();
  renderRecent();
}
function renderRecent() {
  const list = $('recent-list');
  if (!list) return;
  list.replaceChildren();
  if (!recent.length) {
    list.append(el('div', 'recent-empty', '问过的具体事，会留在这里。'));
    return;
  }
  for (const text of recent) {
    const button = el('button', 'recent-item', text);
    button.type = 'button';
    button.title = text;
    button.addEventListener('click', () => {
      questionEl.value = text;
      questionEl.focus();
      questionEl.style.height = 'auto';
      questionEl.style.height = Math.min(questionEl.scrollHeight, 120) + 'px';
    });
    list.append(button);
  }
}
function paintTopbar() {
  const target = $('topbar-profile');
  if (!target) return;
  const profile = activeProfile();
  target.textContent = profile?.date
    ? profile.date + ' · ' + profileTimeText(profile) + ' · ' + (profile.gender || '女')
    : '先立一份档案';
}
function activeProfile() {
  return store.profiles.find((item) => item.id === store.activeId) || null;
}
function newProfile() {
  const profile = {
    id: Math.random().toString(36).slice(2, 10),
    date: '',
    timeMode: 'unknown',
    time: '',
    fuzzy: '',
    gender: '女'
  };
  store.profiles.push(profile);
  store.activeId = profile.id;
  persist();
  return profile;
}

function profileTimeText(profile) {
  if (!profile) return '';
  if (profile.timeMode === 'fuzzy') return bandById(profile.fuzzy)?.label || '模糊时段';
  if (profile.timeMode === 'exact' && profile.time !== '') return HOUR_LABEL[profile.time] || '时辰';
  return '时辰不详';
}
function capsuleText(profile) {
  if (!profile?.date) return '立命主档案 ▾';
  return profile.date + ' · ' + profileTimeText(profile) + ' · ' + (profile.gender || '女') + ' ▾';
}
function paintCapsule() {
  capsule.textContent = capsuleText(activeProfile());
  paintTopbar();
}
function hourValueOf(profile) {
  if (!profile || profile.timeMode === 'unknown') return 'unknown';
  if (profile.timeMode === 'fuzzy') return 'fuzzy:' + (profile.fuzzy || 'dawn');
  if (profile.time === '') return 'unknown';
  return 'exact:' + profile.time;
}
function applyHourValue(profile, value) {
  if (!value || value === 'unknown') {
    profile.timeMode = 'unknown';
    profile.time = '';
    profile.fuzzy = '';
    return;
  }
  if (value.startsWith('fuzzy:')) {
    profile.timeMode = 'fuzzy';
    profile.fuzzy = value.slice(6);
    profile.time = '';
    return;
  }
  profile.timeMode = 'exact';
  profile.time = value.slice(6);
  profile.fuzzy = '';
}
function paintHourHint(profile) {
  if (!profile?.date) {
    hourHint.hidden = true;
    return;
  }
  hourHint.hidden = false;
  if (profile.timeMode === 'unknown') {
    hourHint.textContent = '不排紫微命宫。这一问以奇门为主，之后可以用三问定盘收窄时辰。';
  } else if (profile.timeMode === 'fuzzy') {
    const band = bandById(profile.fuzzy);
    hourHint.textContent = (band ? band.range + '。' : '') + '会把时段内每个时辰都排一遍，只取共同趋势。';
  } else {
    hourHint.textContent = '按这个时辰排紫微命盘。';
  }
}
function renderProfileList() {
  profileList.replaceChildren();
  for (const profile of store.profiles) {
    const chip = el('button', 'profile-chip' + (profile.id === store.activeId ? ' is-active' : ''));
    chip.type = 'button';
    chip.textContent = profile.date ? (profile.date + ' · ' + profileTimeText(profile)) : '未写日期';
    chip.addEventListener('click', () => {
      store.activeId = profile.id;
      persist();
      fillForm();
      paintCapsule();
    });
    profileList.append(chip);
  }
}
function fillForm() {
  const profile = activeProfile();
  profileDate.value = profile?.date || '';
  profileHour.value = hourValueOf(profile);
  const gender = profile?.gender || '女';
  for (const input of document.querySelectorAll('input[name=pgender]')) input.checked = input.value === gender;
  paintHourHint(profile);
  renderProfileList();
  profileError.hidden = true;
}
function readFormIntoProfile() {
  let profile = activeProfile();
  if (!profile) profile = newProfile();
  profile.date = profileDate.value;
  profile.gender = document.querySelector('input[name=pgender]:checked')?.value || '女';
  applyHourValue(profile, profileHour.value);
  persist();
  paintCapsule();
  paintHourHint(profile);
  renderProfileList();
}

function fillHourSelect() {
  const unknown = el('option', '', '时辰不详（未知）');
  unknown.value = 'unknown';
  profileHour.append(unknown);
  const fuzzyGroup = document.createElement('optgroup');
  fuzzyGroup.label = '只记得大概';
  for (const band of FUZZY_BANDS) {
    const option = el('option', '', band.label);
    option.value = 'fuzzy:' + band.id;
    fuzzyGroup.append(option);
  }
  const exactGroup = document.createElement('optgroup');
  exactGroup.label = '确切时辰';
  for (const [index, label] of EXACT_HOURS) {
    const option = el('option', '', label);
    option.value = 'exact:' + index;
    exactGroup.append(option);
  }
  profileHour.append(fuzzyGroup, exactGroup);
}

function openPanel() {
  if (!activeProfile()) newProfile();
  fillForm();
  panel.hidden = false;
  capsule.setAttribute('aria-expanded', 'true');
}
function closePanel() {
  panel.hidden = true;
  capsule.setAttribute('aria-expanded', 'false');
}


function extractTags(text) {
  const value = String(text || '');
  const exam = [
    ['六级', /六级/], ['四级', /四级/], ['考研', /考研/], ['期末', /期末/],
    ['期中', /期中/], ['雅思', /雅思/], ['托福', /托福/], ['高考', /高考/], ['中考', /中考/]
  ].find(([, pattern]) => pattern.test(value));
  return exam ? { exam: exam[0] } : {};
}

function extractTimeline(text) {
  const value = String(text || '');
  const now = new Date();
  const day = now.getDay();
  const pad2 = (n) => String(n).padStart(2, '0');
  const dateText = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  if (/明天/.test(value)) {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    return { label: '明天', start: dateText(d), end: dateText(d) };
  }
  if (/后天/.test(value)) {
    const d = new Date(now); d.setDate(d.getDate() + 2);
    return { label: '后天', start: dateText(d), end: dateText(d) };
  }
  const week = value.match(/(下周|下星期)([一二三四五六日天])?/);
  if (week) {
    const mondayOffset = day === 0 ? 1 : 8 - day;
    const monday = new Date(now); monday.setDate(monday.getDate() + mondayOffset);
    const names = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };
    if (week[2]) {
      const target = new Date(monday); target.setDate(monday.getDate() + names[week[2]]);
      return { label: '下' + week[2] + '（' + dateText(target) + '）', start: dateText(target), end: dateText(target) };
    }
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { label: '下周', start: dateText(monday), end: dateText(sunday) };
  }
  if (/这周|本周/.test(value)) {
    const monday = new Date(now); monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { label: '这周', start: dateText(monday), end: dateText(sunday) };
  }
  if (/下个月|下月/.test(value)) {
    const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    return { label: '下个月', start: dateText(start), end: dateText(end) };
  }
  if (/这个月|本月/.test(value)) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { label: '这个月', start: dateText(start), end: dateText(end) };
  }
  return null;
}
function wantsFixHour(text) {
  const value = text.trim();
  if (/三问|定盘|反推/.test(value)) return true;
  return /^(好|好的|可以|行|愿意|要|嗯|试试|开始吧?|来吧)[啊呀吧了。.!！]?$/.test(value);
}

function renderZiwei(cast, grid, note) {
  const { chart, horoscope, focus } = cast;
  grid.replaceChildren();
  const focusNames = new Set(focus.map((palace) => palace.name));
  for (const [branch, area] of layout) {
    const palace = palaceByBranch(chart, branch);
    const cell = el('div', 'zw-palace branch-' + area + (focusNames.has(palace.name) ? ' is-focus' : ''));
    const top = el('div', 'zw-name');
    const name = el('span', '', palace.name);
    if (palace.isBodyPalace) name.append(el('span', 'zw-body-label', ' 身'));
    top.append(name);
    cell.append(top);
    const stars = el('div', 'zw-stars');
    if (palace.majorStars.length) {
      for (const star of palace.majorStars) {
        const item = el('span', '', star.name);
        if (star.mutagen) item.append(el('span', 'mutagen', star.mutagen));
        stars.append(item);
      }
    } else stars.append(el('span', '', '无主星'));
    cell.append(stars);
    if (palace.minorStars.length) cell.append(el('div', 'zw-minor', palace.minorStars.slice(0, 3).map((star) => star.name).join(' · ')));
    const foot = el('div', 'zw-foot');
    foot.append(el('span', '', palace.heavenlyStem + branch), el('span', '', palace.decadal.range.join('–')));
    cell.append(foot);
    grid.append(cell);
  }
  const center = el('div', 'zw-center');
  const decadal = chart.palaces.find((palace) => palace.index === horoscope.decadal.index);
  center.append(
    el('div', 'scope', '本命'),
    el('h3', '', chart.fiveElementsClass),
    el('p', '', chart.gender + '命 · ' + chart.time),
    el('p', '', '命主 ' + chart.soul + '　身主 ' + chart.body),
    el('p', '', '当前大限：' + (decadal ? decadal.name : '—'))
  );
  grid.append(center);
  note.textContent = '高亮是这一问会看的宫。' + (decadal ? '当前大限在' + decadal.name + '。' : '') + chart.fiveElementsClass + '。';
}
function renderQimen(cast, grid, note) {
  const { qimen, target } = cast;
  grid.replaceChildren();
  for (const position of qimenOrder) {
    const palace = qimen.palaces.find((item) => item.position === position);
    const cell = el('div', 'qm-palace' + (target && palace && palace.position === target.position ? ' is-focus' : ''));
    if (!palace) { grid.append(cell); continue; }
    const top = el('div', 'qm-top');
    top.append(el('span', '', palace.trigram + ' ' + palace.position), el('span', '', palace.isZhiFu ? '值符' : palace.isZhiShi ? '值使' : ''));
    cell.append(top, el('div', 'qm-gate', palace.gate), el('div', 'qm-star', (Array.isArray(palace.star) ? palace.star : [palace.star]).join(' · ')), el('div', 'qm-deity', palace.deity));
    const stems = el('div', 'qm-stems');
    const heaven = Array.isArray(palace.heavenlyStem) ? palace.heavenlyStem.join('') : palace.heavenlyStem;
    const earth = Array.isArray(palace.earthlyStem) ? palace.earthlyStem.join('') : palace.earthlyStem;
    stems.append(el('div', '', '天 ' + heaven + ' · 地 ' + earth));
    const patterns = [...(palace.auspiciousPatterns || []), ...(palace.inauspiciousPatterns || [])].slice(0, 2).map((pattern) => pattern.name || pattern.type).filter(Boolean);
    if (patterns.length) stems.append(el('div', 'qm-patterns', patterns.join(' · ')));
    cell.append(stems);
    grid.append(cell);
  }
  note.textContent = qimen.timeInfo.solarDate + ' ' + qimen.timeInfo.timeName + ' · ' + qimen.ju.type + qimen.ju.number + '局。值符 ' + qimen.zhiFu.star + '，值使 ' + qimen.zhiShi.gate + '。';
}
function renderVariants(ziweiFacts, host) {
  const list = el('ul', 'variant-list');
  for (const item of ziweiFacts.variants) {
    const majors = item.mingMajor.map((star) => star.name).join('、') || '无主星';
    list.append(el('li', '', item.timeName + ' · 命宫在' + item.mingBranch + ' · ' + majors));
  }
  host.append(list);
  const shared = ziweiFacts.commonMingStars || [];
  host.append(el('p', 'panel-note', shared.length
    ? '这些时辰的命宫都有：' + shared.join('、') + '。回复只取共同趋势。'
    : '这个时段里，命宫主星并不相同。回复只说共同趋势，对不上的不并成一句。'));
}
function buildOrigin(pack) {
  const box = el('div', 'origin');
  box.hidden = true;
  const grids = el('div', 'origin-grids');
  const zw = el('section', 'origin-board');
  zw.append(el('h3', '', pack.timeMode === 'fuzzy' ? '紫微 · 时段内各时辰' : '命盘 · 紫微'));
  const zwBody = el('div');
  zw.append(zwBody);
  const qm = el('section', 'origin-board');
  qm.append(el('h3', '', '事盘 · 奇门'));
  const qmGrid = el('div', 'qimen-grid');
  const qmNote = el('p', 'panel-note');
  qm.append(qmGrid, qmNote);
  grids.append(zw, qm);
  box.append(grids);
  if (pack.timeMode === 'exact' && pack.ziwei) {
    const grid = el('div', 'ziwei-grid');
    const note = el('p', 'panel-note');
    zwBody.append(grid, note);
    renderZiwei(pack.ziwei, grid, note);
  } else if (pack.timeMode === 'fuzzy') {
    renderVariants(pack.facts.ziwei, zwBody);
  } else {
    const ziwei = pack.facts.ziwei;
    zwBody.append(el('p', 'panel-note', '时辰不详，没有排紫微命宫。公历 ' + ziwei.solarDate + ' · ' + ziwei.gender + '。'));
  }
  renderQimen(pack.qimen, qmGrid, qmNote);
  return box;
}

function normalizeCouncil(text) {
  return String(text || '')
    .replace(/([\u4e00-\u9fa5A-Za-z]+)\s+deity\b/gi, '$1（八神）')
    .replace(/\bdeity\b/gi, '八神')
    .replace(/\bstar\b/gi, '星')
    .replace(/\bgate\b/gi, '门');
}

function openEvidence(id) {
  const item = document.getElementById('ev-' + id);
  if (!item) return;
  const panel = item.closest('details');
  if (panel) panel.open = true;
  item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  item.classList.add('is-flash');
  setTimeout(() => item.classList.remove('is-flash'), 1200);
}
function appendInline(host, text, evidence) {
  const byId = evidence?.byId;
  const pattern = /\[(E\d+)\]/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) host.append(document.createTextNode(text.slice(last, match.index)));
    const item = byId?.get(match[1]);
    if (item) {
      const ref = el('button', 'evidence-ref', match[1].replace('E', ''));
      ref.type = 'button';
      ref.title = '查看依据：' + item.label;
      ref.setAttribute('aria-label', '依据 ' + match[1] + '：' + item.label);
      ref.addEventListener('click', () => openEvidence(match[1]));
      host.append(ref);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) host.append(document.createTextNode(text.slice(last)));
}
function stabilityLabel(stability) {
  if (stability === 'common') return '多时辰一致';
  if (stability === 'varies') return '随时辰改变';
  if (stability === 'withheld') return '未排';
  return '已取';
}
function buildEvidencePanel(evidence) {
  const details = el('details', 'evidence-panel');
  const summary = el('summary', 'evidence-summary');
  summary.append(el('span', 'evidence-title', '盘面依据'), el('span', 'evidence-count', evidence.items.length + ' 条'));
  details.append(summary);
  details.append(el('p', 'evidence-note', '只列这一问用到的盘面，不是全盘。点正文里的数字，可以回看对应的一条。'));
  for (const [system, title] of [['ziwei', '紫微 · 看人'], ['qimen', '奇门 · 看时']]) {
    const group = evidence.items.filter((item) => item.system === system);
    if (!group.length) continue;
    const section = el('section', 'evidence-group');
    section.append(el('h4', '', title));
    const list = el('ul', 'evidence-list');
    for (const item of group) {
      const li = el('li', 'evidence-item');
      li.id = 'ev-' + item.id;
      const head = el('div', 'evidence-head');
      head.append(
        el('span', 'evidence-id', item.id),
        el('span', 'evidence-label', item.label),
        el('span', 'evidence-badge is-' + item.stability, stabilityLabel(item.stability))
      );
      li.append(head, el('p', 'evidence-fact', item.fact));
      list.append(li);
    }
    section.append(list);
    details.append(section);
  }
  return details;
}


function plainEvidenceLabel(item) {
  const label = String(item?.label || '');
  const rules = [
    [/命宫/, '你本身'],
    [/夫妻/, '关系位置'],
    [/官禄/, '事业位置'],
    [/迁移/, '外部环境'],
    [/财帛/, '钱与资源'],
    [/福德/, '内心状态'],
    [/田宅/, '家与落脚'],
    [/子女/, '亲密与创造'],
    [/兄弟/, '同辈与伙伴'],
    [/父母/, '长辈与规则'],
    [/仆役/, '团队与合作'],
    [/疾厄/, '身心状态'],
    [/当前大限/, '这十年的底色'],
    [/流年/, '今年的底色'],
    [/候选时辰共同命宫/, '多时辰一致的部分'],
    [/各候选时辰/, '随时辰变化的部分'],
    [/时辰不详/, '时辰不详的边界'],
    [/值符/, '主导力量'],
    [/值使/, '执行口'],
    [/局/, '起局'],
    [/开门|休门|生门|伤门|杜门|景门|死门|惊门/, '当下的机会与阻力']
  ];
  for (const [pattern, text] of rules) if (pattern.test(label)) return text;
  return String(label).replace(/^(紫微|奇门) · /, '');
}
function buildEvidenceChips(ids, evidence) {
  if (!Array.isArray(ids) || !ids.length || !evidence) return null;
  const row = el('div', 'section-evidence');
  row.append(el('span', 'evidence-lead', '依据'));
  let count = 0;
  for (const id of ids) {
    const item = evidence.byId?.get(id);
    if (!item) continue;
    const chip = el('button', 'evidence-chip');
    chip.type = 'button';
    chip.title = item.fact;
    chip.setAttribute('aria-label', '依据 ' + id + '：' + item.label);
    chip.append(el('span', 'evidence-chip-id', id), el('span', 'evidence-chip-label', plainEvidenceLabel(item)));
    chip.addEventListener('click', () => openEvidence(id));
    row.append(chip);
    count += 1;
  }
  return count ? row : null;
}
function renderStructured(host, sections, evidence) {
  host.replaceChildren();
  for (const section of sections) {
    const title = String(section.title || '');
    const text = String(section.text || '').trim();
    const items = Array.isArray(section.items) ? section.items.filter(Boolean) : [];
    const options = Array.isArray(section.options) ? section.options.filter(Boolean) : [];
    if (!text && !items.length && !options.length) continue;
    const isReality = /先确认一件事|确认一件事/.test(title);
    const block = el('section', 'answer-section' + (isReality ? ' is-reality' : ''));
    const heading = el('h3', isReality ? 'reality-heading' : '');
    heading.textContent = title;
    block.append(heading);
    if (text) {
      const paras = text.split(/\n+/).map((part) => part.trim()).filter(Boolean);
      for (const para of paras) {
        const p = el('p', [
          title.includes('一句话') ? 'lead-line' : '',
          isReality ? 'reality-line' : ''
        ].filter(Boolean).join(' '));
        appendInline(p, para, evidence);
        block.append(p);
      }
    }
    if (items.length) {
      const list = el('ul', isReality ? 'reality-list' : '');
      for (const item of items) {
        const li = el('li');
        appendInline(li, String(item), evidence);
        list.append(li);
      }
      block.append(list);
    }
    const chips = buildEvidenceChips(section.evidence, evidence);
    if (chips) block.append(chips);
    if (options.length) {
      const row = el('div', 'section-options');
      for (const option of options) {
        const button = el('button', 'choice', String(option));
        button.type = 'button';
        button.addEventListener('click', () => {
          row.querySelectorAll('button').forEach((item) => { item.disabled = true; });
          submitQuestion(String(option));
        });
        row.append(button);
      }
      block.append(row);
    }
    host.append(block);
  }
  if (!host.children.length) host.append(el('p', '', '会诊没有返回内容。'));
}

function renderMarkdown(host, text, evidence = null) {
  host.replaceChildren();
  const lines = normalizeCouncil(text).split(/\r?\n/);
  let list = null;
  let first = true;
  let section = '';
  const reality = () => /先确认一件事|确认一件事|先确认/.test(section);
  const flushList = () => { if (list) { host.append(list); list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }
    if (line.startsWith('###') || line.startsWith('##')) {
      flushList();
      section = line.replace(/^#+\s*/, '').replace(/\*\*/g, '');
      const heading = el('h3', reality() ? 'reality-heading' : '');
      appendInline(heading, section, evidence);
      host.append(heading);
      first = false;
      continue;
    }
    const bullet = /^[-*]\s+/.test(line) || /^\d+[.、]\s+/.test(line) || section.includes('你可以怎么做');
    if (bullet) {
      if (!list) { list = el('ul', reality() ? 'reality-list' : ''); }
      const item = el('li');
      appendInline(item, line.replace(/^([-*]|\d+[.、])\s+/, '').replace(/\*\*/g, ''), evidence);
      list.append(item);
      first = false;
      continue;
    }
    flushList();
    const p = el('p', [first ? 'lead-line' : '', reality() ? 'reality-line' : ''].filter(Boolean).join(' '));
    appendInline(p, line.replace(/\*\*/g, ''), evidence);
    host.append(p);
    first = false;
  }
  flushList();
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function streamMarkdown(host, text, evidence = null) {
  const lines = String(text || '').split(/\n/);
  let acc = '';
  for (let i = 0; i < lines.length; i += 1) {
    acc += (i ? '\n' : '') + lines[i];
    renderMarkdown(host, acc, evidence);
    await wait(24);
  }
  if (!host.children.length) host.append(el('p', '', '会诊没有返回内容。'));
}


function stopThinking() {
  if (thinkingTimer) {
    clearInterval(thinkingTimer);
    thinkingTimer = null;
  }
}
function startThinking(host) {
  stopThinking();
  let index = 0;
  const paint = () => {
    if (!host.isConnected) { stopThinking(); return; }
    host.replaceChildren();
    const line = el('p', 'thinking-line', THINKING_LINES[index % THINKING_LINES.length]);
    host.append(line);
    index += 1;
  };
  paint();
  thinkingTimer = setInterval(paint, 2600);
  return thinkingTimer;
}


function daysUntil(dateText) {
  const date = new Date(String(dateText).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date(dateOnly() + 'T00:00:00');
  return Math.round((date - today) / 86400000);
}
function eventWhen(event) {
  const start = String(event.start || '');
  const day = start.slice(5, 10).replace('-', '.');
  const time = start.includes(' ') ? ' ' + start.slice(11, 16) : ' 全天';
  return day + time;
}
function upcomingEvents(days = 60) {
  const today = dateOnly();
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  const limitText = dateOnly(limit);
  return pluginState.events
    .filter((event) => event.start && String(event.start).slice(0, 10) >= today && String(event.start).slice(0, 10) <= limitText)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}
function renderCalendarSide() {
  const host = $('calendar-side');
  const list = $('calendar-side-list');
  if (!host || !list) return;
  const events = pluginState.calendarEnabled ? upcomingEvents(60).slice(0, 3) : [];
  host.hidden = !events.length;
  list.replaceChildren();
  for (const event of events) {
    const button = el('button', 'calendar-side-item');
    button.type = 'button';
    button.append(el('span', 'calendar-side-date', eventWhen(event)), document.createTextNode(event.summary || '未命名'));
    button.addEventListener('click', () => {
      questionEl.value = '我最近有一个日程：' + (event.summary || '') + '（' + eventWhen(event) + '）。这件事对我现在的选择有什么影响？';
      questionEl.focus();
    });
    list.append(button);
  }
}
function renderNearEvents() {
  const host = $('near-events');
  if (!host) return;
  const events = pluginState.calendarEnabled ? upcomingEvents(45).slice(0, 2) : [];
  host.hidden = !events.length;
  host.replaceChildren();
  if (!events.length) return;
  host.append(document.createTextNode('近事 · '));
  events.forEach((event, index) => {
    if (index) host.append(document.createTextNode('　'));
    const left = daysUntil(event.start);
    const when = left === 0 ? '今天' : left === 1 ? '明天' : left > 0 ? left + ' 天后' : '已过';
    host.append(el('strong', '', eventWhen(event) + ' ' + (event.summary || '')), document.createTextNode('（' + when + '）'));
  });
}
function renderFileList() {
  const host = $('file-list');
  const status = $('workspace-status');
  if (!host) return;
  host.replaceChildren();
  if (!pluginState.workspace) {
    if (status) status.textContent = '未选择文件夹';
    return;
  }
  if (status) status.textContent = pluginState.workspace.split('/').pop() + ' · ' + pluginState.files.length + ' 份可读文件';
  for (const file of pluginState.files) {
    const button = el('button', 'plugin-file', file.name + '  ' + Math.ceil(file.size / 1024) + 'KB');
    button.type = 'button';
    if (pluginState.attached?.name === file.name) button.classList.add('is-active');
    button.addEventListener('click', () => attachWorkspaceFile(file.name));
    host.append(button);
  }
  if (!pluginState.files.length) host.append(el('p', 'plugin-note', '这个文件夹里没有 md / txt / json / csv 可读文件。'));
}
async function attachWorkspaceFile(name) {
  if (!window.zhiji?.readWorkspaceFile) return;
  try {
    const file = await window.zhiji.readWorkspaceFile(name);
    pluginState.attached = { name: file.name, text: file.text };
    pluginState.filesEnabled = true;
    $('files-enabled').checked = true;
    renderFileList();
    renderContextChips();
  } catch (error) {
    $('workspace-status').textContent = '读取失败：' + (error?.message || error);
  }
}
function renderCalendarList() {
  const host = $('calendar-list');
  const status = $('calendar-status');
  if (!host) return;
  host.replaceChildren();
  const events = pluginState.events || [];
  if (status) status.textContent = pluginState.calendarPath
    ? pluginState.calendarPath.split('/').pop() + ' · ' + events.length + ' 个事件'
    : '未导入日历';
  for (const event of events.slice(0, 24)) {
    const row = el('div', 'plugin-event');
    row.append(el('span', 'calendar-side-date', eventWhen(event)), document.createTextNode(event.summary || '未命名'));
    host.append(row);
  }
}
function renderContextChips() {
  const host = $('context-chips');
  if (!host) return;
  host.replaceChildren();
  let count = 0;
  if (pluginState.filesEnabled && pluginState.attached) {
    const chip = el('span', 'context-chip', '本地 · ' + pluginState.attached.name);
    const remove = el('button', '', '×');
    remove.type = 'button';
    remove.title = '移除这份资料';
    remove.addEventListener('click', () => {
      pluginState.attached = null;
      renderFileList();
      renderContextChips();
    });
    chip.append(remove);
    host.append(chip);
    count += 1;
  }
  if (pluginState.calendarEnabled && upcomingEvents(60).length) {
    const chip = el('span', 'context-chip', '日历 · ' + upcomingEvents(60).length + ' 个近事');
    const remove = el('button', '', '×');
    remove.type = 'button';
    remove.title = '暂时不用日历';
    remove.addEventListener('click', () => {
      pluginState.calendarEnabled = false;
      $('calendar-enabled').checked = false;
      renderCalendarSide();
      renderNearEvents();
      renderContextChips();
    });
    chip.append(remove);
    host.append(chip);
    count += 1;
  }
  host.hidden = !count;
  renderCalendarSide();
  renderNearEvents();
}
function collectContext() {
  const context = {};
  if (pluginState.filesEnabled && pluginState.attached) {
    context.file = { name: pluginState.attached.name, excerpt: String(pluginState.attached.text || '').slice(0, 4000) };
  }
  if (pluginState.calendarEnabled) {
    const events = upcomingEvents(60).slice(0, 8).map((event) => ({ date: event.start, summary: event.summary, location: event.location || '' }));
    if (events.length) context.calendar = events;
  }
  return context;
}
function openPlugins(focusId) {
  const dialog = $('plugins-dialog');
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
  if (focusId) setTimeout(() => $(focusId)?.scrollIntoView({ block: 'center' }), 50);
}

function setTalking(on) {
  empty.hidden = on;
  thread.hidden = !on;
  stage.classList.toggle('is-talking', on);
}
function tail() {
  thread.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
}
function freezeChoices() {
  thread.querySelectorAll('.choice').forEach((button) => { button.disabled = true; });
}
function appendUser(text) {
  setTalking(true);
  thread.append(el('p', 'bubble bubble-user', text));
  tail();
}
function appendAssistant({ text, choices, pack, stream, offerFix, sections }) {
  setTalking(true);
  freezeChoices();
  const card = el('article', 'bubble bubble-agent' + (pack ? ' has-origin' : ''));
  const body = el('div', 'bubble-body');
  card.append(body);
  if (pack) {
    const origin = buildOrigin(pack);
    const toggle = el('button', 'origin-toggle', '展开双盘原局');
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      origin.hidden = !origin.hidden;
      toggle.textContent = origin.hidden ? '展开双盘原局' : '收起双盘原局';
      if (!origin.hidden) origin.scrollIntoView({ block: 'nearest' });
    });
    card.append(toggle, origin);
  }
  thread.append(card);
  const done = sections?.length
    ? Promise.resolve(renderStructured(body, sections, pack?.evidence))
    : stream
      ? streamMarkdown(body, text, pack?.evidence)
      : Promise.resolve(renderMarkdown(body, text, pack?.evidence));
  return done.then(() => {
    if (pack?.evidence?.items?.length) {
      const panel = buildEvidencePanel(pack.evidence);
      card.insertBefore(panel, card.querySelector('.origin-toggle'));
    }
    if (choices?.length) {
      const row = el('div', 'choices');
      row.setAttribute('role', 'group');
      for (const choice of choices) {
        const button = el('button', 'choice', choice.label);
        button.type = 'button';
        button.addEventListener('click', () => {
          row.querySelectorAll('button').forEach((item) => { item.disabled = true; });
          choice.run();
        });
        row.append(button);
      }
      card.append(row);
    }
    if (offerFix) {
      const row = el('div', 'choices');
      const button = el('button', 'choice', '开始三问定盘');
      button.type = 'button';
      button.addEventListener('click', () => {
        button.disabled = true;
        awaitingFixConsent = false;
        startFixHour();
      });
      row.append(button);
      card.append(row);
    }
    tail();
  });
}

function systemPrompt(timeMode) {
  const lines = [
    '你是「知几」，一个把紫微斗数（长期结构）与奇门遁甲（当下时空）放在同一张桌上的决策会诊助手。',
    '最高原则：默认输出“人话版”。用户不需要懂命理术语，也能看懂并拿去用。',
    '硬性规则：',
    '1. 只能使用提供的结构化盘面 facts；不得新增不存在的星曜、宫位、四化、门、星、神、局数、格局。',
    '2. 默认回答里不要出现星曜名、宫位名、八门/九星/八神名、四化、局数。把这些留给“展开原理”。',
    '3. 如果某个术语无法避免，先用一句人话解释，再在括号里写术语。',
    '4. 不要使用“科学证明”“准确率”“命中率”“一定”“必然”。不要预测具体事件，不做医疗、法律、投资、生死断言。',
    '5. 输出 3-5 段 Markdown，标题用 ##，标题要贴着这一问自己写；不要机械使用“一句话/为什么这么说/你可以怎么做”。',
    '至少包含：一个直接判断、一个长期或当下的关键变量、一个具体动作、一段“什么会改变这个判断/还缺什么”。',
    '只有在缺一个会改变结论的现实事实时，才在最后问一个问题；不要为了完整而追问。',
    '6. 语气像坐在对面说话：短句、具体、少形容词。',
    '7. 如果 facts 不足以支持判断，直接说这层信息不足，不要编。',
    '8. ' + readingGuide(timeMode),
    '9. 在关键判断句后用 [E1] 形式标注依据；只能引用 evidence 中出现的 ID，每条判断最多两个，不要每句都标。',
    '10. 全文最后加 “## 先确认一件事”，只问一个会改变现实选择的问题，并给 2-3 个可选答案；这一段不要替用户下判断。',
    '11. evidence 的 stability 是 common 时说明“多时辰一致”；是 varies 时说明“会随时辰改变”；是 withheld 时说明“这层不能看”。'
  ];
  return lines.join('\n');
}

function compactFacts(pack) {
  const f = pack.facts || {};
  const z = f.ziwei || {};
  const q = f.qimen || {};
  const ziwei = pack.timeMode === 'fuzzy'
    ? {
        system: z.system, solarDate: z.solarDate, gender: z.gender,
        fuzzy: z.fuzzy, variants: z.variants || [],
        commonMingStars: z.commonMingStars || [], mingStarsAgree: z.mingStarsAgree
      }
    : pack.timeMode === 'unknown'
      ? { system: z.system, solarDate: z.solarDate, gender: z.gender, withheld: z.withheld || [], note: z.note }
      : {
          system: z.system, solarDate: z.solarDate, lunar: z.lunar, time: z.time,
          timeIndex: z.timeIndex, gender: z.gender, fiveElementsClass: z.fiveElementsClass,
          soul: z.soul, body: z.body, nominalAge: z.nominalAge,
          currentDecadal: z.currentDecadal, currentYearly: z.currentYearly,
          literary: z.literary || [], palaces: z.palaces || []
        };
  const qimen = {
    system: q.system, castAt: q.castAt, timeInfo: q.timeInfo, ju: q.ju, yuan: q.yuan,
    zhiFu: q.zhiFu, zhiShi: q.zhiShi, target: q.target
  };
  return { readingGuide: f.readingGuide, timeMode: f.timeMode, timeUnknown: f.timeUnknown, domain: f.domain, ziwei, qimen };
}

function buildMessages(questionText, pack, history = [], context = {}, timeline = null) {
  const user = [
    '问题：' + questionText,
    '领域：' + domainMeta[pack.domain].label,
    '时辰状态：' + pack.timeMode,
    '',
    '结构化盘面 facts（只可使用这些）：',
    JSON.stringify(compactFacts(pack)),
    '',
    '可引用依据（正文只能用这些 ID）：',
    JSON.stringify(pack.evidence?.items || []),
    '',
    '本地上下文（只作辅助，不是盘面 facts）：',
    JSON.stringify(context),
    '',
    '问题指向的时间窗口：',
    JSON.stringify(timeline || null),
    '',
    '问题标签：',
    JSON.stringify(pack.tags || {})
  ].join('\n');
  return [
    { role: 'system', content: systemPrompt(pack.timeMode) },
    ...history.slice(-6),
    { role: 'user', content: user }
  ];
}
async function askCouncil(questionText, pack, history = [], context = {}, timeline = null, tags = {}) {
  const payload = {
    question: questionText,
    domain: pack.domain,
    timeMode: pack.timeMode,
    timeUnknown: pack.timeUnknown,
    history: history.slice(-6),
    context,
    timeline,
    tags,
    evidence: pack.evidence?.items || [],
    facts: compactFacts(pack)
  };
  if (window.zhiji?.consult) {
    const result = await window.zhiji.consult(payload);
    return { content: result.content || '', sections: result.sections || null };
  }
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: buildMessages(questionText, pack, history, context, timeline) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '会诊服务返回 ' + response.status);
  return { content: data.content || '', sections: data.sections || null };
}

function mingSignature(chart) {
  const ming = palaceByName(chart, '命宫');
  const majors = ming.majorStars.map((star) => star.name);
  if (majors.length) return { stars: majors, borrowed: false };
  const opposite = palaceByName(chart, '迁移');
  return { stars: (opposite?.majorStars || []).map((star) => star.name), borrowed: true };
}
function clusterHours(profile, indexes) {
  const map = new Map();
  for (const index of indexes) {
    const chart = castChart(profile, index);
    const sig = mingSignature(chart);
    const key = (sig.borrowed ? '借:' : '') + (sig.stars.join('·') || '空');
    if (!map.has(key)) map.set(key, { id: key, stars: sig.stars, borrowed: sig.borrowed, hours: [] });
    map.get(key).hours.push({ index, name: HOUR_LABEL[index] || chart.time });
  }
  return [...map.values()];
}
function contenders(state) {
  const max = Math.max(...state.clusters.map((cluster) => state.scores[cluster.id]));
  const top = state.clusters.filter((cluster) => state.scores[cluster.id] === max);
  return top.length >= 2 ? top : state.clusters;
}
function nextStar(state) {
  const pool = contenders(state);
  const stars = [];
  for (const cluster of pool) {
    for (const star of cluster.stars) {
      if (STAR_TRAITS[star] && !stars.includes(star) && !state.usedStars.includes(star)) stars.push(star);
    }
  }
  let best = null;
  let bestBalance = Infinity;
  for (const star of stars) {
    const yes = pool.filter((cluster) => cluster.stars.includes(star)).length;
    if (yes === 0 || yes === pool.length) continue;
    const balance = Math.abs(yes - pool.length / 2);
    if (balance < bestBalance) { bestBalance = balance; best = star; }
  }
  return best;
}
function rankedClusters() {
  return [...fixState.clusters].sort((a, b) => fixState.scores[b.id] - fixState.scores[a.id] || a.hours[0].index - b.hours[0].index);
}
function applyStarAnswer(star, like) {
  if (!fixState) return;
  for (const cluster of fixState.clusters) {
    const has = cluster.stars.includes(star);
    if (like === true && has || like === false && !has) fixState.scores[cluster.id] += 1;
  }
  fixState.usedStars.push(star);
  fixState.step += 1;
}
function pickHour(hours) {
  const sorted = [...hours].sort((a, b) => a.index - b.index);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}
function askFix() {
  const star = nextStar(fixState);
  if (!star) { finishFix(); return; }
  const n = fixState.step + 1;
  const intro = n === 1
    ? '出生时辰不详，我不会随便安一个命宫。下面用这一天里、不同时辰才会分开的长期脾气，对一对你的经历。\n\n'
    : '';
  appendAssistant({
    text: intro + '第 ' + n + ' 问。这句像不像你一直以来的样子？\n' + STAR_TRAITS[star],
    choices: [
      { label: '比较像', run: () => { applyStarAnswer(star, true); proceedFix(); } },
      { label: '不太像', run: () => { applyStarAnswer(star, false); proceedFix(); } },
      { label: '说不好', run: () => { applyStarAnswer(star, null); proceedFix(); } }
    ]
  });
}
function proceedFix() {
  if (!fixState) return;
  const ranked = rankedClusters();
  const margin = ranked.length < 2 ? 99 : fixState.scores[ranked[0].id] - fixState.scores[ranked[1].id];
  if (fixState.step >= 3 || !nextStar(fixState) || (fixState.step >= 2 && margin >= 1)) finishFix();
  else askFix();
}
function finishFix() {
  const profile = activeProfile();
  const ranked = rankedClusters();
  const top = ranked[0];
  const tied = ranked[1] && fixState.scores[top.id] === fixState.scores[ranked[1].id];
  if (!profile || !top || tied) {
    fixState = null;
    appendAssistant({ text: '这几问答完，还对不上单独的一档。档案里的时辰我没有改。你可以改选一个模糊时段，或想起钟点后再写。' });
    return;
  }
  const hour = pickHour(top.hours);
  profile.timeMode = 'exact';
  profile.time = String(hour.index);
  profile.fuzzy = '';
  persist();
  paintCapsule();
  fillForm();
  const sameStar = top.hours.length > 1
    ? '这一档里有' + top.hours.map((item) => item.name).join('、') + '，命宫主星相同，我先记下' + hour.name + '。其他宫位仍可能不同，想起更具体的钟点可以再改。'
    : '我先把档案收在' + hour.name + '。这是和你刚选的经历最接近的一档，不是鉴定。';
  const choices = pendingQuestion
    ? [{ label: '按这个时辰，重看刚才的问题', run: () => submitQuestion(pendingQuestion) }]
    : null;
  fixState = null;
  appendAssistant({ text: sameStar, choices });
}
function startFixHour() {
  const profile = activeProfile();
  if (!profile?.date) { openPanel(); return; }
  if (typeof iztro === 'undefined') {
    appendAssistant({ text: '排盘库没有载入，三问定盘暂时做不了。' });
    return;
  }
  const indexes = profile.timeMode === 'fuzzy' && bandById(profile.fuzzy)
    ? bandById(profile.fuzzy).hours
    : EXACT_HOURS.map(([index]) => index);
  let clusters = [];
  try { clusters = clusterHours(profile, indexes); }
  catch (error) {
    appendAssistant({ text: '这一天的时辰盘没有排开：' + (error?.message || '未知错误') });
    return;
  }
  const usable = clusters.filter((cluster) => cluster.stars.some((star) => STAR_TRAITS[star]));
  if (usable.length < 2) {
    appendAssistant({ text: '这一天里，各个时辰的命宫主星几乎分不开，三问帮不上忙。可以先在档案里选一个模糊时段。' });
    return;
  }
  fixState = {
    clusters: usable,
    scores: Object.fromEntries(usable.map((cluster) => [cluster.id, 0])),
    usedStars: [],
    step: 0
  };
  if (!nextStar(fixState)) {
    fixState = null;
    appendAssistant({ text: '这一天里，各个时辰的命宫主星几乎分不开，三问帮不上忙。可以先在档案里选一个模糊时段。' });
    return;
  }
  askFix();
}

function showProfileError(text) {
  profileError.textContent = text;
  profileError.hidden = false;
  openPanel();
}
async function submitQuestion(text) {
  const value = text.trim();
  if (!value || busy) return;
  if (awaitingFixConsent && wantsFixHour(value)) {
    awaitingFixConsent = false;
    appendUser(value);
    questionEl.value = '';
    startFixHour();
    return;
  }
  awaitingFixConsent = false;
  fixState = null;
  const profile = activeProfile();
  if (!profile?.date) {
    questionEl.value = value;
    showProfileError('先写下出生日期。时辰可以选不详。');
    return;
  }
  if (profile.timeMode === 'fuzzy' && !bandById(profile.fuzzy)) {
    showProfileError('这个模糊时段无法识别，请重选。');
    return;
  }
  if (profile.timeMode === 'exact' && profile.time === '') {
    showProfileError('请选择确切时辰，或改成时辰不详。');
    return;
  }
  if (typeof iztro === 'undefined' || typeof ThreeMeta === 'undefined') {
    appendUser(value);
    appendAssistant({ text: '排盘库没有载入，这一问停在本机。' });
    return;
  }
  busy = true;
  sendButton.disabled = true;
  pendingQuestion = value;
  appendUser(value);
  questionEl.value = '';
  questionEl.style.height = 'auto';
  closePanel();
  const domain = inferDomain(value);
  const timeline = extractTimeline(value);
  const tags = extractTags(value);
  addRecent(value);
  const history = historyByProfile.get(profile.id) || [];
  const context = collectContext();
  const pending = el('article', 'bubble bubble-agent');
  const pendingBody = el('div', 'bubble-body');
  pending.append(pendingBody);
  thread.append(pending);
  tail();
  let pack = null;
  startThinking(pendingBody);
  try {
    setStatus('正在起盘');
    pack = buildFacts(profile, domain);
    pack.tags = tags;
    pack.evidence = buildEvidence(pack);
    if (pack.timeUnknown && (pack.facts.ziwei.palaces || pack.facts.ziwei.hourChart)) {
      throw new Error('时辰不详时不应带上紫微命宫');
    }
    setStatus('正在会诊');
    const reply = await askCouncil(value, pack, history, context, timeline, tags);
    const content = reply.content || '';
    historyByProfile.set(profile.id, [
      ...history,
      { role: 'user', content: value },
      { role: 'assistant', content }
    ].slice(-6));
    stopThinking();
    pending.remove();
    awaitingFixConsent = pack.timeMode === 'unknown';
    await appendAssistant({
      text: content,
      sections: reply.sections,
      pack,
      stream: !reply.sections,
      offerFix: pack.timeMode === 'unknown'
    });
    setStatus('会诊完成');
  } catch (error) {
    stopThinking();
    pending.remove();
    const message = error?.message || '未知错误';
    awaitingFixConsent = Boolean(pack) && profile.timeMode === 'unknown';
    await appendAssistant({
      text: pack
        ? '会诊服务暂时没有接上：' + message + '。本机盘面还在，可以展开双盘原局。'
        : '这一问没有排开：' + message,
      pack,
      offerFix: awaitingFixConsent
    });
    setStatus('会诊未完成');
  } finally {
    stopThinking();
    busy = false;
    sendButton.disabled = false;
  }
}

function bootQuick() {
  const row = $('quick-row');
  for (const text of QUICK) {
    const button = el('button', 'quick-tag', text);
    button.type = 'button';
    button.addEventListener('click', () => submitQuestion(text));
    row.append(button);
  }
}

capsule.addEventListener('click', () => {
  if (panel.hidden) openPanel();
  else closePanel();
});
$('profile-new').addEventListener('click', () => {
  newProfile();
  fillForm();
  profileDate.focus();
});
$('profile-delete').addEventListener('click', () => {
  const current = activeProfile();
  if (!current) return;
  store.profiles = store.profiles.filter((item) => item.id !== current.id);
  historyByProfile.delete(current.id);
  store.activeId = store.profiles[0]?.id || null;
  persist();
  paintCapsule();
  fillForm();
});
profileDate.addEventListener('change', readFormIntoProfile);
profileHour.addEventListener('change', readFormIntoProfile);
for (const input of document.querySelectorAll('input[name=pgender]')) {
  input.addEventListener('change', readFormIntoProfile);
}
document.addEventListener('pointerdown', (event) => {
  if (panel.hidden) return;
  if (panel.contains(event.target) || capsule.contains(event.target)) return;
  closePanel();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || panel.hidden) return;
  if ($('about-dialog').open || $('settings-dialog').open) return;
  closePanel();
});

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  submitQuestion(questionEl.value);
});
questionEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    if (!busy) composer.requestSubmit();
  }
});
questionEl.addEventListener('input', () => {
  questionEl.style.height = 'auto';
  questionEl.style.height = Math.min(questionEl.scrollHeight, 120) + 'px';
});

$('about-open').addEventListener('click', () => $('about-dialog').showModal());

async function initSettings() {
  const open = $('settings-open');
  const dialog = $('settings-dialog');
  const form = $('settings-form');
  if (!open || !dialog || !form || !window.zhiji) return;
  open.hidden = false;
  const urlInput = $('n8n-url');
  const secretInput = $('n8n-secret');
  const status = $('settings-status');
  try {
    const config = await window.zhiji.getConfig();
    urlInput.value = config.n8nUrl || '';
    secretInput.placeholder = config.hasSecret ? '已保存（留空则不修改）' : '未设置（本地 n8n 可留空）';
  } catch (error) {
    status.textContent = '读取配置失败：' + (error?.message || error);
  }
  open.addEventListener('click', () => dialog.showModal());
  $('settings-cancel').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '保存中……';
    try {
      await window.zhiji.setConfig({ n8nUrl: urlInput.value.trim(), secret: secretInput.value });
      status.textContent = '已保存';
      setTimeout(() => dialog.close(), 500);
    } catch (error) {
      status.textContent = '保存失败：' + (error?.message || error);
    }
  });
}

profileDate.max = dateOnly();

function startNewAsk() {
  stopThinking();
  const profile = activeProfile();
  if (profile) historyByProfile.delete(profile.id);
  thread.replaceChildren();
  setTalking(false);
  questionEl.value = '';
  questionEl.style.height = 'auto';
  questionEl.focus();
}
async function chooseWorkspace() {
  const status = $('workspace-status');
  if (!window.zhiji?.chooseFolder) {
    status.textContent = '本地文件只在桌面端可用。';
    return;
  }
  try {
    const result = await window.zhiji.chooseFolder();
    if (!result) return;
    pluginState.workspace = result.path;
    pluginState.files = result.files || [];
    pluginState.attached = null;
    pluginState.filesEnabled = true;
    $('files-enabled').checked = true;
    renderFileList();
    renderContextChips();
  } catch (error) {
    status.textContent = '选择文件夹失败：' + (error?.message || error);
  }
}
async function chooseCalendar() {
  const status = $('calendar-status');
  if (!window.zhiji?.chooseCalendar) {
    status.textContent = '日历只在桌面端可用。';
    return;
  }
  try {
    const result = await window.zhiji.chooseCalendar();
    if (!result) return;
    pluginState.calendarPath = result.path;
    pluginState.events = result.events || [];
    pluginState.calendarEnabled = true;
    $('calendar-enabled').checked = true;
    renderCalendarList();
    renderContextChips();
  } catch (error) {
    status.textContent = '导入日历失败：' + (error?.message || error);
  }
}
function bindShell() {
  $('new-ask')?.addEventListener('click', startNewAsk);
  $('side-profiles')?.addEventListener('click', () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });
  $('side-plugins')?.addEventListener('click', () => openPlugins());
  $('side-files')?.addEventListener('click', () => openPlugins('choose-folder'));
  $('side-about')?.addEventListener('click', () => $('about-open').click());
  $('side-settings')?.addEventListener('click', () => {
    if (!$('settings-open').hidden) $('settings-open').click();
    else $('settings-dialog').showModal();
  });
  $('choose-folder')?.addEventListener('click', chooseWorkspace);
  $('choose-calendar')?.addEventListener('click', chooseCalendar);
  $('files-enabled')?.addEventListener('change', (event) => {
    pluginState.filesEnabled = event.target.checked;
    renderContextChips();
  });
  $('calendar-enabled')?.addEventListener('change', (event) => {
    pluginState.calendarEnabled = event.target.checked;
    renderContextChips();
  });
  renderRecent();
  renderFileList();
  renderCalendarList();
  renderContextChips();
  paintTopbar();
}
bindShell();

fillHourSelect();
paintCapsule();
bootQuick();
initSettings();
