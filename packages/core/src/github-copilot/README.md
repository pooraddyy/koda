# GitHub Copilot Compatibility Boundary

This module contains the narrow compatibility logic required for GitHub Copilot provider behavior in Koda. It is not a general provider abstraction and must not become a fallback implementation for OpenAI-compatible, chat-completion, or responses-style providers.

## Ownership

| This module owns | This module does not own |
| --- | --- |
| Copilot-specific authentication and protocol compatibility details | Generic OpenAI-compatible endpoint behavior |
| Copilot-only request or response normalization | Koda session orchestration, tool execution, or permissions |
| Focused regression tests for Copilot edge cases | Shared provider catalog policy or terminal UI behavior |

Keep changes small, isolated, and backed by a Copilot-specific reproduction. Before editing, confirm that the behavior cannot be expressed through the common provider layer. If the issue affects more than Copilot, move the shared rule to the appropriate generic runtime boundary and keep this module as a thin adapter.

Never log tokens, authorization headers, account identifiers, or raw provider payloads containing sensitive project content. Validate the narrowest affected request path before merging.
