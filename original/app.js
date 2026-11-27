'use strict';

const $ = (id) => document.getElementById(id);
const form = $('birth-form');
const hour = $('hour');
const solar = $('solar-date');
const lunarYear = $('lunar-year');
const lunarMonth = $('lunar-month');
const lunarDay = $('lunar-day');
const yearDate = $('year-date');
const grid = $('chart-grid');
const stage = $('chart-stage');
const casting = $('casting');
const castingStatus = $('casting-status');
const submit = form.querySelector('button[type=submit]');
const exampleButton = $('example');
const workbench = $('workbench');
const reading = $('reading');
const branches = '子丑寅卯辰巳午未申酉戌亥';
const layout = [
  ['巳','si'], ['午','wu'], ['未','wei'], ['申','shen'],
  ['辰','chen'], ['酉','you'], ['卯','mao'], ['戌','xu'],
  ['寅','yin'], ['丑','chou'], ['子','zi'], ['亥','hai']
];
const today = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai'}).format(new Date());
const months = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
const numerals = '一二三四五六七八九十';
const days = Array.from({length:30}, (_, i) => {
  if (i < 10) return '初' + numerals[i];
  if (i === 19) return '二十';
  if (i === 29) return '三十';
  return (i < 19 ? '十' : '廿') + numerals[i % 10];
});
const palaceThemes = {
  命宫:'自我与性格', 兄弟:'手足与同辈', 夫妻:'亲密关系', 子女:'子女与传承',
  财帛:'财务与资源', 疾厄:'身心状态', 迁移:'外界与变动', 仆役:'人际与协作',
  官禄:'事业与实践', 田宅:'居所与家业', 福德:'精神生活', 父母:'父母与长辈'
};
const transforms = ['禄','权','科','忌'];
const example = {calendar:'solar',date:'1996-05-17',time:5,gender:'女'};
let chart;
let selectedBranch;
let horoscope;
let isCasting = false;

function el(tag, cls, value) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (value != null) node.textContent = value;
  return node;
}
function option(value, label, disabled = false) {
  const element = el('option', '', label);
  element.value = value;
  element.disabled = disabled;
  return element;
}
yearDate.value = today;
yearDate.min = '1900-01-01';
yearDate.max = '2100-12-31';
lunarYear.max = Math.min(2100, Number(today.slice(0, 4)));
solar.max = today < '2100-12-31' ? today : '2100-12-31';
lunarMonth.append(option('', '月', true), ...months.map((m,i) => option(i+1, m + '月')));
lunarDay.append(option('', '日', true), ...days.map((d,i) => option(i+1, d)));
hour.append(option('', '选择时辰', true), option(0, '早子时 · 00:00–00:59'));
for (let i = 1; i < 12; i += 1) {
  hour.append(option(i, branches[i] + '时 · ' + String(2*i-1).padStart(2,'0') + ':00–' + String(2*i).padStart(2,'0') + ':59'));
}
hour.append(option(12, '晚子时 · 23:00–23:59'));
hour.value = '';

function updateCalendar() {
  const isLunar = form.elements.calendar.value === 'lunar';
  $('solar-fields').hidden = isLunar;
  $('lunar-fields').hidden = !isLunar;
  solar.disabled = isLunar;
  solar.required = !isLunar;
  for (const input of [lunarYear, lunarMonth, lunarDay, $('leap')]) {
    input.disabled = !isLunar;
    if (input.type !== 'checkbox') input.required = isLunar;
  }
}

function calculate(input) {
  const {astro} = window.iztro;
  const {date,time,gender,leap,calendar} = input;
  if (calendar === 'lunar') {
    const [year,month,day] = date.split('-').map(Number);
    const checked = astro.byLunar(date, 0, gender, leap, true, 'zh-CN');
    const raw = checked.rawDates.lunarDate;
    if (raw.lunarYear !== year || raw.lunarMonth !== month || raw.lunarDay !== day || raw.isLeap !== leap) {
      throw new Error('invalid lunar date');
    }
    const solarDate = checked.solarDate.split('-').map((part,i) => i ? part.padStart(2,'0') : part).join('-');
    if (solarDate > today) throw new Error('future birth date');
    return time === 0 ? checked : astro.byLunar(date, time, gender, leap, true, 'zh-CN');
  }
  return astro.bySolar(date, time, gender, true, 'zh-CN');
}

function showChart(result, isExample) {
  chart = result;
  $('example-tag').hidden = !isExample;
  selectedBranch = chart.earthlyBranchOfSoulPalace;
  $('chart-empty').hidden = true;
  for (const id of ['chart-modes','chart-grid','chart-caption','palace-detail','reading-nav']) {
    $(id).hidden = false;
  }
  render();
  renderReading(ziweiReading(chart,today),isExample);
}

