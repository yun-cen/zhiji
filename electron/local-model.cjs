'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { systemPrompt, rewriteNote } = require('./prompts.cjs');
const { claimsUngroundedChart, asksPrepPrerequisite, inventsPercent, repeatsPrior, inventedChartTerms } = require('../app/turn.js');

const MODEL = 'qwen/qwen3.5-9b';
const CHAT_URL = 'http://127.0.0.1:1234/api/v1/chat';
const MODELS_URL = 'http://127.0.0.1:1234/api/v1/models';
const ROLE_KEY = { zhiji: '知几', ziwei: '紫微', qimen: '奇门' };

for (const url of [CHAT_URL, MODELS_URL]) {
  const host = new URL(url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('本地模型只能走本机回环地址。');
  }
}

function evidenceFor(roleId, items) {
  const list = Array.isArray(items) ? items : [];
  const plain = list.filter((item) => item && item.id && item.fact).slice(0, 40);
  if (roleId === 'ziwei') return plain.filter((item) => item.system === 'ziwei');
  if (roleId === 'qimen') return plain.filter((item) => item.system === 'qimen');
  return plain;
}
function taskOf(input) {
  if (input && input.task) return input.task;
  if (input && input.mode === 'ask') return 'ask';
  if (input && input.mode === 'summarize') return 'summarize';
  if (input && input.mode === 'chat') return 'chat';
  if (input && input.mode === 'revise') return 'revise';
  return 'read';
}
function matterOf(input) {
  const matter = input && input.matter;
  if (!matter || typeof matter !== 'object') return null;
  return {
    subject: String(matter.subject || '').slice(0, 40),
    event: String(matter.event || '').slice(0, 40),
    timeWindow: String(matter.timeWindow || '').slice(0, 40),
    ask: String(matter.ask || '').slice(0, 40),
    domain: String(matter.domain || '').slice(0, 40),
    sourceText: String(matter.sourceText || '').slice(0, 400)
  };
}
function qualityReasons(text, input) {
  const reasons = [];
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const task = input.task;
  const domain = input.matter && input.matter.domain;
  if (!evidence.length && claimsUngroundedChart(text)) reasons.push('claim');
  if ((task === 'read' || task === 'revise' || task === 'summarize') && repeatsPrior(input.previousAnswer, text)) reasons.push('repeat');
  if ((domain === 'study' || input.angle === 'fortune') && (task === 'read' || task === 'revise') && asksPrepPrerequisite(text)) reasons.push('prep');
  if ((task === 'read' || task === 'revise' || task === 'summarize') && inventsPercent(text)) reasons.push('percent');
  if (evidence.length && (task === 'read' || task === 'revise')) {
    const ids = new Set(evidence.map((item) => item && item.id));
    const used = [...String(text).matchAll(/\[(E\d+)\]/g)].map((match) => match[1]);
    if (!used.length || used.some((id) => !ids.has(id))) reasons.push('cite');
    if (inventedChartTerms(text, evidence).length) reasons.push('invented');
  }
  return reasons;
}
function withoutInventedSentences(text, evidence) {
  const sentences = String(text || '').split(/(?<=[。！？])/);
  const kept = sentences.filter((sentence) => !inventedChartTerms(sentence, evidence).length);
  const next = kept.join('').trim();
  if (next.length >= 24 && /\[E\d+\]/.test(next)) return next;
  return '';
}
function evidenceOnlyAnswer(matter, evidence, task) {
  const event = matter && matter.event ? matter.event : '这件事';
  const span = matter && matter.timeWindow ? matter.timeWindow : '';
  const ziwei = evidence.find((item) => item.system === 'ziwei') || evidence[0];
  const qimen = evidence.find((item) => item.system === 'qimen') || evidence[0];
  if (task === 'revise') {
    return '按你这一轮的要求，只谈命理，不再追问准备过程。' + span + event + '仍不能收成稳过或过不了。时辰这一层是 [' + ziwei.id + ']，问事的盘是 [' + qimen.id + ']。';
  }
  const bits = evidence.map((item) => '[' + item.id + '] ' + String(item.fact || '').replace(/\s+/g, '')).join('');
  return '只按这次排出的依据，' + span + event + '还不能收成稳过或过不了。' + bits;
}
const NO_CHART = '这一轮没有取到盘，我不能说已经看过。出生资料齐了，就可以按这件事起盘。';

