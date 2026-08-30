# Document processing pipeline

Referenced from `apps/api/src/services/documentProcessing.service.ts`
and `apps/document-service/app/services/callback.py`. Full pipeline
description lives in [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
("Document processing pipeline" section) - this file covers the
operational side: what happens when a step fails.

## Job lifecycle

`document_processing_jobs.status`: `QUEUED → PROCESSING → COMPLETED`
or `→ FAILED`. The paper's own `examination_papers.ocr_status` mirrors
this so the frontend can show progress without joining the jobs table.

## Failure modes and recovery

| Failure | What happens | Recovery |
|---|---|---|
| `apps/api` fails to reach `apps/document-service` when dispatching (`POST /jobs`) | Logged (`logger.error`), the job row stays `QUEUED`, the upload itself still succeeds | Currently manual: a library staff member sees it in the "processing failures" section of the library dashboard (which surfaces jobs with `status = FAILED`, not `QUEUED` - a job stuck in `QUEUED` needs a manual re-dispatch, which isn't wired to a UI action yet, see ROADMAP.md) |
| `apps/document-service` fails to download the file, extract text, or OCR it | Reports `status: FAILED` with `errorMessage` via the callback | Same as above - visible on the library dashboard |
| `apps/document-service` succeeds but the callback to `apps/api` fails (network blip) | Logged on the Python side; the job row never leaves `QUEUED`/`PROCESSING` even though processing actually finished | No automatic retry yet - a future iteration should add a periodic reconciliation job or a retry-with-backoff on the callback POST |

## Why fire-and-forget instead of a queue

The brief calls for the Node API to never block on OCR. A proper
message queue (SQS/Cloud Tasks/BullMQ+Redis) would give real retries,
backoff, and dead-letter handling; this build uses a simple
fire-and-forget HTTP call plus a status column instead, which is
enough to demonstrate the async pattern and is honest about not being
retry-safe yet (see the failure table above and ROADMAP.md). Swapping
in a real queue later doesn't change the API surface
(`document_processing_jobs` + the callback endpoint stay the same) -
only what enqueues/dispatches the job would change.