function renderReading(cards, isExample) {
  const articles = cards.map(({title,source,paragraphs,items}) => {
    const card = el('article','reading-card');
    const copy = el('div','reading-copy');
    copy.append(...paragraphs.map((paragraph) => el('p','',paragraph)));
    if (items?.length) {
      const list = el('ul','reading-list');
      for (const [label,description] of items) {
        const entry = el('li');
        entry.append(el('strong','',label), document.createTextNode(description));
        list.append(entry);
      }
      copy.append(list);
    }
    const basis = el('details','reading-basis');
    basis.append(el('summary','','盘面依据'),el('p','',source));
    copy.append(basis);
    card.append(el('h3','',title),copy);
    return card;
  });
  $('reading-grid').replaceChildren(...articles);
  $('reading-example').hidden = !isExample;
  reading.hidden = false;
}

function palaceName(palace) {
  return horoscope ? horoscope.yearly.palaceNames[palace.index] : palace.name;
}

function render() {
  if (!chart) return;
  const yearly = document.querySelector('input[name=mode]:checked').value === 'yearly';
  $('year-tools').hidden = !yearly;
  horoscope = undefined;
  if (yearly) {
    try {
      if (!yearDate.value || !yearDate.validity.valid) throw new Error('invalid year date');
      const birthDate = chart.solarDate.split('-').map((part,i) => i ? part.padStart(2,'0') : part).join('-');
      if (yearDate.value < birthDate) {
        $('year-info').textContent = '参照日期需在出生日期当日或之后。';
      } else {
        horoscope = chart.horoscope(yearDate.value, 6);
        $('year-info').textContent = horoscope.yearly.heavenlyStem + horoscope.yearly.earthlyBranch + '年 · ' +
          horoscope.yearly.mutagen.map((s,i) => s + '化' + transforms[i]).join('、');
      }
    } catch {
      $('year-info').textContent = '请选择有效日期。';
    }
  }
  grid.replaceChildren();
  for (const [branch, area] of layout) {
    const palace = chart.palaces.find((p) => p.earthlyBranch === branch);
    const button = el('button', 'palace branch-' + area);
    button.type = 'button';
    button.dataset.branch = branch;
    button.setAttribute('aria-pressed', String(selectedBranch === branch));
    const heading = el('div','palace-top');
    const name = el('span','palace-name',palaceName(palace));
    if (palace.isBodyPalace) name.append(el('span','body-label','身'));
    heading.append(name);
    if (horoscope) heading.append(el('span','alt-name','本' + palace.name));
    const changeFor = (star) => horoscope ? transforms[horoscope.yearly.mutagen.indexOf(star.name)] : star.mutagen;
    const showStar = (star) => {
      const item = el('span','',star.name);
      const change = changeFor(star);
      if (change) {
        const stamp = el('span','mutagen',change);
        stamp.setAttribute('aria-label','化' + change);
        item.append(stamp);
      }
      return item;
    };
    const stars = el('div','palace-main');
    stars.append(...palace.majorStars.map(showStar));
    if (!palace.majorStars.length) stars.append(el('span','alt-name','无主星'));
    const minor = el('div','palace-minor');
    const visibleMinor = [...palace.minorStars].sort((a,b) => Number(Boolean(changeFor(b))) - Number(Boolean(changeFor(a)))).slice(0,3);
    minor.append(...visibleMinor.map(showStar));
    const foot = el('div','palace-foot');
    foot.append(el('span','',palace.heavenlyStem + branch), el('span','',palace.decadal.range.join('–')));
    button.append(heading, stars, minor, foot);
    grid.append(button);
  }

  const center = el('div','chart-center');
  center.append(
    el('div','center-symbol',horoscope ? '流年' : '本命'),
    el('h3','',chart.fiveElementsClass),
    el('p','',chart.gender + '命 · ' + chart.zodiac + ' · ' + chart.time),
    el('p','','公历 ' + chart.solarDate),
    el('p','',chart.lunarDate),
    el('p','',chart.chineseDate),
    el('p','center-stars','命主 ' + chart.soul + '　身主 ' + chart.body)
  );
  grid.append(center);
  showPalace();
}