function routeOf(route) {
  const provider = route && route.provider === 'api' ? 'api' : 'local';
  return {
    provider,
    model: String(route && route.model || MODEL),
    effort: route && route.effort === 'careful' ? 'careful' : 'fast',
    apiBase: String(route && route.apiBase || '').trim(),
    apiModel: String(route && route.apiModel || '').trim(),
    apiKey: String(route && route.apiKey || '')
  };
}
function allowedApiBase(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
}
function classifyStream({ text, finishReason, failed }) {
  const body = String(text || '');
  if (failed === 'stopped') return { ok: false, code: 'stopped', text: body, finish: 'stopped' };
  if (finishReason === 'length') return { ok: false, code: 'length', text: body, finish: 'length' };
  if (failed === 'timeout') {
    return body
      ? { ok: false, code: 'interrupted', text: body, finish: 'interrupted' }
      : { ok: false, code: 'timeout', text: '', finish: 'timeout' };
  }
  if (failed) {
    return body
      ? { ok: false, code: 'interrupted', text: body, finish: 'interrupted' }
      : { ok: false, code: 'nostream', text: '', finish: 'interrupted' };
  }
  if (!body) return { ok: false, code: 'nostream', text: '', finish: '' };
  return { ok: true, text: body, finish: 'stop' };
}
function tokenBudget(task, evidence) {
  if (task === 'chat' || task === 'ask' || task === 'offer') return 260;
  if (task === 'summarize') return 1100;
  const systems = new Set((evidence || []).map((item) => item && item.system).filter(Boolean));
  if (systems.has('ziwei') && systems.has('qimen')) return 1800;
  return 1100;
}
function abortKind(signal) {
  if (!signal || !signal.aborted) return '';
  return signal.reason === 'user' ? 'stopped' : 'timeout';
}
async function readStream(response, onDelta, signal, nativeLimit) {
  const reader = response.body && response.body.getReader ? response.body.getReader() : null;
  if (!reader) return { ok: false, code: 'nostream' };
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finishReason = '';
  let usage = null;
  let modelId = '';
  const settle = (failed) => {
    const result = classifyStream({ text, finishReason, failed });
    if (usage) result.usage = usage;
    if (modelId) result.model = modelId;
    return result;
  };
  try {
    for (;;) {
      if (signal && signal.aborted) return settle(abortKind(signal));
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let json;
        try { json = JSON.parse(data); } catch { continue; }
        if (nativeLimit) {
          if (json.type === 'error') return { ...settle('interrupted'), ok: false, code: 'model', message: String(json.error?.message || json.message || '本地生成失败。') };
          if (json.type === 'message.delta' && json.content) {
            text += json.content;
            onDelta(json.content);
          }
          if (json.type === 'chat.end') {
            const result = json.result || {};
            modelId = result.model_instance_id || modelId;
            const stats = result.stats || {};
            usage = { prompt_tokens: stats.input_tokens, completion_tokens: stats.total_output_tokens };
            finishReason = stats.total_output_tokens >= nativeLimit ? 'length' : 'stop';
          }
          continue;
        }
        if (json.usage) usage = json.usage;
        if (json.model) modelId = String(json.model);
        const choice = json.choices && json.choices[0];
        if (choice && choice.finish_reason) finishReason = choice.finish_reason;
        const piece = choice && choice.delta && choice.delta.content;
        if (!piece) continue;
        text += piece;
        onDelta(piece);
      }
    }
  } catch {
    return settle(abortKind(signal) || 'interrupted');
  }
  return settle(abortKind(signal) || (!finishReason && nativeLimit ? 'interrupted' : ''));
}
async function completeStream(url, token, model, system, payload, maxTokens, onDelta, options) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      redirect: 'error',
      signal: callSignal(options),
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.4,
        max_tokens: maxTokens,
        ...(options && options.reasoning ? { reasoning: options.reasoning } : {}),
        ...(options && options.includeUsage ? { stream_options: { include_usage: true } } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payload) }
        ]
      })
    });
  } catch (error) {
    const kind = abortKind(options && options.signal);
    if (kind === 'stopped') return { ok: false, code: 'stopped', text: '', finish: 'stopped' };
    if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return { ok: false, code: 'timeout', text: '', finish: 'timeout' };
    }
    return { ok: false, code: 'nostream' };
  }
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/event-stream')) return { ok: false, code: 'nostream' };
  const streamed = await readStream(response, onDelta, options && options.signal);
  if (!streamed.model) streamed.model = model;
  return streamed;
}
function callSignal(options) {
  const timeout = AbortSignal.timeout(240000);
  if (options && options.signal) return AbortSignal.any([timeout, options.signal]);
  return timeout;
}
function streamOptions(route, options) {
  return {
    signal: options && options.signal,
    includeUsage: true,
    reasoning: route && route.provider !== 'api' ? (route.effort === 'careful' ? 'low' : 'off') : undefined
  };
}
async function complete(system, payload, maxTokens, route, onDelta, options) {
  const chosen = routeOf(route);
  if (chosen.provider === 'api') return completeApi(system, payload, maxTokens, chosen, onDelta, options);
  return completeLocal(system, payload, maxTokens, chosen, onDelta, options);
}
async function completeLocal(system, payload, maxTokens, route, onDelta, options) {
  let response;
  const signal = callSignal(options);
  try {
    response = await fetch(CHAT_URL, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: route.model || MODEL,
        reasoning: route.effort === 'careful' ? 'on' : 'off',
        stream: Boolean(onDelta),
        store: false,
        max_output_tokens: maxTokens,
        system_prompt: system,
        input: JSON.stringify(payload)
      })
    });
  } catch (error) {
    if (abortKind(options && options.signal) === 'stopped') return { ok: false, code: 'stopped', text: '', finish: 'stopped' };
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return timedOut
      ? { ok: false, code: 'timeout', message: '本机模型想了太久。问题和这张盘还在，可以重试。' }
      : { ok: false, code: 'offline', message: '本地模型没有应答。可以先启动它，再重试。不会自动改用云端。' };
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const reason = data.error?.message || data.message || (typeof data.error === 'string' ? data.error : '');
    return { ok: false, code: 'model', message: '本机模型 ' + route.model + ' 返回 ' + response.status + '。' + String(reason).slice(0, 240) };

  }
  if (onDelta && response.headers.get('content-type')?.includes('text/event-stream')) {
    const reply = await readStream(response, onDelta, signal, maxTokens);
    if (!reply.ok && !reply.message) reply.message = reply.code === 'length' ? '模型已达到本轮输出上限。' : '本地生成未完成，可重试当前问题。';
    return reply;
  }
  const result = await response.json().catch(() => null);
  const content = result && result.output && result.output.find((item) => item.type === 'message');
  const text = content && String(content.content || '').trim();
  if (!text) return { ok: false, code: 'empty', message: '本机模型没有写完。可以重试，盘面还在。' };
  return { ok: true, text, model: result.model_instance_id || route.model || MODEL };
}
async function completeApi(system, payload, maxTokens, route, onDelta, options) {
  if (!allowedApiBase(route.apiBase)) {
    return { ok: false, code: 'api', message: '接口地址只接受 https，或本机的 http://127.0.0.1。' };
  }
  if (!route.apiKey || !route.apiModel) {
    return { ok: false, code: 'api', message: '自带 API 还缺密钥或模型名。本地失败时不会自动改用云端。' };
  }
  const endpoint = route.apiBase.replace(/\/$/, '') + '/v1/chat/completions';
  if (onDelta) {
    const streamed = await completeStream(endpoint, route.apiKey, route.apiModel, system, payload, maxTokens, onDelta, streamOptions({ provider: 'api', effort: route.effort }, options));
    if (streamed.code !== 'nostream') return streamed;
  }
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: callSignal(options),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + route.apiKey },
      body: JSON.stringify({
        model: route.apiModel,
        max_tokens: route.effort === 'careful' ? Math.max(maxTokens, 800) : maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payload) }
        ]
      })
    });
  } catch (error) {
    if (abortKind(options && options.signal) === 'stopped') return { ok: false, code: 'stopped', text: '', finish: 'stopped' };
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return { ok: false, code: timedOut ? 'timeout' : 'api', message: timedOut ? '云端接口想了太久。没有改回本地。' : '云端接口没有连上。没有改用别的地址。' };
  }
  if (!response.ok) return { ok: false, code: 'api', message: '云端接口返回 ' + response.status + '。没有自动换模型。' };
  const result = await response.json().catch(() => null);
  const text = result && result.choices && result.choices[0] && result.choices[0].message && String(result.choices[0].message.content || '').trim();
  if (!text) return { ok: false, code: 'empty', message: '云端接口没有写完。' };
  return { ok: true, text, model: route.apiModel };
}

