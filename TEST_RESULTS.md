# N8N real run results (2026-10-27)

**Engine:** n8n 2.42.7, Node 24.22.0, Ubuntu WSL2, SQLite. A fresh data/SQLite folder was used for each run.
**How driven:** `n8n import:workflow`, `n8n publish:workflow`, then `n8n start` (server on 127.0.0.1:5691 only) and real HTTP POSTs to the production webhook. All mocks are loopback only: demo's own `mock-server.js` (LLM + HubSpot, port 8788), a small CRM/alert mock (port 8788), and a throwaway SMTP sink (127.0.0.1:2525). No internet, no real credentials. All started processes were stopped afterwards (final check: no n8n/node/mock processes, no listeners on 5691/8788/2525/5678).

## Summary

| Workflow | Imported | Ran | Result |
|---|---|---|---|
| Demo A lead qualification | Failed as shipped, OK after fix | Yes | 8/8 samples match expected (with dummy credentials + loopback mocks + SMTP sink). 1 of 8 with no credentials at all (see below) |
| Demo B BEFORE | Failed as shipped, OK after fix | Yes | 4/4 behave as the documented defects predict |
| Demo B AFTER | Failed as shipped, OK after fix | Yes | 9/9 match expected |
| Demo B error_alert_workflow.json | Not imported or run (only given an `id` for consistency) | No | Unproven |

## Problems n8n 2.42.7 found in the shipped JSON (all fixed, originals kept as `.orig`)

1. **Import rejected, all workflow files:** `SQLITE_CONSTRAINT: NOT NULL constraint failed: workflow_entity.id`. The JSON had no top-level `id`. Fix: added `id` (`demoALeadQual01`, `demoBBefore0001`, `demoBAfter00001`, `demoBErrAlert01`). Also patched the two generators (`demo-a-lead-qualification\make-workflow.js`, `demo-b-broken-workflow-fix\tools\build_workflows.js`) so regeneration keeps the fix. Verified the generators reproduce the patched JSON byte for byte (ignoring CRLF) and Demo B local tests still pass 31/31.
2. **Demo A webhook not reachable at the documented URL:** the Webhook node had no `webhookId`, so n8n registered it as `/webhook/demoALeadQual01/webhook%20lead%20intake/demo-a-lead` and `POST /webhook/demo-a-lead` returned 404 "not registered". Fix: added `"webhookId": "demo-a-lead-webhook"` on the Webhook node (and in `make-workflow.js`). After that `/webhook/demo-a-lead` works. (This affects a CLI/file import; the UI may assign one itself, not tested.)
3. **No node or typeVersion errors.** Every node type and typeVersion (webhook 2, code 2, if 2.2, respondToWebhook 1.1, httpRequest 4.2, readWriteFile 1, emailSend 2.1, set 3.4) loaded and executed. The old README caveat "typeVersion numbers unverified" is now verified for the executed paths on 2.42.7 (Slack placeholder node is disabled and was not run; `errorTrigger` workflow not imported).
4. **Environment note (not a JSON bug):** Demo A's Read/Write Files nodes need `drafts/` and `failures/` to already exist under `DEMO_OUTPUT_DIR` and need `N8N_RESTRICT_FILE_ACCESS_TO` to include it. Without pre-created folders the whole execution crashed with `ENOENT realpath` and returned the generic `{"message":"Error in workflow"}` instead of `failed_logged`. Added to README setup.
5. **Harness-only (not in the demo JSON):** `n8n publish:workflow` only takes effect after a server start, and the first start did not register the webhook; a second start did, so my driver does a warm-up start then a real start. `update:workflow --active` is deprecated and does nothing. Demo B BEFORE hard-codes `https://crm.example.com/...`; to keep this loopback-only I ran a **test-only copy** with that URL replaced by `http://127.0.0.1:8788/v1/contacts` (`before_loopback.json`, not shipped; the shipped file only gained the `id`).

## Demo A: 8 sample leads (pass "cred": dummy credentials in the throwaway DB, LLM/HubSpot mocks, SMTP sink)

Credential ids in the JSON are placeholders; for this pass I created three dummy credentials with those same ids in the fresh SQLite DB (test values only, pointing at loopback mocks). Without any credentials the HTTP and email nodes cannot run, see the second table.

