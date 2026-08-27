# Local Control-Plane Simulation

This development plugin simulates one remote workspace through local terminal processes. It is intended for focused protocol and lifecycle debugging; it is not a production deployment method and it intentionally supports only one active debug workspace at a time.

## Start the simulation

Add the local debug plugin to a project-level Koda configuration file.

```jsonc
{
  "plugin": ["../packages/opencode/src/control-plane/dev/debug-workspace-plugin.ts"]
}
```

In a separate terminal from the repository root, start the companion workspace-server watcher.

```bash
./packages/opencode/script/run-workspace-server
```

Launch Koda in the configured project and create a `debug` workspace. The plugin writes the selected workspace identifier and port to the coordination file; the watcher observes that state and starts the companion local server. The primary session then proxies requests to that server as though it were a remote workspace.

## Operational model

| Component | Responsibility |
| --- | --- |
| Debug workspace plugin | Writes the workspace identity and selected port when a debug workspace is created. |
| Workspace-server watcher | Waits for coordination state, starts the local service, and restarts it when a newer debug workspace replaces it. |
| Koda terminal session | Routes the debug workspace’s requests through the simulated remote boundary. |

Creating another debug workspace replaces the previous simulation. Older debug sessions will no longer connect because their local counterpart has been stopped. Keep test sessions short, stop the watcher when finished, and avoid storing credentials or real customer data in the debug workspace.

## Verification checklist

Confirm the watcher starts only after a debug workspace is created, the selected session reaches the expected local service, and an old workspace becomes unavailable after replacement. Capture terminal output and run the narrowest relevant protocol test before treating a control-plane change as verified.
