# Security Policy

Koda is an AI-assisted developer tool that can read project files, propose edits, run permitted shell commands, connect to configured model providers, and optionally expose local server endpoints. Security therefore depends on both the codebase and the environment in which it is run.

## Security boundary

> **Koda's permission prompts support informed operator control; they are not a hardened isolation boundary.**

Run Koda only in workspaces whose files, dependencies, instructions, and configured tools you are prepared to trust. If a task needs strong isolation from local files, credentials, or network resources, run the CLI inside an appropriately configured container, virtual machine, or dedicated account.

| Area | Operator responsibility |
|---|---|
| File and shell permissions | Review the requested scope before approval and avoid broad automatic approval in untrusted repositories. |
| Model providers | Understand the provider's data-handling terms before sending source code, prompts, or logs. |
| MCP and custom tools | Treat external servers and plugins as third-party code with their own authority and data paths. |
| Server mode | Bind conservatively, set `koda_SERVER_PASSWORD`, and protect any reachable endpoint with network controls. |
| Project configuration | Review local configuration, hooks, command templates, and instruction files before trusting their behavior. |

## Server mode

The local server mode is opt-in. When it is enabled, set `koda_SERVER_PASSWORD` to require HTTP Basic authentication. An instance started without that variable is intentionally unauthenticated and must only be used for short-lived, local testing in a trusted environment.

Do not expose a password-free server to a LAN, public tunnel, reverse proxy, or shared development host. A password is necessary but may not be sufficient: TLS termination, firewall rules, host binding, and credential handling remain the operator's responsibility.

## Report a vulnerability

Please avoid publishing exploitable details in a public issue before maintainers have had a reasonable opportunity to investigate. Use the repository's private security reporting option when it is available. If private reporting is unavailable, open a minimal public issue requesting a secure contact channel without including proof-of-concept code, credentials, target URLs, or affected user data.

Include a clear description of the impact, supported versions or commit identifiers, reliable reproduction steps, and the least sensitive proof needed to demonstrate the issue. Reports generated solely from automated or AI-assisted scanning must be independently reproduced and triaged by the reporter before submission.

## Scope guidance

The following situations commonly reflect the intended operating model rather than a vulnerability by themselves.

| Situation | Why it is normally out of scope |
|---|---|
| An operator exposes a local server without access controls | Server mode is explicitly opt-in and must be secured by the operator. |
| A permission prompt is approved for a harmful command | Approval decisions are operator-controlled and should be reviewed. |
| A configured model provider retains submitted data | Provider data handling is governed by the provider's own policy and account terms. |
| A third-party MCP server performs an unsafe action | External MCP servers lie outside Koda's trusted implementation boundary. |
| A trusted local configuration directs Koda to take an action | Project configuration is executable instruction surface and must be reviewed before use. |

This guidance does not pre-judge a report. If a behavior crosses Koda's stated permission, authentication, or isolation boundary, report it with enough detail for a maintainer to reproduce it safely.