async function speak(input) {
  const roleId = input && input.roleId;
  if (!ROLE_KEY[roleId]) return { ok: false, code: 'bad', message: '没有这个角色。' };
  const task = taskOf(input);
  const grounded = task === 'read' || task === 'revise' || task === 'summarize';
  const evidence = grounded ? evidenceFor(roleId, input.evidence) : [];
  const matter = matterOf(input);
  const angle = String(input && input.angle || '');
  const previousAnswer = String(input && input.previousAnswer || '');
  const history = (Array.isArray(input.history) ? input.history : []).slice(-8).map((item) => {
    const speaker = String(item && item.speaker || 'user');
    const content = String(item && item.content || '');
    if (speaker === 'user') return { speaker, content: content.slice(0, 400) };
    return { speaker, content: content.slice(0, 60) + (content.length > 60 ? '…' : '') };
  });
  const payload = {
    question: String(input.question || '').slice(0, 600),
    matter,
    angle: angle || null,
    task,
    alreadySaid: previousAnswer ? previousAnswer.slice(-900) : null,
    history,
    castAt: grounded ? (input.castAt || null) : null,
    timeMode: grounded ? (input.timeMode || null) : null,
    guide: grounded ? (input.guide || null) : null,
    evidence,
    peers: Array.isArray(input.peers) ? input.peers.slice(0, 3).map((peer) => ({
      name: String(peer.name || ''),
      content: String(peer.content || '').slice(0, 500)
    })) : null
  };
  const system = systemPrompt({
    roleId,
    task,
    angle,
    matter,
    timeMode: payload.timeMode,
    preference: input.preference
  });
  const route = routeOf(input && input.route);
  const maxTokens = tokenBudget(task, evidence);
  const options = { signal: input && input.signal };
  let first = await complete(system, payload, maxTokens, route, input && input.onDelta, options);
  if (first.code === 'length' && first.text && abortKind(input && input.signal) !== 'stopped') {
    const continued = await complete(
      system + '\n\n上一截因为长度停了。请从最后一个字接着写完，不要重写前面。',
      { ...payload, alreadySaid: first.text.slice(-900) },
      maxTokens,
      route,
      input && input.onDelta,
      options
    );
    const joined = first.text + (continued.text || '');
    first = continued.ok
      ? { ok: true, text: joined, continued: true, model: continued.model || first.model, finish: 'stop', usage: continued.usage || first.usage || null }
      : { ...continued, ok: false, text: joined, model: continued.model || first.model, usage: continued.usage || first.usage || null };
  }
  const pack = (result) => ({
    ok: Boolean(result.ok),
    code: result.ok ? undefined : result.code,
    content: result.text || '',
    message: result.message,
    model: result.model || route.model,
    evidence,
    finish: result.finish || (result.ok ? 'stop' : result.code),
    channel: route.provider,
    usage: result.usage || null
  });
  if (!first.ok) return pack(first);
  let text = first.text;
  if (evidence.length && inventedChartTerms(text, evidence).length) {
    const trimmed = withoutInventedSentences(text, evidence);
    if (trimmed) text = trimmed;
  }
  const reasons = qualityReasons(text, { task, angle, matter, previousAnswer, evidence });
  if (reasons.length && !first.continued) {
    const invented = inventedChartTerms(text, evidence);
    const second = await complete(system + '\n\n' + rewriteNote(reasons, previousAnswer, invented), payload, maxTokens, route, null, options);
    if (second.ok && second.text) text = second.text;
    if (!evidence.length && claimsUngroundedChart(text)) text = NO_CHART;
    else if (evidence.length && inventedChartTerms(text, evidence).length) {
      text = withoutInventedSentences(text, evidence) || evidenceOnlyAnswer(matter, evidence, task);
    }
  }
  return pack({ ok: true, text, model: first.model, finish: 'stop', usage: first.usage || null });
}

