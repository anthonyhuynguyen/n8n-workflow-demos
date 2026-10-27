# DEMO A - Lead qualification workflow (n8n)

**Demo project built for illustration. Not client work. Every part of it is AI-assisted, reviewed and delivered by me.**

## What it does
1. Webhook receives a lead (POST JSON).
2. Normalizes name, email (lowercase, format check) and phone (US default to E.164).
3. De-duplicates by `submission_id` (n8n workflow static data).
4. Rejects leads with no valid contact (HTTP 422).
5. Calls an LLM (OpenAI-style chat API) to label the lead `qualified`, `needs_review` or `not_a_fit`.
6. Validates the LLM output before use: must be JSON, label in the allowed list, confidence 0-1, reason present. Anything else becomes `needs_review` with `ai_output_valid=false`.
7. Upserts a HubSpot contact by email with 10 mapped properties (skipped if there is no email).
8. Builds an owner notification and a follow-up **draft** saved to a file. Nothing is sent to the lead.
9. Sends the owner notification by email (SMTP). Slack is a disabled placeholder node.
10. Retries temporary API failures (3 tries, 3 s apart). Failures are written to a JSON log file and the webhook returns HTTP 500 `failed_logged`.

## Files
| File | Purpose |
|---|---|
| `demo-a-lead-qualification.json` | Importable n8n workflow (20 nodes). No secrets. Credential ids are placeholders. |
| `make-workflow.js` | Generator that writes the JSON above. Edit the code here, then run `node make-workflow.js`. |
| `mock-server.js` | Local mock of the LLM and HubSpot endpoints for testing without real keys. Keyword rules, not a real model. |
| `run-sample-leads.js` | Posts the 8 sample leads to a running n8n webhook in order and prints the responses. |
| `test-code-nodes.js` | Offline check: runs the workflow's Code-node JavaScript on the 8 leads (needs `mock-server.js`). Does not run n8n. |
| `sample-leads/lead-01..08` | The 8 test leads. Each has an `_expected` note (removed before sending). |
| `TEST_CHECKLIST.md` | Test checklist and results. |
| `WALKTHROUGH_2MIN.md` | 2-minute screen-recording script. |

## Status (real n8n run)
- **Executed in n8n 2.42.7 on WSL (Ubuntu), 2026-10-27**: CLI import, publish, real webhook POSTs of all 8 sample leads. With dummy credentials, the demo's mock LLM/HubSpot and a local SMTP sink: **8/8** responses matched the expected table below. With no credentials at all only lead 05 matches (the rest return 500 `failed_logged`, as designed).
- n8n rejected the original JSON at import (no workflow `id`) and the webhook was not reachable at `/webhook/demo-a-lead` (no `webhookId` on the Webhook node). Both fixed; originals kept as `*.orig`. Details: `../N8N_REAL_RUN_RESULTS.md`.
- Not executed: real HubSpot, real LLM, real SMTP; the `ai_output_valid` field and `normalization_errors` were not read back from responses; Slack placeholder stays disabled.
- Before activating, create `drafts/` and `failures/` inside `DEMO_OUTPUT_DIR` (the file nodes do not create folders; without them the run crashes with a generic 500) and make sure `N8N_RESTRICT_FILE_ACCESS_TO` allows that folder.

## Setup (about 15 minutes, first time)
1. Run n8n: `npx n8n` (needs Node 20+), or Docker `docker run -it -p 5678:5678 n8nio/n8n`. Open http://localhost:5678.
2. Import: menu, Import from file, choose `demo-a-lead-qualification.json`.
3. Create credentials (you create them yourself, never paste keys into chat or files):
   - **Demo LLM API key**: type Header Auth. Name `Authorization`, value `Bearer <your key>`. Attach to node "LLM Classify".
   - **Demo HubSpot private app token**: type Bearer Auth (HubSpot free account, Private App with `crm.objects.contacts.write`). Attach to node "HubSpot Upsert Contact".
   - **Demo SMTP account**: type SMTP. Attach to node "Email Notify Owner".
4. In HubSpot, create these 5 custom contact properties (`lead_message` as multi-line text, the other four as single-line text): `lead_message`, `lead_source`, `lead_submission_id`, `lead_classification`, `lead_ai_reason`. `email`, `firstname`, `lastname`, `phone` and `company` are built in. Without the custom ones HubSpot rejects the upsert.
5. Set environment variables (n8n settings or `.env`): `DEMO_LLM_MODEL` (optional, default `gpt-4o-mini`; check the current model name), `DEMO_NOTIFY_EMAIL`, `DEMO_FROM_EMAIL`, `DEMO_OUTPUT_DIR` (default `./demo-a-output`).
6. Activate the workflow (toggle top right). Production webhook URL: `http://localhost:5678/webhook/demo-a-lead`.

## How to test (no real keys)
1. `node mock-server.js` (port 8787). On Anthony's PC port 8787 is already used by another app (OpenMyMemo panel), so run `$env:MOCK_PORT="8788"; node mock-server.js` and use `8788` in the two URLs below.
2. Start n8n with: `DEMO_LLM_URL=http://127.0.0.1:8787/v1/chat/completions` and `DEMO_HUBSPOT_URL=http://127.0.0.1:8787/crm/v3/objects/contacts/batch/upsert`. Create dummy credentials (any value) so the nodes run.
3. `node run-sample-leads.js http://localhost:5678/webhook/demo-a-lead`.
4. Compare each response with the `expected` line. Full list and results: `TEST_CHECKLIST.md`.

Email is the one step the mock does not cover. Without a real SMTP, the notify step fails and the lead goes to the failure log. That is correct behavior, not a bug.

## Expected responses
| Lead | HTTP | status | Notes |
|---|---|---|---|
| 01 valid | 200 | processed | label qualified, CRM upserted |
| 02 missing name | 200 | processed | label needs_review |
| 03 duplicate of 01 | 200 | duplicate_skipped | send after 01 |
| 04 junk | 200 | processed | label not_a_fit |
| 05 invalid contact | 422 | rejected_invalid | no LLM call |
| 06 phone only | 200 | processed | CRM skipped (no email) |
| 07 AI output not JSON | 200 | processed | needs_review, ai_output_valid=false |
| 08 AI label not allowed | 200 | processed | needs_review, ai_output_valid=false |

## Known limits (be honest about these)
- **Retry is coarse.** n8n's retry repeats any HTTP error, including 4xx. The failure log records `temporary_guess` (no status, 429 or 5xx = temporary; other 4xx = permanent) so you can see the difference, but the workflow does not stop retrying permanent 4xx errors.
- **Dedupe uses workflow static data.** It is per workflow, not shared across n8n instances or queue workers. A lead is only marked seen after it succeeds, so a failed lead can be resubmitted.
- **Draft is saved to a file, never sent.** No node in the workflow sends to the lead.
- **Mock LLM is keyword rules.** It tests the validation and routing logic, not the quality of any real model's labels.
- **Webhook has no auth.** Put it behind a secret path or proxy before exposing it to the internet.
- **HubSpot property names** must exist first (step 4 above).
- **Not verified with a real HubSpot, real SMTP or real LLM account.** See `TEST_CHECKLIST.md` for what was actually run.
