/**
 * Kantor Isometrik — server lokal
 * - Menyajikan file statis (index.html, app.js, vendor)
 * - Menjadi perantara otak AI tiap agen: DeepSeek, Gemini, GPT
 * - Kunci API hanya dibaca di server dari environment / .env, tidak pernah dikirim ke browser
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(ROOT, '.env');
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '127.0.0.1';

/* ------------------------- .env ------------------------- */
const OS_ENV_KEYS = new Set(Object.keys(process.env));
let envMtime = 0;

function loadEnv() {
  try {
    const st = fs.statSync(ENV_PATH);
    if (st.mtimeMs === envMtime) return;
    envMtime = st.mtimeMs;
    const text = fs.readFileSync(ENV_PATH, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // nilai dari OS tidak ditimpa; .env boleh diperbarui tanpa restart
      if (!OS_ENV_KEYS.has(key)) process.env[key] = value;
    }
  } catch {
    /* .env belum ada */
  }
}
loadEnv();

/* ------------------------- definisi otak ------------------------- */
const PROVIDER_DEFS = {
  deepseek: {
    label: 'DeepSeek',
    keyEnvs: ['DEEPSEEK_API_KEY'],
    modelEnv: 'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-chat',
    baseEnv: 'DEEPSEEK_BASE_URL',
    defaultBase: 'https://api.deepseek.com/v1',
    kind: 'openai',
  },
  gemini: {
    label: 'Gemini',
    keyEnvs: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash',
    kind: 'gemini',
  },
  openai: {
    label: 'GPT',
    keyEnvs: ['OPENAI_API_KEY'],
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o-mini',
    baseEnv: 'OPENAI_BASE_URL',
    defaultBase: 'https://api.openai.com/v1',
    kind: 'openai',
  },
};

const AGENTS = [
  { name: 'Rani', role: 'Analis Data', room: 'Riset & Data', task: 'Rekap data kuartal' },
  { name: 'Bima', role: 'Staf Riset', room: 'Riset & Data', task: 'Input formulir baru' },
  { name: 'Sinta', role: 'Koordinator Operasi', room: 'Operasi Harian', task: 'Jadwal pengiriman' },
  { name: 'Adi', role: 'Staf Operasi', room: 'Operasi Harian', task: 'Periksa berkas' },
  { name: 'Nadia', role: 'Agen Dukungan', room: 'Dukungan Pelanggan', task: 'Balas tiket masuk' },
  { name: 'Yoga', role: 'Agen Dukungan', room: 'Dukungan Pelanggan', task: 'Tindak lanjut panggilan' },
];

// 2 agen per model, dan tiap ruangan punya campuran model
const ASSIGNMENTS = ['deepseek', 'gemini', 'openai', 'deepseek', 'gemini', 'openai'];

function getProviders() {
  const out = {};
  for (const [id, def] of Object.entries(PROVIDER_DEFS)) {
    const key = def.keyEnvs.map((k) => process.env[k]).find((v) => v && v.trim()) || '';
    const base = def.baseEnv ? process.env[def.baseEnv] || def.defaultBase : '';
    out[id] = {
      id,
      label: def.label,
      kind: def.kind,
      key,
      base: String(base).replace(/\/+$/, ''),
      model: process.env[def.modelEnv] || def.defaultModel,
      ready: Boolean(key),
    };
  }
  return out;
}

function publicConfig() {
  const providers = getProviders();
  return {
    ai: true,
    readyCount: Object.values(providers).filter((p) => p.ready).length,
    providers: Object.fromEntries(
      Object.entries(providers).map(([id, p]) => [
        id,
        { label: p.label, model: p.model, ready: p.ready },
      ])
    ),
    agents: ASSIGNMENTS.map((id, index) => ({
      index,
      provider: id,
      label: providers[id].label,
      model: providers[id].model,
      ready: providers[id].ready,
    })),
  };
}

const STATE_TEXT = { typing: 'mengetik', report: 'menunggu keputusan', urgent: 'mendesak' };

