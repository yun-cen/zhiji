'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ZhijiTurn = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const EVENTS = [
    [/英语六级|六级/, '英语六级'],
    [/英语四级|四级/, '英语四级'],
    [/考研/, '考研'],
    [/雅思/, '雅思'],
    [/托福/, '托福'],
    [/期末/, '期末考试'],
    [/期中/, '期中考试'],
    [/考试/, '考试']
  ];
  const WINDOWS = [
    [/下个月|下月/, '下个月'],
    [/明年/, '明年'],
    [/下周/, '下周'],
    [/这个月|本月/, '这个月'],
    [/今天|今日/, '今天']
  ];
  const ANGLES = [
    [/仅从算命|只从算命|从算命|只按命理|仅按命理|只谈命理|按命理|从命理|只从命盘|从命盘/, 'fortune'],
    [/讲依据|看依据|说依据|要依据|给出依据/, 'evidence'],
    [/说直白|直白点|说人话|大白话/, 'plain'],
    [/为什么|为何/, 'why']
  ];

  function extractMatter(text) {
    const source = String(text || '').trim();
    let event = '';
    for (const [pattern, name] of EVENTS) {
      if (pattern.test(source)) { event = name; break; }
    }
    let timeWindow = '';
    for (const [pattern, name] of WINDOWS) {
      if (pattern.test(source)) { timeWindow = name; break; }
    }
    let ask = '';
    if (/概率|能过|通过|考得上|希望大/.test(source)) ask = '能否通过';
    else if (/要不要|去不去|该不该/.test(source)) ask = '做不做这个选择';
    const subject = /妈妈|母亲|父亲|爸爸|孩子|儿子|女儿/.test(source) ? '家人' : '用户本人';
    const domain = /六级|四级|考研|考试|雅思|托福|期末|期中/.test(event + source) ? 'study' : '';
    return { subject, event, timeWindow, ask, domain, sourceText: source };
  }
  function detectAngle(text) {
    const source = String(text || '');
    for (const [pattern, name] of ANGLES) {
      if (pattern.test(source)) return name;
    }
    return '';
  }
  function isGreeting(text) {
    return /^(你好|您好|嗨|hi|hello|在吗|谢谢|多谢|好的|嗯+|哦|再见)[!！。.…?\s]*$/i.test(String(text || '').trim());
  }
  function isReadingOffer(text) {
    const source = String(text || '').replace(/\s+/g, '');
    if (extractMatter(source).event) return false;
    return /^(?:你好|您好)?[，,。！!]?我?(?:想|要)?算(?:一)?个?命[。！!？?]*$/.test(source)
      || /^帮我算命[。！!？?]*$/.test(source);
  }
  function isYearOverview(text) {
    const source = String(text || '').trim();
    if (extractMatter(source).event) return false;
    return /看今年|今年整体|这一年|整体走势|看看自己/.test(source);
  }
  function isExplicitReading(text) {
    if (isReadingOffer(text) || isYearOverview(text)) return false;
    return /考试|六级|四级|考研|雅思|托福|概率|能过|通过吗|看盘|排盘|运势|紫微|奇门|命盘/.test(String(text || ''));
  }
  function isOpenChoice(text) {
    return /要不要|去不去|该不该/.test(String(text || '')) && !isExplicitReading(text);
  }
  function matterFromHistory(history) {
    let found = null;
    for (const item of history || []) {
      if (!item || item.speaker !== 'user') continue;
      const extracted = extractMatter(item.content);
      if (extracted.event) found = extracted;
    }
    return found;
  }
  function sameMatter(left, right) {
    return Boolean(left && right && left.event && left.event === right.event && left.timeWindow === right.timeWindow);
  }
  function looksLikeFollowUp(text) {
    return /临场|发挥|准备|依据|盘|星|门|宫|怎么看|再看|还有|具体|直白|算命|命理|换个说法|再说|能过|通过|概率|希望/.test(String(text || ''));
  }
  function planFor(hasSnapshot, recast, same) {
    return hasSnapshot && same && !recast ? 'reuse' : 'cast';
  }

  function resolveTurn(input) {
    const text = String(input && input.text || '').trim();
    const history = input && input.history || [];
    const hasSnapshot = Boolean(input && input.hasSnapshot);
    const recast = Boolean(input && input.recast);
    const mentions = input && input.mentions || [];
    const specialist = Boolean(input && (input.specialist || input.action === 'invite' || mentions.includes('ziwei') || mentions.includes('qimen')));
    const prior = matterFromHistory(history);
    const extracted = extractMatter(text);
    const angle = detectAngle(text);
    const inherited = !extracted.event && prior && prior.event ? prior : null;

    if (!text) return { plan: 'none', task: 'chat', angle: '', matter: prior, chartText: '' };
    if (isGreeting(text)) return { plan: 'none', task: 'chat', angle: '', matter: prior, chartText: '' };
    if (isReadingOffer(text)) return { plan: 'none', task: 'offer', angle: '', matter: prior, chartText: '' };
    if (isYearOverview(text)) {
      const matter = {
        subject: '用户本人',
        event: '这一年的整体走势',
        timeWindow: '今年',
        ask: '整体倾向',
        domain: '',
        sourceText: text
      };
      return {
        plan: planFor(hasSnapshot, recast, prior && prior.event === matter.event),
        task: 'read',
        angle: angle || 'default',
        matter,
        chartText: text
      };
    }

    if (inherited && angle) {
      return {
        plan: planFor(hasSnapshot, recast, true),
        task: 'revise',
        angle,
        matter: inherited,
        chartText: inherited.sourceText
      };
    }
    if (inherited && looksLikeFollowUp(text)) {
      return {
        plan: planFor(hasSnapshot, recast, true),
        task: 'read',
        angle: 'default',
        matter: inherited,
        chartText: inherited.sourceText
      };
    }
    if (extracted.event || isExplicitReading(text)) {
      const matter = extracted.event ? extracted : { ...extracted, event: '所问之事', sourceText: text };
      return {
        plan: planFor(hasSnapshot, recast, sameMatter(prior, matter)),
        task: 'read',
        angle: angle || 'default',
        matter,
        chartText: matter.sourceText || text
      };
    }
    if (isOpenChoice(text) && !specialist && !hasSnapshot && !recast) {
      return { plan: 'none', task: 'ask', angle: 'default', matter: extracted, chartText: text };
    }
    const priorUser = [...history].reverse().find((item) => item && item.speaker === 'user');
    if (priorUser && isOpenChoice(priorUser.content) && !isGreeting(text)) {
      const choice = extractMatter(priorUser.content);
      return {
        plan: planFor(hasSnapshot, recast, false),
        task: 'read',
        angle: angle || 'default',
        matter: { ...choice, event: choice.event || '这个选择' },
        chartText: priorUser.content
      };
    }
    if (specialist) {
      const matter = inherited || (extracted.event ? extracted : { ...extracted, event: '所问之事', sourceText: text });
      return {
        plan: planFor(hasSnapshot, recast, Boolean(inherited)),
        task: angle ? 'revise' : 'read',
        angle: angle || 'default',
        matter,
        chartText: inherited ? inherited.sourceText : text
      };
    }
    return { plan: 'none', task: 'chat', angle: angle || '', matter: prior, chartText: '' };
  }

  function claimsUngroundedChart(text) {
    return /看了一圈|看过你的盘|看了你的盘|你的盘面|盘面显示|盘面上/.test(String(text || ''));
  }
  function asksPrepPrerequisite(text) {
    return /复习了多久|备考时长|模拟成绩|每天花|准备进度|之前的英语成绩|花多少时间/.test(String(text || ''));
  }
  function inventsPercent(text) {
    return /\d+\s*%|百分之\s*\d+|通过率\s*\d+|命中率\s*\d+/.test(String(text || ''));
  }
  const PALACES = [
    ['1', [/1\s*宫/, /一宫/, /坎宫/, /坎一/]],
    ['2', [/2\s*宫/, /二宫/, /坤宫/, /坤二/]],
    ['3', [/3\s*宫/, /三宫/, /震宫/, /震三/]],
    ['4', [/4\s*宫/, /四宫/, /巽宫/, /巽四/]],
    ['5', [/5\s*宫/, /五宫/, /中宫/]],
    ['6', [/6\s*宫/, /六宫/, /乾宫/, /乾六/]],
    ['7', [/7\s*宫/, /七宫/, /兑宫/, /兑七/]],
    ['8', [/8\s*宫/, /八宫/, /艮宫/, /艮八/]],
    ['9', [/9\s*宫/, /九宫/, /离宫/, /离九/]]
  ];
  const CHART_NAMES = ['天蓬', '天任', '天冲', '天辅', '天英', '天芮', '天柱', '天心', '天禽', '开门', '休门', '生门', '伤门', '杜门', '景门', '死门', '惊门', '值符', '腾蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天', '勾陈', '朱雀', '文昌', '文曲', '化禄', '化权', '化科', '化忌', '大格', '战格', '小格', '伏吟', '反吟', '庚加庚'];
  function evidenceBlob(evidence) {
    return (evidence || []).map((item) => String(item && item.label || '') + String(item && item.fact || '')).join('\n');
  }
  function asserted(sentence, name) {
    const index = sentence.indexOf(name);
    if (index < 0) return false;
    const before = sentence.slice(Math.max(0, index - 8), index);
    return !/如|没有|未|缺乏|不详|看不了|无法|不能|勿|别|不要/.test(before);
  }
  function palaceHits(fragment) {
    return PALACES.filter(([, patterns]) => patterns.some((pattern) => pattern.test(fragment))).map(([num]) => num);
  }
  function inventedChartTerms(text, evidence) {
    const body = String(text || '');
    const blob = evidenceBlob(evidence);
    const found = [];
    const allowed = new Set(palaceHits(blob));
    for (const [num, patterns] of PALACES) {
      if (allowed.has(num)) continue;
      if (patterns.some((pattern) => pattern.test(body))) found.push(num + '宫');
    }
    const gengClash = /天盘\s*庚/.test(blob) && /地盘\s*庚/.test(blob);
    const sentences = body.split(/[。！？\n]/);
    for (const name of CHART_NAMES) {
      if (blob.includes(name)) continue;
      if ((name === '庚加庚' || name === '大格' || name === '战格') && gengClash) continue;
      if (sentences.some((sentence) => asserted(sentence, name))) found.push(name);
    }
    for (const item of evidence || []) {
      const source = String(item && item.label || '') + String(item && item.fact || '');
      const own = (source.match(/([1-9])\s*宫/) || [])[1];
      if (!own) continue;
      const subjects = CHART_NAMES.filter((name) => source.includes(name));
      for (const sentence of sentences) {
        for (const subject of subjects) {
          const index = sentence.indexOf(subject);
          if (index < 0 || !asserted(sentence, subject)) continue;
          const window = sentence.slice(index, index + subject.length + 16);
          for (const num of palaceHits(window)) {
            if (num !== own) found.push(subject + '不在' + num + '宫');
          }
        }
      }
    }
    return [...new Set(found)];
  }
  function repeatsPrior(previous, next) {
    const left = String(previous || '').replace(/\s+/g, '');
    const right = String(next || '').replace(/\s+/g, '');
    if (left.length < 40 || right.length < 40) return false;
    let hit = 0;
    let total = 0;
    for (let i = 0; i + 20 <= right.length; i += 20) {
      total += 1;
      if (left.includes(right.slice(i, i + 20))) hit += 1;
    }
    return total > 0 && hit / total >= 0.6;
  }

  return { resolveTurn, extractMatter, detectAngle, claimsUngroundedChart, asksPrepPrerequisite, inventsPercent, repeatsPrior, inventedChartTerms };
});
