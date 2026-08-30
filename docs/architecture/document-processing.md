# Document processing pipeline

Referenced from `apps/api/src/services/documentProcessing.service.ts`
and `apps/document-service/app/routers/jobs.py`. Full pipeline
description lives in [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
("Document processing pipeline" section) - this file covers the
operational side: what happens when a step fails.

## Job lifecycle

`document_processing_jobs.status`: `QUEUED → PROCESSING → COMPLETED`
or `→ FAILED`. The paper's own `examination_papers.ocr_status` mirrors
this so the frontend can show progress without joining the jobs table.
`PROCESSING` is reported by `apps/document-service` the instant its
background task actually starts work (a separate callback from
`COMPLETED`/`FAILED`) - distinct from `QUEUED`, which `apps/api` sets
the moment it creates the job row, before the file has even been
dispatched.

## Failure modes and recovery (Loop 07)

| Failure | What happens | Recovery |
|---|---|---|
| `apps/api` fails to reach `apps/document-service` when dispatching (`POST /jobs`) | `dispatchProcessingJob` retries up to 3 times with a short backoff; if all attempts fail, the job/paper are written to `FAILED` with a clear `error_message` | Automatic retry for the transient case; a persistent one surfaces on the library dashboard's "processing failures" list with a **Retry** button (`POST /api/papers/:id/reprocess`, LIBRARY_STAFF/ADMIN) |
| `apps/document-service` fails to download the file, or hits an unexpected error/timeout while extracting | Reports `status: FAILED, recoverable: true` via the callback | `apps/api`'s callback handler automatically re-queues and re-dispatches the same job (up to `MAX_AUTO_REPROCESS_ATTEMPTS = 2` additional attempts, tracked in `document_processing_jobs.attempts`); once exhausted, it's left `FAILED` for a manual retry via the dashboard |
| `apps/document-service` determines the file itself is unusable (corrupt/unreadable PDF, or over the size limit) | Reports `status: FAILED, recoverable: false` | Not auto-retried (retrying the identical bytes changes nothing) - needs a human to replace the file (`POST /api/papers/:id/versions`) or investigate |
| A single page's OCR call crashes (e.g. a malformed embedded image) | That page contributes an empty string; every other page's OCR still completes and is reported `COMPLETED` | No recovery needed - one bad page no longer sinks the whole document |
| Extraction/OCR runs far longer than expected (huge page count, a pathological image) | `apps/document-service` enforces a hard `processing_timeout_seconds` (120s default) ceiling around the extraction step, which runs in a worker thread so the timeout is actually enforceable and so it can't stall the service's own event loop (health checks, other jobs) in the meantime | Reported `FAILED, recoverable: true` - auto-retried like any other recoverable failure |
| `apps/document-service` succeeds but the callback to `apps/api` fails (network blip) | Logged on the Python side (`callback.failed`); the job row stays at its last reported status (`PROCESSING`, most likely) | Still not automatically retried - the extraction result itself isn't held anywhere to resend. A stuck-in-`PROCESSING` job needs a manual reprocess (which redoes the extraction, not just resends the same result) |

## Why fire-and-forget instead of a queue

The brief calls for the Node API to never block on OCR. A proper
message queue (SQS/Cloud Tasks/BullMQ+Redis) would give durable
retries, backoff, and dead-letter handling out of the box; this build
uses a simple fire-and-forget HTTP call plus a status column with its
own hand-rolled retry logic (see the table above) instead - enough to
demonstrate the async pattern and to actually survive the recoverable
failure modes the brief calls out (network blips, timeouts), while
being honest about the one gap that remains (a failed *callback*, as
opposed to a failed *job*, still needs a manual reprocess - see the
last row above). Swapping in a real queue later doesn't change the API
surface (`document_processing_jobs` + the callback endpoint stay the
same) - only what enqueues/dispatches the job would change.
