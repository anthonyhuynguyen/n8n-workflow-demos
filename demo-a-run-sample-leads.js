// Posts the 8 sample leads to the workflow webhook in order and prints each response.
// Usage: node run-sample-leads.js http://localhost:5678/webhook/demo-a-lead
// Lead 03 is a duplicate of lead 01, so run in file order (01 first).
const fs = require('fs');
const path = require('path');

const url = process.argv[2] || 'http://localhost:5678/webhook/demo-a-lead';
const dir = path.join(__dirname, 'sample-leads');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

(async () => {
  for (const f of files) {
    const lead = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const expected = lead._expected;
    delete lead._expected;
    let status = 'NO RESPONSE';
    let text = '';
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) });
      status = r.status;
      text = await r.text();
    } catch (e) {
      text = 'fetch error: ' + e.message;
    }
    console.log('--- ' + f);
    console.log('  http: ' + status);
    console.log('  body: ' + text.slice(0, 300));
    console.log('  expected: ' + expected);
  }
})();
