'use strict';

const { readFileSync } = require('node:fs');
globalThis.self = globalThis; // The bundled iztro browser build expects the self alias.

const { buildFacts, buildEvidence, inferDomain, bandById } = require('../lab/chart-core');

function chart({ date, gender, time, fuzzy, question }) {
  const birth = new Date(date + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(+birth) ||
      birth.toISOString().slice(0, 10) !== date || date < '1900-01-01' ||
      date > new Date().toLocaleDateString('sv-SE')) throw Error('请提供有效的公历出生日期。');
  if (!['男', '女'].includes(gender)) throw Error('请确认排盘使用的性别。');
  if (typeof question !== 'string' || !question.trim()) throw Error('请提供要问的事。');
  if (fuzzy != null && !bandById(fuzzy)) throw Error('无法识别模糊时段。');
  if (time != null && (fuzzy != null || !Number.isInteger(time) || time < 0 || time > 12)) {
    throw Error('确切时辰用 0 至 12 的整数，与模糊时段二选一。');
  }
  const timeMode = time != null ? 'exact' : fuzzy != null ? 'fuzzy' : 'unknown';
  const pack = buildFacts({ date, gender, time, fuzzy, timeMode }, inferDomain(question));
  return { castAt: pack.qimen.facts.castAt, timeMode, guide: pack.facts.readingGuide,
    evidence: buildEvidence(pack).items };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(chart(JSON.parse(readFileSync(0, 'utf8')))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { chart };
