import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const KEY_FILE = process.env.ZHIPU_KEY_FILE || '/tmp/zhiji_api_key';
const MODEL = process.env.ZHIPU_MODEL || 'glm-4-plus';
const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

function getKey() {
  if (process.env.ZHIPU_API_KEY) return process.env.ZHIPU_API_KEY.trim();
  try { return fs.readFileSync(KEY_FILE, 'utf8').trim(); } catch { return ''; }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleChat(req, res) {
  const key = getKey();
  if (!key) return sendJson(res, 500, { error: '服务端未配置 ZHIPU_API_KEY' });
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: '请求体不是合法 JSON' });
  }
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (!messages.length || messages.length > 8) {
    return sendJson(res, 400, { error: 'messages 数量不合法' });
  }
  const clean = messages
    .filter((message) => message && ['system', 'user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .map((message) => ({ role: message.role, content: message.content.slice(0, 12000) }));
  if (!clean.length) return sendJson(res, 400, { error: 'messages 内容为空' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: payload.model || MODEL,
        messages: clean,
        temperature: 0.4,
        max_tokens: 1600
      }),
      signal: controller.signal
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('upstream error', upstream.status, data && (data.message || data.error || 'unknown'));
      return sendJson(res, 502, { error: '会诊模型暂时不可用（上游 ' + upstream.status + '）' });
    }
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return sendJson(res, 502, { error: '会诊模型没有返回内容' });
    return sendJson(res, 200, { content, model: data.model || payload.model || MODEL });
  } catch (error) {
    console.error('chat error', error.name === 'AbortError' ? 'timeout' : error.message);
    return sendJson(res, 502, { error: error.name === 'AbortError' ? '会诊模型超时' : '会诊服务请求失败' });
  } finally {
    clearTimeout(timer);
  }
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/lab/';
  if (rel === '/lab') {
    res.writeHead(302, { Location: '/lab/' });
    res.end();
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const allowed = rel === '/index.html' || rel === '/styles.css' || rel === '/fonts.css' ||
    rel.startsWith('/lab/') || rel.startsWith('/app/') || rel.startsWith('/art/') || rel.startsWith('/assets/');
  if (!allowed) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const target = path.resolve(ROOT, '.' + rel);
  if (!target.startsWith(ROOT + path.sep) && target !== ROOT) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    handleChat(req, res);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); res.end('Method not allowed'); return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log('知几 P0: http://' + HOST + ':' + PORT + '/lab/');
  console.log('LLM:', MODEL, getKey() ? '(key loaded)' : '(no key)');
});
