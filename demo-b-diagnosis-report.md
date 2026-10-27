# Diagnosis report: Lead intake sync

**DEMO project built for illustration. Not client work. Fictional business, fictional CRM.**
AI-assisted, reviewed and delivered by me.

## 1. Symptom (as described in the demo brief)
- Web-form leads sometimes never appear in the CRM.
- Other leads appear twice.
- Every n8n execution shows green. Nothing alerts anyone.

## 2. Root cause
Five defects in the BEFORE workflow (`before/workflow_before.json`):

| # | Defect | Effect |
|---|---|---|
| 1 | The CRM HTTP node has `continueRegularOutput` and nothing checks its status | A 429 or 5xx is marked as success. "Mark success" always runs. The lead is lost silently. |
| 2 | No retry on the HTTP node | One rate-limit blip (429) or a 503 is final. |
| 3 | No idempotency key sent to the CRM, and no record of what was sent | A manual re-run, or a sender retry after a 504 where the CRM did save the contact, creates a second contact. |
| 4 | API key and CRM URL typed into a Set node | The key sits in the workflow JSON, which is exported and shared. Rotating it means editing the workflow. |
| 5 | Webhook uses `onReceived` (returns 200 before work starts) | The sender never learns about a failure, so it cannot retry. |

## 3. Fix (AFTER workflow, `after/workflow_after.json`)
- **Validate first.** Required fields, email format, length limits. Bad input gets 400 and never reaches the CRM.
- **Dedupe on `event_id`.** Keys are stored only after the CRM confirms success. A repeat returns 200 `duplicate_ignored`.
- **Retry with backoff.** Up to 4 attempts. Retries only on 408, 425, 429, 5xx and network errors. Honors `Retry-After` (capped at 8 s). Other 4xx fail at once.
- **Same `Idempotency-Key` on every attempt**, so a CRM that supports it cannot double-create.
- **Honest status to the sender.** 201 on success, 503 `retry_later` on final failure. Because of the dedupe, the sender can safely resend the same event.
- **Alert on failure.** The failure branch posts a short alert. A separate Error Trigger workflow alerts on any crash.
- **Secrets from environment variables.** Nothing secret is in the workflow JSON.
- **Redacted log line per attempt.** Event key, status, attempt count, duration, masked email. Never the API key, headers, or full payload.

## 4. How it was verified
- **Executed locally:** the Code-node logic from the AFTER JSON, run in Node 31/31 checks. Covers validation, dedupe, 429 with `Retry-After`, 503 x4 exhaustion, 400 no-retry, network error recovery, a same-event double send (one CRM call), a CRM-down-then-up sequence (no duplicate), secret and email redaction, and alert text without stack traces.
- **Structure checked:** unique node names and IDs, all connections point at real nodes, no literal keys in the JSON.

## 5. Not verified (said plainly)
- Not imported or run inside a live n8n instance. Node `typeVersion` numbers and the `$env` access setting need a check on the target n8n version.
- No real CRM, so no real 429 or 503 from a server. The fake CRM is a scripted mock.
- The "Idempotency-Key" behavior depends on the CRM. Not tested against a real one.
- Same-millisecond duplicate race is not closed (static data is not a lock). Known limit, see README.

## 6. Recommended next step if this were a real engagement
Run the AFTER workflow on a test n8n instance with a mock CRM that returns scripted 429 and 503 responses. Record one execution screen-recording and the log lines. Then add a database constraint if the volume makes same-millisecond races likely.