function buildMessages(agent, input) {
  const system = `Kamu adalah ${agent.name}, ${agent.role} di ${agent.room} sebuah kantor digital. Tugas rutinmu: ${agent.task}.
Kamu mengatur status meja kerjamu sendiri. Status yang tersedia:
- "typing": fokus mengetik atau mengerjakan tugas.
- "report": ada laporan selesai dan menunggu keputusan manusia.
- "urgent": laporan mendesak atau macet, butuh keputusan segera.

Aturan:
1. Jangan pernah menyebut nominal uang, harga, tarif, atau angka finansial apa pun.
2. Balas HANYA JSON valid: {"state":"typing|report|urgent","catatan":"alasan singkat maksimal 12 kata"}.
3. Jika status sekarang "report" dan belum ada keputusan, kamu boleh menaikkannya ke "urgent".
4. Jangan memilih "urgent" dua kali berturut-turut kecuali memang sangat mendesak.
5. Jika terlalu banyak agen sedang menunggu keputusan, pilih "typing" agar alur kerja tetap seimbang.
6. Catatan memakai bahasa Indonesia yang singkat, konkret, dan tanpa angka uang.`;

  const user = `Status saat ini: ${STATE_TEXT[input.current] || 'mengetik'}.
Sudah mengetik: ${Math.max(0, Math.round(Number(input.elapsed) || 0))} detik.
Agen lain yang menunggu keputusan: ${Math.max(0, Number(input.reports) || 0)}.
Agen lain yang mendesak: ${Math.max(0, Number(input.urgent) || 0)}.
Jam kantor: ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.

Pilih status meja berikutnya untuk dirimu.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/* ------------------------- panggilan model ------------------------- */
function trimError(value, key) {
  let text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  if (key) text = text.split(key).join('[kunci disembunyikan]');
  return text;
}

function extractText(payload, kind) {
  if (kind === 'gemini') {
    const parts = payload?.candidates?.[0]?.content?.parts || [];
    return parts.map((p) => p?.text || '').join('');
  }
  return payload?.choices?.[0]?.message?.content || '';
}

async function callProvider(provider, messages) {
  const signal = AbortSignal.timeout(18000);
  if (provider.kind === 'gemini') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const user = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n\n');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 300,
          responseMimeType: 'application/json',
          ...(provider.model.startsWith('gemini-2.5')
            ? { thinkingConfig: { thinkingBudget: 0 } }
            : {}),
        },
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${provider.label} HTTP ${res.status}: ${trimError(body, provider.key)}`);
    }
    return extractText(await res.json(), 'gemini');
  }

  const res = await fetch(`${provider.base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${provider.key}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: 0.9,
      max_tokens: 160,
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${provider.label} HTTP ${res.status}: ${trimError(body, provider.key)}`);
  }
  return extractText(await res.json(), 'openai');
}

/* ------------------------- parsing keputusan ------------------------- */
function sanitizeNote(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!text) return 'Laporan siap ditinjau.';
  if (/(rp\.?\s*\d|\$\s*\d|\bidr\b|\busd\b|rupiah|jutaan|miliaran|ribuan)/i.test(text)) {
    return 'Laporan siap ditinjau.';
  }
  return text;
}

function parseDecision(raw) {
  const cleaned = String(raw || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Balasan model bukan JSON');
  let obj;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error('JSON model tidak bisa dibaca');
  }
  const state = String(obj.state || '').toLowerCase();
  if (!['typing', 'report', 'urgent'].includes(state)) throw new Error('Status model tidak valid');
  return { state, note: sanitizeNote(obj.catatan ?? obj.note ?? '') };
}

function fallbackDecision(current, input) {
  const reports = Math.max(0, Number(input.reports) || 0);
  const r = Math.random();
  if (current === 'urgent') {
    return { state: 'typing', note: 'Laporan mendesak sudah diteruskan, lanjut mengetik.' };
  }
  if (current === 'report') {
    return r < 0.45
      ? { state: 'urgent', note: 'Belum ada keputusan, laporan dinaikkan jadi mendesak.' }
      : { state: 'typing', note: 'Menunggu keputusan sambil melanjutkan tugas lain.' };
  }
  if (reports >= 2) {
    return { state: 'typing', note: 'Antrean keputusan penuh, fokus mengetik dulu.' };
  }
  if (r < 0.55) return { state: 'typing', note: 'Lanjut mengerjakan tugas rutin.' };
  if (r < 0.85) return { state: 'report', note: 'Laporan selesai, menunggu keputusan.' };
  return { state: 'report', note: 'Ada temuan yang perlu ditinjau.' };
}

