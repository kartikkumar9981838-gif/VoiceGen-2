const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const crypto = require('crypto');

const HF_TOKEN = process.env.HF_API_TOKEN || '';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const MODELS = {
  kokoro:     'hexgrad/Kokoro-82M',
  chatterbox: 'ResembleAI/chatterbox',
  parler:     'parler-tts/parler-tts-mini-v1',
};

// In-memory history store (persists during session)
// For production use Vercel KV or PlanetScale
global._history = global._history || [];
global._stats   = global._stats   || { total: 0, today: 0, chars: 0, date: '' };

function updateStats(chars) {
  const today = new Date().toISOString().slice(0, 10);
  if (global._stats.date !== today) {
    global._stats.today = 0;
    global._stats.date  = today;
  }
  global._stats.total++;
  global._stats.today++;
  global._stats.chars += chars;
}

function callHF(modelId, text, language, speed) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      inputs: text,
      parameters: { language, speed: parseFloat(speed) }
    });

    const options = {
      hostname: 'api-inference.huggingface.co',
      path:     `/models/${modelId}`,
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type':  'application/json',
        'Accept':        'audio/wav',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 120000,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status:      res.statusCode,
          contentType: res.headers['content-type'] || '',
          body:        Buffer.concat(chunks),
        });
      });
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(payload);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET stats ────────────────────────────────────────
  if (req.method === 'GET' && req.query?.action === 'stats') {
    return res.json({
      success: true,
      total:   global._stats.total,
      today:   global._stats.today,
      chars:   global._stats.chars,
    });
  }

  // ── GET history ──────────────────────────────────────
  if (req.method === 'GET' && req.query?.action === 'history') {
    return res.json({ success: true, data: global._history.slice(0, 30) });
  }

  // ── DELETE ───────────────────────────────────────────
  if (req.method === 'GET' && req.query?.action === 'delete') {
    const id = req.query.id;
    global._history = global._history.filter(h => h.id !== id);
    return res.json({ success: true });
  }

  // ── POST generate ────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { text = '', model = 'kokoro', language = 'en', speed = 1.0 } = req.body || {};

  if (!text.trim())        return res.json({ success: false, error: 'Text is required' });
  if (text.length > 5000)  return res.json({ success: false, error: 'Text exceeds 5000 characters' });
  if (!MODELS[model])      return res.json({ success: false, error: 'Invalid model' });
  if (!HF_TOKEN)           return res.json({ success: false, error: 'API token not configured' });

  try {
    const result = await callHF(MODELS[model], text.trim(), language, speed);

    if (result.status === 503) {
      return res.json({ success: false, error: 'Model warming up, retry in 20 seconds', retry: true });
    }

    if (result.status !== 200 || !result.contentType.includes('audio')) {
      let errMsg = 'Generation failed';
      try { errMsg = JSON.parse(result.body.toString()).error || errMsg; } catch {}
      return res.json({ success: false, error: `${errMsg} (HTTP ${result.status})` });
    }

    // Convert to base64 data URL for frontend
    const b64      = result.body.toString('base64');
    const audioUrl = `data:audio/wav;base64,${b64}`;
    const id       = crypto.randomUUID();

    updateStats(text.length);

    const entry = {
      id,
      text_preview: text.slice(0, 80) + (text.length > 80 ? '...' : ''),
      model,
      language,
      char_count: text.length,
      audio_b64:  b64,
      created_at: new Date().toISOString(),
    };
    global._history.unshift(entry);
    if (global._history.length > 50) global._history.pop();

    return res.json({ success: true, audio_url: audioUrl, id, char_count: text.length });

  } catch (err) {
    return res.json({ success: false, error: err.message || 'Server error' });
  }
};
