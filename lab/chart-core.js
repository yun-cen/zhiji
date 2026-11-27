'use strict';

const ziweiEngine = typeof module === 'undefined' ? globalThis.iztro : require('./vendor/iztro');
const qimenEngine = typeof module === 'undefined' ? globalThis.ThreeMeta : require('./vendor/3meta.min');

const HOUR_LABEL = {
  0: '早子时', 1: '丑时', 2: '寅时', 3: '卯时', 4: '辰时', 5: '巳时',
  6: '午时', 7: '未时', 8: '申时', 9: '酉时', 10: '戌时', 11: '亥时', 12: '晚子时'
};
// 五个口语时段盖住十三个钟点。深夜含亥、晚子、早子、丑。
const FUZZY_BANDS = [
  { id: 'dawn', label: '清晨', range: '寅时–辰时 · 约 03:00–08:59', hours: [2, 3, 4] },
  { id: 'forenoon', label: '上午', range: '巳时–午时 · 约 09:00–12:59', hours: [5, 6] },
  { id: 'afternoon', label: '午后', range: '未时–申时 · 约 13:00–16:59', hours: [7, 8] },
  { id: 'dusk', label: '傍晚', range: '酉时–戌时 · 约 17:00–20:59', hours: [9, 10] },
  { id: 'night', label: '深夜', range: '亥时–丑时 · 约 21:00–02:59', hours: [11, 12, 0, 1] }
];
const TRANSFORMS = ['禄', '权', '科', '忌'];
const domainMeta = {
  career: { label: '事业 / 合作', ziwei: ['官禄', '命宫', '迁移'], qimenGate: '开门' },
  wealth: { label: '财富 / 投入', ziwei: ['财帛', '田宅', '福德'], qimenGate: '生门' },
  relationship: { label: '亲密 / 关系', ziwei: ['夫妻', '子女', '命宫'], qimenDeity: '六合' },
  travel: { label: '迁移 / 出行', ziwei: ['迁移', '官禄', '命宫'], qimenGate: '开门' },
  study: { label: '学业 / 考试', ziwei: ['命宫', '官禄', '父母', '福德'], qimenGate: '景门' },
  timing: { label: '时机 / 要不要现在做', ziwei: ['官禄', '财帛', '命宫'], qimenZhiShi: true }
};
function pad(value) { return String(value).padStart(2, '0'); }
function dateOnly(date = new Date()) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}
function dateTimeNow() {
  const d = new Date();
  return dateOnly(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}
function bandById(id) { return FUZZY_BANDS.find((band) => band.id === id); }
function inferDomain(text) {
  if (/感情|恋爱|结婚|对象|分手|复合|婚姻|伴侣|关系/.test(text)) return 'relationship';
  if (/考试|期末|期中|六级|四级|考研|雅思|托福|学习|复习|成绩|上岸|证书|论文|答辩/.test(text)) return 'study';
  if (/钱|财|投资|买房|收入|工资|花销|理财/.test(text)) return 'wealth';
  if (/出国|搬家|换城市|出行|远行|迁移/.test(text)) return 'travel';
  if (/时机|什么时候|再等|拖/.test(text)) return 'timing';
  return 'career';
}
function palaceByName(chart, name) {
  return chart.palaces.find((palace) => palace.name === name);
}
function palaceByBranch(chart, branch) {
  return chart.palaces.find((palace) => palace.earthlyBranch === branch);
}
function findStarPalace(chart, name) {
  return chart.palaces.find((palace) => [...palace.majorStars, ...palace.minorStars, ...palace.adjectiveStars].some((star) => star.name === name));
}
function scopeChanges(chart, scope) {
  return (scope.mutagen || []).map((name, index) => {
    const palace = findStarPalace(chart, name);
    return { star: name, type: TRANSFORMS[index], palace: palace ? palace.name : null };
  });
}
function starBrief(star) {
  return { name: star.name, brightness: star.brightness || '', mutagen: star.mutagen || '' };
}
function palaceBrief(palace) {
  return {
    name: palace.name,
    branch: palace.heavenlyStem + palace.earthlyBranch,
    major: palace.majorStars.map(starBrief)
  };
}
function castChart(profile, timeIndex) {
  return ziweiEngine.astro.bySolar(profile.date, Number(timeIndex), profile.gender, true, 'zh-CN');
}
function castZiwei(profile, domain) {
  const chart = castChart(profile, profile.time);
  const today = dateOnly();
  const horoscope = chart.horoscope(today, 6);
  const focus = domainMeta[domain].ziwei.map((name) => palaceByName(chart, name)).filter(Boolean);
  const currentDecadal = chart.palaces.find((palace) => palace.index === horoscope.decadal.index);
  const currentYearly = chart.palaces.find((palace) => palace.index === horoscope.yearly.index);
  const literary = [];
  for (const palace of chart.palaces) {
    for (const star of [...palace.majorStars, ...palace.minorStars]) {
      if (star.name === '文昌' || star.name === '文曲') {
        literary.push({ palace: palace.name, name: star.name, brightness: star.brightness || '', mutagen: star.mutagen || '' });
      }
    }
  }
  return {
    chart,
    horoscope,
    focus,
    facts: {
      system: 'ziwei',
      timeMode: 'exact',
      birth: chart.solarDate,
      lunar: chart.lunarDate,
      time: chart.time,
      timeIndex: Number(profile.time),
      gender: chart.gender,
      fiveElementsClass: chart.fiveElementsClass,
      soul: chart.soul,
      body: chart.body,
      nominalAge: horoscope.age.nominalAge,
      currentDecadal: currentDecadal ? { palace: currentDecadal.name, range: currentDecadal.decadal.range, changes: scopeChanges(chart, horoscope.decadal) } : null,
      currentYearly: currentYearly ? { palace: currentYearly.name, changes: scopeChanges(chart, horoscope.yearly) } : null,
      literary,
      palaces: focus.map((palace) => ({
        ...palaceBrief(palace),
        minor: palace.minorStars.map((star) => star.name),
        decadal: palace.decadal.range,
        isBodyPalace: palace.isBodyPalace
      }))
    }
  };
}
function summarizeHour(profile, timeIndex, domain) {
  const chart = castChart(profile, timeIndex);
  const horoscope = chart.horoscope(dateOnly(), 6);
  const ming = palaceByName(chart, '命宫');
  const bodyPalace = chart.palaces.find((palace) => palace.isBodyPalace);
  const decadal = chart.palaces.find((palace) => palace.index === horoscope.decadal.index);
  const focus = domainMeta[domain].ziwei.map((name) => palaceByName(chart, name)).filter(Boolean);
  return {
    timeIndex,
    timeName: HOUR_LABEL[timeIndex] || chart.time,
    fiveElementsClass: chart.fiveElementsClass,
    soul: chart.soul,
    body: chart.body,
    mingBranch: ming.earthlyBranch,
    mingMajor: ming.majorStars.map(starBrief),
    bodyPalace: bodyPalace ? bodyPalace.name : '',
    decadalPalace: decadal ? decadal.name : '',
    focus: focus.map(palaceBrief)
  };
}
function findQimenTarget(qimen, domain) {
  const meta = domainMeta[domain];
  if (meta.qimenGate) {
    return qimen.palaces.find((palace) => palace.gate === meta.qimenGate) || qimen.palaces.find((palace) => palace.position === qimen.zhiFu.position);
  }
  if (meta.qimenDeity) {
    return qimen.palaces.find((palace) => palace.deity === meta.qimenDeity) || qimen.palaces.find((palace) => palace.gate === '休门') || qimen.palaces.find((palace) => palace.position === qimen.zhiFu.position);
  }
  return qimen.palaces.find((palace) => palace.position === qimen.zhiShi.position) || qimen.palaces.find((palace) => palace.position === qimen.zhiFu.position);
}
function qimenPalaceFacts(palace) {
  return {
    position: palace.position,
    trigram: palace.trigram,
    gate: palace.gate,
    star: Array.isArray(palace.star) ? palace.star : [palace.star],
    deity: palace.deity,
    heavenlyStem: Array.isArray(palace.heavenlyStem) ? palace.heavenlyStem : [palace.heavenlyStem],
    earthlyStem: Array.isArray(palace.earthlyStem) ? palace.earthlyStem : [palace.earthlyStem],
    status: palace.status,
    gatePressure: palace.gatePressure,
    isZhiFu: palace.isZhiFu,
    isZhiShi: palace.isZhiShi,
    auspicious: (palace.auspiciousPatterns || []).slice(0, 4).map((pattern) => pattern.name || pattern.type),
    inauspicious: (palace.inauspiciousPatterns || []).slice(0, 4).map((pattern) => pattern.name || pattern.type)
  };
}
function castQimen(domain, when) {
  const qimen = qimenEngine.QimenChart.byDatetime(when);
  const target = findQimenTarget(qimen, domain);
  return {
    qimen,
    target,
    facts: {
      system: 'qimen',
      castAt: when,
      timeInfo: qimen.timeInfo,
      ju: qimen.ju,
      yuan: qimen.yuan,
      zhiFu: qimen.zhiFu,
      zhiShi: qimen.zhiShi,
      target: target ? qimenPalaceFacts(target) : null,
      palaces: qimen.palaces.map(qimenPalaceFacts)
    }
  };
}

function readingGuide(timeMode) {
  if (timeMode === 'unknown') {
    return '出生时辰不详。facts 里没有紫微命宫，禁止编造命宫、主星、四化、大限或时辰盘。这一问以奇门断事为主；三问定盘的收窄入口由界面提供，不要在正文里自行展开。';
  }
  if (timeMode === 'fuzzy') {
    return '只知道一个模糊时段。ziwei.variants 是该时段内每个时辰各排一次的摘要。只采用交集：多数时辰共同指向的倾向才可以说；彼此矛盾就写明这个时段里并不一致。不要挑其中一个时辰当成出生时辰。';
  }
  return '时辰已定。紫微看长期结构，奇门看此刻这件事。两盘不一致时分开说，不要折成一句吉或凶。';
}
function buildFacts(profile, domain) {
  const when = dateTimeNow();
  const qimen = castQimen(domain, when);
  const guide = readingGuide(profile.timeMode);
  if (profile.timeMode === 'unknown') {
    return {
      timeMode: 'unknown',
      timeUnknown: true,
      domain,
      qimen,
      facts: {
        readingGuide: guide,
        timeMode: 'unknown',
        timeUnknown: true,
        domain: domainMeta[domain].label,
        ziwei: {
          system: 'ziwei',
          solarDate: profile.date,
          gender: profile.gender,
          hourChart: null,
          withheld: ['命宫', '身宫', '十二宫', '四化', '大限', '流年'],
          note: '时辰不详，未排紫微时辰命盘'
        },
        qimen: qimen.facts
      }
    };
  }
  if (profile.timeMode === 'fuzzy') {
    const band = bandById(profile.fuzzy);
    const variants = band.hours.map((index) => summarizeHour(profile, index, domain));
    const starSets = variants.map((item) => new Set(item.mingMajor.map((star) => star.name)));
    const commonMingStars = [...starSets[0]].filter((name) => starSets.every((set) => set.has(name)));
    return {
      timeMode: 'fuzzy',
      timeUnknown: false,
      domain,
      qimen,
      variants,
      facts: {
        readingGuide: guide,
        timeMode: 'fuzzy',
        timeUnknown: false,
        domain: domainMeta[domain].label,
        fuzzy: { id: band.id, label: band.label, range: band.range },
        ziwei: {
          system: 'ziwei',
          solarDate: profile.date,
          gender: profile.gender,
          variants,
          commonMingStars,
          mingStarsAgree: commonMingStars.length > 0 && variants.every((item) => item.mingMajor.length === commonMingStars.length)
        },
        qimen: qimen.facts
      }
    };
  }
  const ziwei = castZiwei(profile, domain);
  return {
    timeMode: 'exact',
    timeUnknown: false,
    domain,
    ziwei,
    qimen,
    facts: {
      readingGuide: guide,
      timeMode: 'exact',
      timeUnknown: false,
      domain: domainMeta[domain].label,
      ziwei: ziwei.facts,
      qimen: qimen.facts
    }
  };
}


function asList(value) {
  if (Array.isArray(value)) return value;
  return value == null || value === '' ? [] : [value];
}
function starText(star) {
  return star.name + (star.brightness ? '（' + star.brightness + '）' : '') + (star.mutagen ? '化' + star.mutagen : '');
}
function changeText(changes) {
  return asList(changes).map((change) => change.star + (change.type || '') + (change.palace ? '入' + change.palace : '')).join('、');
}
function buildEvidence(pack) {
  const items = [];
  const add = (system, label, fact, stability = 'exact') => {
    const id = 'E' + (items.length + 1);
    items.push({ id, system, label, fact, stability });
  };
  const ziwei = pack.facts.ziwei || {};
  if (pack.timeMode === 'exact') {
    for (const palace of (ziwei.palaces || [])) {
      const majors = (palace.major || []).map(starText).join('、') || '无主星';
      const minors = (palace.minor || []).slice(0, 4).join('、');
      const range = palace.decadal ? '；大限 ' + palace.decadal.join('–') : '';
      add('ziwei', '紫微 · ' + palace.name + (palace.name.endsWith('宫') ? '' : '宫') + '（' + palace.branch + '）',
        '主星：' + majors + (minors ? '；辅星：' + minors : '') + range + (palace.isBodyPalace ? '；身宫' : ''));
    }
    for (const star of (ziwei.literary || [])) {
      add('ziwei', '紫微 · ' + star.name + '（' + star.palace + '）',
        (star.brightness ? '亮度 ' + star.brightness : '') + (star.mutagen ? '；化' + star.mutagen : '') + '。');
    }
    if (ziwei.currentDecadal) {
      const changes = changeText(ziwei.currentDecadal.changes);
      add('ziwei', '紫微 · 当前大限（' + ziwei.currentDecadal.palace + '）',
        '大限 ' + (ziwei.currentDecadal.range || []).join('–') + (changes ? '；四化：' + changes : ''));
    }
    if (ziwei.currentYearly) {
      const changes = changeText(ziwei.currentYearly.changes);
      add('ziwei', '紫微 · 流年（' + ziwei.currentYearly.palace + '）', changes ? '流年四化：' + changes : '流年已取。');
    }
  } else if (pack.timeMode === 'fuzzy') {
    const common = (ziwei.commonMingStars || []).join('、');
    add('ziwei', '紫微 · 候选时辰共同命宫',
      common ? '这些候选时辰的命宫都有：' + common + '。' : '候选时辰的命宫主星不一致，没有共同主星。',
      'common');
    const variants = (ziwei.variants || []).map((item) => {
      const majors = (item.mingMajor || []).map((star) => star.name).join('、') || '无主星';
      return item.timeName + ' 命宫在' + item.mingBranch + '，主星 ' + majors;
    }).join('；');
    add('ziwei', '紫微 · 各候选时辰', variants || '候选时辰未生成摘要', 'varies');
  } else {
    add('ziwei', '紫微 · 时辰不详',
      '未排紫微命宫、身宫、四化、大限；只使用公历 ' + (ziwei.solarDate || '') + ' 与性别 ' + (ziwei.gender || '') + '。',
      'withheld');
  }
  const qimen = pack.facts.qimen || {};
  const target = qimen.target;
  if (target) {
    const stars = asList(target.star).join('、') || '—';
    const heavens = asList(target.heavenlyStem).join('') || '—';
    const earths = asList(target.earthlyStem).join('') || '—';
    const patterns = [...asList(target.auspicious), ...asList(target.inauspicious)].filter(Boolean).join('、');
    add('qimen', '奇门 · ' + target.gate + '（' + target.trigram + target.position + '宫）',
      '九星 ' + stars + '；八神 ' + (target.deity || '—') + '；天盘 ' + heavens + '；地盘 ' + earths + (patterns ? '；格局 ' + patterns : ''));
  }
  if (qimen.ju) {
    add('qimen', '奇门 · ' + qimen.ju.type + qimen.ju.number + '局',
      '起局 ' + (qimen.timeInfo?.solarDate || qimen.castAt || '') + ' ' + (qimen.timeInfo?.timeName || '') + (qimen.yuan ? '；' + qimen.yuan : ''));
  }
  if (qimen.zhiFu?.star) add('qimen', '奇门 · 值符 ' + qimen.zhiFu.star, '值符落 ' + (qimen.zhiFu.position || '—') + ' 宫。');
  if (qimen.zhiShi?.gate) add('qimen', '奇门 · 值使 ' + qimen.zhiShi.gate, '值使落 ' + (qimen.zhiShi.position || '—') + ' 宫。');
  const byId = new Map(items.map((item) => [item.id, item]));
  return { items, byId };
}

if (typeof module !== 'undefined') module.exports = { buildFacts, buildEvidence, inferDomain, bandById };
