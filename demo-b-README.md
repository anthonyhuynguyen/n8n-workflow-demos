# DEMO B: Broken lead-intake workflow, diagnosed and fixed

**DEMO project built for illustration. Not client work. No real client data, no real CRM.**
AI-assisted, reviewed and delivered by me.

## What is in this folder
| Path | What it is |
|---|---|
| `before/workflow_before.json` | Fragile n8n workflow (import into n8n as-is to see the defects) |
| `after/workflow_after.json` | Hardened n8n workflow (validation, retry, idempotency, alerting, redacted logs) |
| `after/error_alert_workflow.json` | Second workflow: Error Trigger that alerts on crashes anywhere |
| `diagnosis_report.md` | Client-style diagnosis: symptom, root cause, fix, how verified |
| `test_cases.md` | Test list with the local run result |
| `src/*.js` | Readable source of every Code node (the JSON is generated from these) |
| `tools/build_workflows.js` | Regenerates the three JSON files from `src/` (no dependencies) |
| `tests/run_tests.js` | Local test runner (no dependencies) |

## Run the local tests (Node 18+)
```
node tools/build_workflows.js
node tests/run_tests.js
```
Last local run: **31/31 passed** (exit 0). The runner executes the Code-node text stored inside the
AFTER JSON against mocked n8n globals and a fake CRM. It proves the logic, not the n8n wiring.

## Import into n8n (executed once via CLI on n8n 2.42.7, see Status)
1. Import `after/error_alert_workflow.json`, activate it, copy its workflow ID.
2. Import `after/workflow_after.json`. In Settings, set Error Workflow to the ID from step 1.
3. Set environment variables on the n8n host:
   - `CRM_BASE_URL` (example: `https://crm.example.test`)
   - `CRM_API_KEY` (use a test key only)
   - `ALERT_WEBHOOK_URL` (a Slack or Discord incoming webhook, or a test endpoint)
   - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (the Code nodes read `$env`; on n8n versions that block it by default, this line is required)
4. Activate the AFTER workflow. Test URL: `POST /webhook/demo-b/lead-intake` (production: `/webhook/...` after activation).
5. Send a JSON body: `{"event_id":"evt-1","email":"a@example.com","name":"A","source":"web"}`.

For a stricter setup, replace `CRM_API_KEY` with an n8n Header Auth credential. That needs a small node change and is not included here.

## Expected responses (AFTER)
| Case | HTTP | Body status |
|---|---|---|
| Valid, new event | 201 | `created` |
| Same event_id again | 200 | `duplicate_ignored` |
| Invalid input | 400 | `rejected` (with error list) |
| CRM still failing after 4 tries | 503 | `retry_later` (safe to resend, same event_id) |

## Known limits (stated, not hidden)
- Dedupe uses n8n static data. Two identical events arriving in the same few milliseconds can both pass the check. A production version would use a database unique constraint or a queue.
- Static data is per workflow, not shared across n8n instances.
- Jitter uses `Math.random`, which is fine here but not a security control.
- The CRM must honor an `Idempotency-Key` header. Many do not. Check the CRM docs before relying on it.
- Only Code and core nodes are used, so no paid or third-party nodes are needed.

## Status
- Local logic tests: **executed** (Node, 31/31).
- Live n8n import and run: **executed in n8n 2.42.7 on WSL (Ubuntu), 2026-10-27**, via CLI import plus real HTTP webhook calls against loopback mocks. AFTER: **9/9** cases matched (validation, dedupe, 503 x4 retry + alert, 429 Retry-After, 400 no-retry). BEFORE: **4/4** documented defects reproduced (run on a test-only copy whose hard-coded CRM URL pointed at loopback). Details: `../N8N_REAL_RUN_RESULTS.md`.
- n8n rejected the original JSON at import (no top-level `id`); fixed by adding `id` (originals kept as `*.json.orig`).
- Still **not executed**: real CRM, Error Trigger firing inside n8n (`error_alert_workflow.json` was not imported or run), concurrent identical events.
- Node `typeVersion` numbers used by BEFORE and AFTER loaded and ran on n8n 2.42.7 with no errors (not checked on other versions; the Error Trigger workflow was not imported).
