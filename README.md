# n8n workflow demos (illustration projects, not client work)

Two small n8n projects that show how I work: reproduce a failure, fix the cause, and re-run the tests. These are **demo projects**, not client work.

## Demo A: AI lead qualification (webhook -> HubSpot)
`demo-a-lead-qualification.json` (n8n workflow, no secrets, placeholder credential ids), `demo-a-README.md` (setup), `demo-a-sample-leads.json` (8 test leads), `demo-a-mock-server.js` and `demo-a-run-sample-leads.js` (local mocks and test driver).
Takes a web-form lead, cleans and validates name, email and phone, skips duplicates, asks an LLM for a label (qualified / needs review / not a fit), rejects invalid AI output, upserts a HubSpot contact, notifies by email and saves a follow-up draft (nothing is sent to the lead). Retries temporary errors and logs failures.

## Demo B: repairing a flaky workflow
`demo-b-before.json` (fragile: no validation, no dedupe, silent failures), `demo-b-after.json` (input checks, duplicate protection, retries with backoff, failure alert), `demo-b-error-alert.json`, `demo-b-diagnosis-report.md` (the write-up a client would receive), `demo-b-README.md`.

## What was tested (n8n 2.42.7 on Ubuntu/WSL2, details in `TEST_RESULTS.md`)
- Demo A: 8 of 8 sample leads gave the expected result, using **mock** HubSpot and LLM services and dummy credentials.
- Demo B: the "before" version reproduced 4 of 4 documented defects; the "after" version passed 9 of 9 test cases.

## What is NOT proven
Real HubSpot, a real LLM and real email were never used (everything ran against local mocks). The error-alert workflow was not executed, and nothing was tested for concurrent events or other n8n versions.

## Status
No client work yet and no reviews. Open to small fixed-price n8n and API-integration fixes.