function showPalace() {
  const palace = chart.palaces.find((p) => p.earthlyBranch === selectedBranch);
  const name = palaceName(palace);
  const detail = $('palace-detail');
  detail.replaceChildren(el('h3','',name + ' · ' + (palaceThemes[name] || '宫位详情')));
  const row = (label, value) => {
    const p = el('p');
    p.append(el('b','',label), document.createTextNode(value));
    detail.append(p);
  };
  const describe = (star) => {
    const tags = [star.brightness, star.mutagen && '化' + star.mutagen].filter(Boolean);
    return star.name + (tags.length ? '（' + tags.join('、') + '）' : '');
  };
  row('宫位', palace.heavenlyStem + palace.earthlyBranch + ' · 大限 ' + palace.decadal.range.join('–') + ' 岁' +
    (palace.isBodyPalace ? ' · 身宫' : '') + (horoscope ? ' · 本命' + palace.name : ''));
  row('主星', palace.majorStars.map(describe).join('、') || '无主星');
  row('辅星', palace.minorStars.map(describe).join('、') || '无');
  if (palace.adjectiveStars.length) row('杂曜',palace.adjectiveStars.map((s) => s.name).join('、'));
  if (horoscope) {
    const localNames = new Set([...palace.majorStars,...palace.minorStars,...palace.adjectiveStars].map((star) => star.name));
    const localChanges = horoscope.yearly.mutagen
      .map((star,i) => localNames.has(star) ? star + '化' + transforms[i] : '')
      .filter(Boolean);
    row('流年星曜',horoscope.yearly.stars[palace.index].map((s) => s.name).join('、') || '无');
    row('流年四化',localChanges.join('、') || '无');
  }
}

form.addEventListener('change', (e) => { if (e.target.name === 'calendar') updateCalendar(); });
form.addEventListener('input', () => { $('form-error').hidden = true; });
async function revealChart(result) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (matchMedia('(max-width: 760px)').matches) {
    document.querySelector('.chart-card').scrollIntoView({block:'start'});
  }
  if (reducedMotion) {
    showChart(result,false);
    castingStatus.textContent = '命盘已生成。';
    return;
  }

  isCasting = true;
  submit.disabled = exampleButton.disabled = true;
  grid.inert = true;
  stage.setAttribute('aria-busy','true');
  castingStatus.textContent = '正在排盘。';
  casting.hidden = false;
  try {
    const animation = casting.animate([
      {opacity:0}, {opacity:1,offset:.16}, {opacity:1,offset:.75}, {opacity:0}
    ],{duration:1050,easing:'ease'});
    await animation.finished;
    showChart(result,false);
  } finally {
    casting.hidden = true;
    stage.removeAttribute('aria-busy');
    grid.inert = false;
    submit.disabled = exampleButton.disabled = false;
    isCasting = false;
  }
  castingStatus.textContent = '命盘已生成。';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (isCasting) return;
  const calendar = form.elements.calendar.value;
  const date = calendar === 'solar' ? solar.value : [lunarYear.value,lunarMonth.value,lunarDay.value].join('-');
  let result;
  try {
    result = calculate({calendar,date,time:Number(hour.value),gender:form.elements.gender.value,leap:$('leap').checked});
  } catch {
    const error = $('form-error');
    error.textContent = '请检查出生日期和闰月选项。出生日期须有效，且不能晚于今天。';
    error.hidden = false;
    return;
  }
  void revealChart(result);
});
exampleButton.addEventListener('click', () => {
  form.elements.calendar.value = example.calendar;
  form.elements.gender.value = example.gender;
  solar.value = example.date;
  hour.value = example.time;
  updateCalendar();
  $('form-error').hidden = true;
  showChart(calculate(example),true);
  castingStatus.textContent = '已显示示例命盘。';
});
document.querySelectorAll('input[name=mode]').forEach((input) => input.addEventListener('change', render));
yearDate.addEventListener('change', render);
grid.addEventListener('click',(event) => {
  const button = event.target.closest('.palace');
  if (!button) return;
  grid.querySelector('[aria-pressed=true]')?.setAttribute('aria-pressed','false');
  selectedBranch = button.dataset.branch;
  button.setAttribute('aria-pressed','true');
  showPalace();
});
function route(focus) {
  const page = location.hash.slice(1);
  const inWorkbench = ['chart','reading','guide'].includes(page);
  const wasInWorkbench = !workbench.hidden;
  const changedView = wasInWorkbench !== inWorkbench;
  $('start').hidden = inWorkbench;
  $('work-nav').hidden = !inWorkbench;
  workbench.hidden = !inWorkbench;
  $('work-nav').querySelectorAll('a').forEach((link) => {
    const active = link.hash === location.hash;
    link.classList.toggle('current',active);
    if (active) link.setAttribute('aria-current','location');
    else link.removeAttribute('aria-current');
  });
  if (!focus) return;
  if (changedView) {
    const heading = inWorkbench ? $('work-title') : $('hero-title');
    heading.focus({preventScroll:true});
    if (!inWorkbench || page === 'chart') {
      window.scrollTo({top:0,behavior:'instant'});
      return;
    }
  }
  const target = $(page);
  if (target && !target.hidden) target.scrollIntoView({block:'start'});
  else window.scrollTo({top:0,behavior:'instant'});
}

updateCalendar();
route(false);
window.addEventListener('hashchange',() => route(true));
