# Koda GitHub Action

The optional Koda GitHub Action runs the same Koda command-line runtime inside a GitHub Actions runner. It is intended for carefully scoped issue and pull-request automation with explicit repository permissions and reviewable workflow configuration.

## Appropriate use

Use the action for a narrowly defined repository automation task, such as triaging a labeled issue, responding to an authorized pull-request comment, or preparing a small implementation branch. Treat workflow prompts, issue text, pull-request comments, and repository files as untrusted input. Restrict credentials, write permissions, and automation triggers to the minimum required scope.

| Capability | Control |
|---|---|
| Model selection | Supply an explicit `model` input. |
| Agent selection | Set `agent` only to a reviewed primary agent definition. |
| Prompt scope | Use `prompt` for an explicit workflow objective. |
| Trigger phrases | Set `mentions` to the smallest intended command set. |
| Repository writes | Grant `contents`, `issues`, and pull-request permissions only when the workflow must modify them. |
| Authentication | Use encrypted GitHub Actions secrets; never place provider tokens in workflow text. |

## Example workflow

Create a workflow in `.github/workflows/koda.yml`, then review the trigger and permission boundaries with repository maintainers before enabling it.

```yaml
name: Koda assistant

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

permissions:
  contents: write
  pull-requests: write
  issues: write
  id-token: write

jobs:
  koda:
    if: |
      contains(github.event.comment.body, '/koda') ||
      contains(github.event.comment.body, '/kc')
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          persist-credentials: false

      - name: Run Koda
        uses: pooraddyy/koda/github@main
        with:
          model: anthropic/claude-sonnet-4-20250514
          prompt: "Work only on the explicitly requested change and run focused validation."
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Pin the action to a reviewed tag or commit SHA before adopting it in a high-trust repository. The `main` reference above is a readable example, not an immutable supply-chain pin.

## Inputs

| Input | Required | Purpose |
|---|---|---|
| `model` | Yes | The provider/model identifier used for the workflow run. |
| `agent` | No | A reviewed primary agent name; otherwise Koda uses the configured default. |
| `prompt` | No | A workflow-specific objective that overrides the default prompt. |
| `mentions` | No | Comma-separated, case-insensitive invocation phrases. |
| `share` | No | Controls session-sharing behavior for supported runtime configurations. |
| `variant` | No | Provider-specific reasoning or model-variant setting where supported. |
| `use_github_token` | No | Uses the runner `GITHUB_TOKEN` instead of the application token exchange path. |
| `oidc_base_url` | No | Custom OIDC exchange endpoint for a reviewed app installation. |
| `koda_api_key` / `koda_org_id` | No | Optional gateway credentials supplied as encrypted secrets. |

## Test and troubleshoot

Test in a disposable repository or branch first. Confirm that the action installs Koda, receives only the expected event data, honors the configured mention trigger, and has no broader repository permission than it needs. Keep logs free of secrets and disable the workflow when a permission or provider configuration is under investigation.

The composite action definition is [`action.yml`](action.yml). The Koda command implementation remains in the CLI package, so terminal behavior and focused tests should be validated there before changing automation behavior.