| Lead | Expected | Actual HTTP / body | Match |
|---|---|---|---|
| 01 valid | 200 processed, qualified, upserted | 200 processed, qualified, upserted | yes |
| 02 missing name | 200 processed, needs_review | 200 processed, needs_review, upserted | yes |
| 03 duplicate of 01 | 200 duplicate_skipped | 200 duplicate_skipped | yes |
| 04 junk | 200 processed, not_a_fit | 200 processed, not_a_fit | yes |
| 05 invalid contact | 422 rejected_invalid (email_invalid, phone_invalid, no_valid_contact) | 422 with exactly those errors | yes |
| 06 phone only | 200 processed, qualified, skipped_no_email | 200 processed, qualified, skipped_no_email | yes |
| 07 AI not JSON | 200 processed, needs_review | 200 processed, needs_review | yes |
| 08 AI bad label | 200 processed, needs_review | 200 processed, needs_review | yes |

**8/8.** Side evidence: mock log shows the HubSpot mock got 10 property names per upsert; mock LLM served the canned bad-JSON and bad-label replies for 07/08; the SMTP sink received 6 messages (01, 02, 04, 06, 07, 08); 6 draft files written to `drafts/` (nothing sent to leads); `failures/` empty. Not directly checked: the `ai_output_valid=false` field and `normalization_errors` for 02 (the response body does not carry them; only the resulting label was checked).

### Demo A with no credentials at all (pass "nocred")

Only lead 05 matched (422 rejected_invalid, it never reaches an HTTP node). Leads 01, 02, 03, 04, 06, 07, 08 all `failed_logged` because the LLM node cannot run (`Credential with ID "REPLACE_WITH_LLM_CREDENTIAL_ID" does not exist`), and 03 is not `duplicate_skipped` because 01 never succeeded. So **1/8 match without credentials**; the 500 `failed_logged` path itself works (7 failure-log JSON files written with the error message). Correct behaviour per the README, but the demo cannot be shown end to end without creating (dummy) credentials.

## Demo B AFTER: 9 test cases (CRM and alert mock on loopback)

| # | Case | Expected | Actual | Match |
|---|---|---|---|---|
| B1 | valid new event | 201 created, 1 CRM call | 201 created, 1 call, key `lead:evt-1` | yes |
| B2 | same event again | 200 duplicate_ignored, 0 CRM calls | same | yes |
| B3 | no email | 400 rejected, 0 CRM calls | same | yes |
| B4 | email `a@b` | 400 rejected | same | yes |
| B5 | CRM 503 x4 | 503 retry_later, 4 calls, 1 alert | same (same idempotency key on all 4) | yes |
| B6 | resend after CRM up | 201 created | same | yes |
| B7 | resend again | 200 duplicate_ignored | same | yes |
| B8 | 429 Retry-After 1, then 201 | 201, 2 calls, same key | same, attempts=2 | yes |
| B9 | CRM 400 | 503 retry_later, 1 call, alert | same | yes |

**9/9.** (Retries ran inside the n8n Code node with real timers; the 429 wait was a real 1 s.)

## Demo B BEFORE: 4 cases (test-only loopback copy)

| # | Case | Observed | Matches documented defect |
|---|---|---|---|
| B1 | valid event | 200 "Workflow was started" immediately, 1 CRM call, no Idempotency-Key header | yes |
| B2 | same event again | 200, CRM called again (no dedupe) | yes |
| B3 | CRM returns 500 | caller still gets 200, no retry (1 call), no alert | yes |
| B4 | missing email | 200, CRM still called (no validation) | yes |

**4/4** consistent with the defects described in `diagnosis_report.md`.

## NOT proven

- Anything with real HubSpot, real LLM, real SMTP, real CRM (all mocked on loopback; dummy credentials only; mock LLM is keyword rules).
- `error_alert_workflow.json` (Error Trigger firing) and the `errorWorkflow` link in the AFTER settings (still the placeholder id, so a crash alert was not exercised).
- Concurrency (two identical events at once), static-data dedupe across restarts, n8n UI import behaviour, other n8n versions, Windows-native n8n.
- The editor UI was never opened; only CLI import + HTTP webhooks were used.
- Demo A response fields `ai_output_valid` and `normalization_errors` (see above).
- Wall time: first CLI init in a fresh data dir about 7 to 16 s here (warm runtime); runs were not timed for delivery claims.

## Files changed in this task

`demo-a-lead-qualification\demo-a-lead-qualification.json` (+id, +webhookId), `make-workflow.js`; `demo-b-broken-workflow-fix\before\workflow_before.json`, `after\workflow_after.json`, `after\error_alert_workflow.json` (+id), `tools\build_workflows.js`; each with a `.orig` copy of the pre-change file next to it. READMEs and TEST_CHECKLIST updated with the true status. New folder `n8n-real-run-evidence\`.
