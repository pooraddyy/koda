# OpenAI Responses WebSocket Transport

This module provides an optional WebSocket transport for compatible OpenAI Responses requests. It preserves the existing HTTP/SSE behavior as the safe fallback and keeps socket lifecycle decisions scoped to an individual Koda session.

## Eligibility and fallback

The transport is enabled by default for local development variants. Set `koda_EXPERIMENTAL_WEBSOCKETS=true` when explicitly enabling it for a production-oriented variant. Requests fall back to HTTP when there is no session affinity, the request is a title-generation request, the session socket is busy, or the session has entered fallback mode.

| Event | Transport behavior |
| --- | --- |
| Eligible streamed response | Reuse an idle session socket or establish one before sending `response.create`. |
| Missing session affinity | Use the normal HTTP request path. |
| Socket setup or stream failure | Consume the bounded retry policy, then use HTTP for the session. |
| Cancellation or abort | Close the affected socket and end the active response. |
| Completed response | Keep the socket for controlled reuse until idle or age limits require replacement. |

## Lifetime and retry policy

The current policy uses a 15-second connection timeout, a five-minute idle timeout, and a maximum reuse age of 55 minutes. Socket setup and stream failures are retried up to five times before the transport degrades that session to HTTP until its pooled entry is pruned.

Do not replay a partially emitted WebSocket response as though it were a clean retry. Once visible events have been delivered, report a retryable transport failure through the normal session error path so higher-level orchestration can make an explicit continuation decision.

## Contributor expectations

Keep HTTP behavior correct when the WebSocket transport is disabled or unavailable. Changes must preserve session affinity, cancellation, bounded retries, and redaction of credentials from diagnostics. Add focused tests for selection, fallback, cleanup, and the terminal event stream before expanding the implementation.