async function modelStatus(modelId) {
  const id = modelId || MODEL;
  try {
    const response = await fetch(MODELS_URL, { redirect: 'error', signal: AbortSignal.timeout(2000) });
    if (!response.ok) return { ok: false, ready: false, model: id, loadedIds: [] };
    const data = await response.json();
    const models = (data.models || []).filter(item => item.type === 'llm');
    const loadedIds = models.flatMap(item => (item.loaded_instances || []).flatMap(instance => [item.key, instance.id]));
    return { ok: true, ready: loadedIds.includes(id), model: id, loadedIds: [...new Set(loadedIds)] };
  } catch {
    return { ok: false, ready: false, model: id, loadedIds: [] };
  }
}
function runCapture(command, args, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    let out = '';
    let err = '';
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      resolve({ code: 1, out: '' });
      return;
    }
    child.stdout.on('data', (buf) => { out += buf; });
    child.stderr.on('data', buf => { err = (err + buf).slice(-1200); });
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: 124, out, err });
    }, timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: 1, out });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code == null ? 1 : code, out, err });
    });
  });
}
async function listLocalModels() {
  const lms = lmsPath();
  if (!lms) return { ok: false, models: [], message: '没有找到 LM Studio。' };
  const listed = await runCapture(lms, ['ls', '--json'], 8000);
  const running = await runCapture(lms, ['ps', '--json'], 8000);
  let downloaded = [];
  let loaded = [];
  try { downloaded = JSON.parse(listed.out || '[]'); } catch { downloaded = []; }
  try { loaded = JSON.parse(running.out || '[]'); } catch { loaded = []; }
  const loadedKeys = new Set(loaded.flatMap((item) => [item.modelKey, item.identifier, item.path, item.id].filter(Boolean)));
  const models = (Array.isArray(downloaded) ? downloaded : [])
    .filter((item) => item && item.type === 'llm' && item.modelKey)
    .map((item) => ({
      id: item.modelKey,
      name: item.displayName || item.modelKey,
      params: item.paramsString || '',
      quant: item.quantization && item.quantization.name || '',
      bytes: item.sizeBytes || 0,
      downloaded: true,
      loaded: loadedKeys.has(item.modelKey) || loadedKeys.has(item.path)
    }));
  return { ok: true, models };
}
function previewSend(input, route) {
  const chosen = routeOf(route);
  const evidence = Array.isArray(input && input.evidence) ? input.evidence.slice(0, 12).map((item) => ({
    id: item.id, fact: String(item.fact || '').slice(0, 180)
  })) : [];
  return {
    provider: chosen.provider,
    where: chosen.provider === 'api' ? '云端' : '本地',
    endpoint: chosen.provider === 'api'
      ? (chosen.apiBase ? chosen.apiBase.replace(/\/$/, '') + '/v1/chat/completions' : '还没有填写地址')
      : CHAT_URL,
    model: chosen.provider === 'api' ? (chosen.apiModel || '还没有填写模型名') : chosen.model,
    willSend: {
      question: String(input && input.question || '').slice(0, 600),
      history: (Array.isArray(input && input.history) ? input.history : []).slice(-4).map((item) => ({
        speaker: item.speaker, content: String(item.content || '').slice(0, 120)
      })),
      evidence
    }
  };
}
async function testApi(route) {
  const started = Date.now();
  const result = await completeApi('只回答两个字。', { question: '只回复：已通' }, 40, routeOf(route));
  return { ...result, ms: Date.now() - started };
}

