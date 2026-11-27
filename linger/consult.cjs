'use strict';

const { readFileSync } = require('node:fs');
const { chart } = require('./chart.cjs');
const roles = require('./roles.cjs');

async function consult(input) {
  const role = input.role || '知几分身';
  if (!Object.hasOwn(roles, role)) throw Error('请选择知几分身、紫微先生或奇门先生。');
  const { evidence, ...meta } = chart(input);
  const items = evidence.filter(item => role === '知几分身' ||
    item.system === (role === '紫微先生' ? 'ziwei' : 'qimen'));
  const response = await fetch('http://127.0.0.1:1234/api/v1/chat', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen/qwen3.5-9b', reasoning: 'off', store: false, max_output_tokens: 1000,
      system_prompt: roles[role] + '仅据本次提供的依据，在关键句后标 [E编号]。用简短中文回答。传统取象只作反思。',
      input: JSON.stringify({ question: input.question, ...meta, evidence: items })
    })
  });
  if (!response.ok) throw Error('本机 LM Studio 返回 ' + response.status);
  const result = await response.json();
  const content = result.output?.find(item => item.type === 'message')?.content?.trim();
  if (!content) throw Error('本机模型未生成完整正文。');
  return { role, model: result.model_instance_id, content, evidence: items };
}

consult(JSON.parse(readFileSync(0, 'utf8'))).then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
