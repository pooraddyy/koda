# Koda Gateway Integration

`@koda/koda-gateway` contains the terminal runtime integration points for Koda-managed authentication, provider routing, account-aware metadata, and related local UI helpers. It is a workspace package consumed by the Koda CLI rather than a separate browser product.

## Responsibilities

| Capability | Boundary |
|---|---|
| Device authorization | Starts and completes the configured terminal authentication flow. |
| Provider integration | Produces gateway-aware provider configuration for the Koda runtime. |
| Account metadata | Reads profile, balance, and model metadata through the authorized API path. |
| Terminal helpers | Exposes presentation-oriented utilities for the Koda TUI without embedding a web surface. |

## Runtime use

The CLI registers the gateway package through its normal plugin and provider setup. Applications should use Koda's public CLI configuration and `/connect` flow rather than constructing gateway requests directly.

```text
koda
→ /connect
→ choose the supported gateway or provider flow
→ complete authorization in the requested browser step when applicable
→ return to the terminal session
```

An interactive authorization flow may open a browser solely to complete identity-provider authentication. Koda itself remains a terminal product; browser pages are not a dashboard or editing surface.

## Internal API shape

The workspace package exposes authentication and provider helpers for Koda-owned runtime integrations.

```ts
import { kodaAuthPlugin, createkoda } from "@koda/koda-gateway"

const plugins = [kodaAuthPlugin]

const provider = createkoda({
  kodaToken: process.env.koda_API_KEY,
  kodaOrganizationId: process.env.koda_ORGANIZATION_ID,
})
```

Treat tokens, organization identifiers, and profile data as sensitive. Do not hard-code them in repository files, log them in diagnostics, or include them in example commands. Consumers should validate failures at the edge and present actionable, non-sensitive errors to the terminal user.

## Development expectations

Changes to gateway behavior should preserve explicit authentication state, safe provider configuration, and backward-compatible CLI failure modes. Verify the narrowest relevant authentication or provider test first, then exercise the terminal flow when the change affects user-visible behavior.

For product usage and terminal safety boundaries, read the repository [README](../../README.md) and [security policy](../../SECURITY.md).