function lmsPath() {
  const candidate = path.join(os.homedir(), '.lmstudio', 'bin', 'lms');
  return fs.existsSync(candidate) ? candidate : null;
}
async function startLocalModel(modelId) {
  const id = modelId || MODEL;
  const initial = await modelStatus(id);
  if (initial.ready) return { ok: true, model: id, message: '本地模型已就绪。' };
  const lms = lmsPath();
  if (!lms) return { ok: false, message: '找不到 LM Studio 的 lms 命令行，请在 LM Studio 启用本地服务。' };
  if (!initial.ok) {
    await runCapture(lms, ['server', 'start', '--port', '1234'], 45000);
    if (!(await modelStatus(id)).ok) return { ok: false, message: 'LM Studio 服务未能在本机 1234 端口启动。' };
  }
  const result = await runCapture(lms, ['load', id, '--context-length', '16384', '--parallel', '1', '-y'], 180000);
  const status = await modelStatus(id);
  if (status.ready) return { ok: true, model: id, message: '本地模型已就绪。' };
  const reason = result.code === 124 ? '加载超时' : (result.err || result.out || '未发现已加载实例').trim().slice(-320);
  return { ok: false, model: id, message: id + ' 加载失败：' + reason };
}

module.exports = { speak, modelStatus, startLocalModel, listLocalModels, previewSend, testApi, qualityReasons, classifyStream, readStream, tokenBudget, MODEL, CHAT_URL };
