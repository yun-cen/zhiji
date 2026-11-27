'use strict';

const { chart } = require('../linger/chart.cjs');
const { inferDomain } = require('../lab/chart-core.js');
const { resolveTurn, inventedChartTerms, inventsPercent, asksPrepPrerequisite } = require('../app/turn.js');

const RULE_VERSION = '2026-11-26.1';
const SCHOOL = '紫微用 iztro 起本命；奇门用 3meta 按问事时刻起局。时辰不详不排命宫、身宫、四化、大限。';

const CASES = [
  {
    id: 'cet-unknown',
    title: '时辰不详的六级',
    input: { date: '1998-03-12', gender: '女', timeMode: 'unknown', question: '下个月我会参加英语六级考试。我通过的概率大吗？' },
    expectDomain: 'study',
    support: ['奇门按问事时刻取景门', '紫微写明这一层未排'],
    limit: ['不出现命宫主星', '起局日不写成下个月的考试日'],
    accept: '偏有利、阻力偏多、利弊相抵或依据不足。不写通过率数字。'
  },
  {
    id: 'cet-exact',
    title: '时辰明确的六级',
    input: { date: '1990-06-15', gender: '男', timeMode: 'exact', time: 6, question: '下个月英语六级能过吗？' },
    expectDomain: 'study',
    support: ['学业宫位在盘上', '文昌或文曲若被排进依据就带编号'],
    limit: ['单见文昌或文曲不能写成一定能过'],
    accept: '结论可以停在学习或表达的倾向。'
  },
  {
    id: 'offer-open',
    title: '还没说清的选择',
    routeOnly: true,
    input: { question: '拿到一个异地 offer，要不要去？' },
    support: ['先问最在意什么'],
    limit: ['这一轮不起盘，也不声称看过盘'],
    accept: '只追问一件取舍。'
  }
];

function castInput(input) {
  return chart({
    date: input.date,
    gender: input.gender,
    question: input.question,
    time: input.timeMode === 'exact' ? input.time : undefined,
    fuzzy: input.timeMode === 'fuzzy' ? input.fuzzy : undefined
  });
}
function sameSnapshot(items) {
  const ids = items.map((item) => item.id);
  const ziwei = items.filter((item) => item.system === 'ziwei').map((item) => item.id);
  const qimen = items.filter((item) => item.system === 'qimen').map((item) => item.id);
  const joined = [...ziwei, ...qimen].sort().join(',');
  return ziwei.length > 0 && qimen.length > 0 && joined === [...ids].sort().join(',');
}
function evaluateStructure() {
  return CASES.map((item) => {
    const checks = [];
    if (item.routeOnly) {
      const turn = resolveTurn({ text: item.input.question, history: [], hasSnapshot: false });
      checks.push({ name: '先问取舍，不起盘', ok: turn.task === 'ask' && turn.plan === 'none' });
      return { id: item.id, title: item.title, support: item.support, limit: item.limit, accept: item.accept, checks, pass: checks.every((check) => check.ok) };
    }
    const pack = castInput(item.input);
    const domain = inferDomain(item.input.question);
    checks.push({ name: '领域对上学业', ok: domain === item.expectDomain, detail: domain });
    if (item.input.timeMode === 'unknown') {
      const ziwei = pack.evidence.filter((entry) => entry.system === 'ziwei');
      checks.push({
        name: '时辰不详不排命宫主星',
        ok: ziwei.some((entry) => /未排/.test(entry.fact)) && !ziwei.some((entry) => /主星/.test(entry.fact))
      });
    } else {
      checks.push({
        name: '时辰明确时带上文昌或文曲',
        ok: pack.evidence.some((entry) => /文昌|文曲/.test(entry.label + entry.fact))
      });
    }
    if (item.expectDomain === 'study') {
      checks.push({ name: '学业取景门', ok: pack.evidence.some((entry) => entry.system === 'qimen' && /景门/.test(entry.label + entry.fact)) });
    }
    const facts = pack.evidence.map((entry) => entry.fact).join('');
    checks.push({ name: '起局日不是题目里的下个月', ok: /^\d{4}-\d{2}-\d{2}/.test(pack.castAt) && !facts.includes('下个月') });
    checks.push({ name: '紫微和奇门来自同一张盘', ok: sameSnapshot(pack.evidence) });
    return {
      id: item.id,
      title: item.title,
      support: item.support,
      limit: item.limit,
      accept: item.accept,
      castAt: pack.castAt,
      timeMode: pack.timeMode,
      checks,
      pass: checks.every((check) => check.ok)
    };
  });
}
function gradeReply(text, evidence, timeMode, castAt) {
  const problems = [];
  if (inventedChartTerms(text, evidence).length) problems.push('引用了快照里没有的星或宫');
  if (inventsPercent(text)) problems.push('写出了数值概率');
  if (asksPrepPrerequisite(text)) problems.push('把复习时长当成前提');
  if (timeMode === 'unknown' && /命宫(主星|在|有)/.test(text) && !/未排|看不了|不能/.test(text)) problems.push('时辰不详却断了命宫');
  const day = String(castAt || '').slice(0, 10);
  if (day && text.includes(day) && /考试日/.test(text)) problems.push('把起局日当成了考试日');
  const ids = new Set((evidence || []).map((item) => item.id));
  const used = [...String(text).matchAll(/\[(E\d+)\]/g)].map((match) => match[1]);
  if (!used.length || used.some((id) => !ids.has(id))) problems.push('没有引用这张盘上的编号');
  return { ok: problems.length === 0, problems };
}
function examFixture() {
  const item = CASES[0];
  const pack = castInput(item.input);
  return {
    question: item.input.question,
    followUp: '仅从算命的角度回答。',
    castAt: pack.castAt,
    timeMode: pack.timeMode,
    evidence: pack.evidence.map((entry) => ({
      id: entry.id, system: entry.system, label: entry.label, fact: entry.fact, stability: entry.stability
    }))
  };
}

module.exports = { RULE_VERSION, SCHOOL, CASES, evaluateStructure, gradeReply, examFixture };

if (require.main === module) {
  const rows = evaluateStructure();
  const failed = rows.filter((row) => !row.pass);
  if (failed.length) {
    console.error(JSON.stringify(failed, null, 2));
    process.exit(1);
  }
  console.log('CASE_OK ' + rows.length);
}