/* ------------------------- HTTP util ------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
}

const GATE_HTML = `<!doctype html><html lang="id"><meta charset="utf-8"><title>Akses terbatas</title>
<style>body{font-family:system-ui,sans-serif;background:#eef4fb;color:#334155;display:grid;place-items:center;height:100vh;margin:0}div{background:#fff;border:1px solid #e2eaf5;border-radius:16px;padding:24px 28px;max-width:360px;box-shadow:0 18px 40px rgba(31,48,74,.12);line-height:1.6;font-size:13px}h1{font-size:15px;margin:0 0 8px}</style>
<div><h1>Akses perlu tautan lengkap</h1>Halaman ini dilindungi kunci akses. Buka tautan yang menyertakan <b>?k=...</b> dari pemilik kantor.</div></html>`;

// Hanya berlaku untuk permintaan yang masuk lewat tunnel publik (Cloudflare).
// localhost tetap bisa dibuka tanpa kunci.
function checkAccess(req, url, res) {
  const token = (process.env.ACCESS_TOKEN || '').trim();
  if (!token) return true;
  const host = String(req.headers.host || '').split(':')[0].replace(/^\[|\]$/g, '');
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
  if (isLocal) return true;

  const cookie = req.headers.cookie || '';
  if (cookie.split(';').some((part) => part.trim() === `k=${token}`)) return true;

  if (url.searchParams.get('k') === token) {
    const rest = new URL(url.toString());
    rest.searchParams.delete('k');
    const location = rest.pathname + (rest.search || '');
    send(res, 302, 'Mengalihkan...', {
      location,
      'set-cookie': `k=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
      'cache-control': 'no-store',
    });
    return false;
  }

  send(res, 401, GATE_HTML, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  return false;
}

async function readJsonBody(req, limit = 16 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Body terlalu besar');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('JSON tidak valid');
  }
}

/* ------------------------- statis ------------------------- */
async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.resolve(ROOT, '.' + rel);
  const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (!filePath.startsWith(rootPrefix)) return send(res, 403, 'Forbidden');

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) return send(res, 404, 'Not found');
    const ext = path.extname(filePath).toLowerCase();
    const data = await fsp.readFile(filePath);
    const noCache = ['.html', '.js', '.mjs', '.css'].includes(ext);
    send(res, 200, data, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': noCache ? 'no-cache' : 'public, max-age=3600',
      'content-length': data.length,
    });
  } catch {
    send(res, 404, 'Not found');
  }
}

/* ------------------------- API ------------------------- */
const lastCall = new Map();

async function handleAgent(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message });
  }

  const index = Number(body.agent);
  const agent = AGENTS[index];
  if (!agent) return sendJson(res, 400, { ok: false, error: 'Agen tidak dikenal' });

  const now = Date.now();
  if (now - (lastCall.get(index) || 0) < 1200) {
    return sendJson(res, 429, { ok: false, error: 'Terlalu cepat, tunggu sebentar' });
  }
  lastCall.set(index, now);

  loadEnv();
  const providers = getProviders();
  const providerId = ASSIGNMENTS[index];
  const provider = providers[providerId];
  const input = {
    current: ['typing', 'report', 'urgent'].includes(body.current) ? body.current : 'typing',
    elapsed: Number(body.elapsed) || 0,
    reports: Number(body.reports) || 0,
    urgent: Number(body.urgent) || 0,
  };
  const started = Date.now();

  if (!provider.ready) {
    const decision = fallbackDecision(input.current, input);
    console.log(`${agent.name} · ${provider.label} (simulasi, tanpa kunci) → ${decision.state}`);
    return sendJson(res, 200, {
      ok: true,
      ...decision,
      provider: provider.id,
      providerLabel: provider.label,
      model: provider.model,
      source: 'simulasi',
      ready: false,
      latencyMs: Date.now() - started,
    });
  }

  try {
    const messages = buildMessages(agent, input);
    const raw = await callProvider(provider, messages);
    const decision = parseDecision(raw);
    console.log(`${agent.name} · ${provider.label} → ${decision.state} (${Date.now() - started}ms)`);
    sendJson(res, 200, {
      ok: true,
      ...decision,
      provider: provider.id,
      providerLabel: provider.label,
      model: provider.model,
      source: 'model',
      ready: true,
      latencyMs: Date.now() - started,
    });
  } catch (err) {
    const message = trimError(err?.message || 'Gagal memanggil model', provider.key);
    const decision = fallbackDecision(input.current, input);
    console.warn(`${agent.name} · ${provider.label} gagal: ${message}`);
    sendJson(res, 200, {
      ok: true,
      ...decision,
      provider: provider.id,
      providerLabel: provider.label,
      model: provider.model,
      source: 'cadangan',
      ready: true,
      error: message,
      latencyMs: Date.now() - started,
    });
  }
}

/* ------------------------- server ------------------------- */
const server = http.createServer(async (req, res) => {
  loadEnv();
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (!checkAccess(req, url, res)) return;
  const pathname = url.pathname;

  if (pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
  }
  if (pathname === '/api/config') {
    loadEnv();
    return sendJson(res, 200, publicConfig());
  }
  if (pathname === '/api/agent') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Gunakan POST' });
    return handleAgent(req, res);
  }
  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, { ok: false, error: 'Endpoint tidak ada' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method not allowed');
  }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  const cfg = publicConfig();
  console.log('');
  console.log(`  Kantor Isometrik  →  http://localhost:${PORT}`);
  console.log(
    `  Otak AI: ${Object.values(cfg.providers)
      .map((p) => `${p.label} ${p.ready ? 'siap' : 'tanpa kunci'}`)
      .join(' · ')}`
  );
  if (cfg.readyCount === 0) {
    console.log('  Tambahkan kunci di .env (lihat .env.example). Mode simulasi tetap berjalan.');
  }
  console.log('');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
