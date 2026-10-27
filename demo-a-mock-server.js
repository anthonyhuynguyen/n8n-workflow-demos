// Local mock for the two external APIs the workflow calls. DEMO ONLY, no real keys.
// Run: node mock-server.js   (port 8787)
// Point the workflow at it with env vars:
//   DEMO_LLM_URL=http://127.0.0.1:8787/v1/chat/completions
//   DEMO_HUBSPOT_URL=http://127.0.0.1:8787/crm/v3/objects/contacts/batch/upsert
// The "LLM" is a keyword rule, NOT a real model. It is used to test workflow logic only.
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOG = path.join(__dirname, 'mock-server-log.jsonl');
const PORT = Number(process.env.MOCK_PORT || 8787);

function classify(userPayloadText) {
  let msg = '';
  try { msg = String(JSON.parse(userPayloadText).message || ''); } catch (e) { msg = userPayloadText; }
  if (msg.includes('CANNED_BAD_JSON')) return 'Sure! I think this one is qualified.';
  if (msg.includes('CANNED_BAD_LABEL')) return JSON.stringify({ label: 'maybe', confidence: 0.9, reason: 'mock bad label' });
  if (/crypto|giveaway|lol/i.test(msg)) return JSON.stringify({ label: 'not_a_fit', confidence: 0.95, reason: 'Spam-like message (mock rule).' });
  if (/automat|quote|invoice|booking/i.test(msg)) return JSON.stringify({ label: 'qualified', confidence: 0.85, reason: 'Describes an automation need (mock rule).' });
  return JSON.stringify({ label: 'needs_review', confidence: 0.5, reason: 'Unclear request (mock rule).' });
}

function log(entry) {
  fs.appendFileSync(LOG, JSON.stringify(Object.assign({ at: new Date().toISOString() }, entry)) + '\n');
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
    };
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (e) { return send(400, { error: 'bad json' }); }
      const userMsg = (parsed.messages || []).find((m) => m.role === 'user');
      const content = classify(userMsg ? userMsg.content : '');
      log({ route: 'llm', content_preview: content.slice(0, 80) });
      return send(200, { id: 'mock-1', choices: [{ index: 0, message: { role: 'assistant', content: content } }] });
    }
    if (req.method === 'POST' && req.url === '/crm/v3/objects/contacts/batch/upsert') {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (e) { return send(400, { error: 'bad json' }); }
      const props = parsed.inputs && parsed.inputs[0] ? parsed.inputs[0].properties : {};
      log({ route: 'hubspot_upsert', property_count: Object.keys(props).length, property_names: Object.keys(props) });
      return send(200, { status: 'COMPLETE', results: [{ id: 'mock-contact-1', properties: props }] });
    }
    log({ route: 'unknown', method: req.method, url: req.url });
    send(404, { error: 'not found' });
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('mock server on http://127.0.0.1:' + PORT);
});
