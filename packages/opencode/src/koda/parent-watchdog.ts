import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "parent-watchdog" })

/**
 * Exit the server when its configured supervising process dies.
 *
 * A supervisor can run `koda serve` as a child process. A graceful shutdown signals
 * the server, but a hard kill, crash, or out-of-memory termination can orphan it. The
 * supervisor passes its PID via `koda_PARENT_PID`; Koda polls that PID and re-parenting
 * so the server shuts itself down when the supervisor is gone.
 *
 * No-op unless `koda_PARENT_PID` is set to a valid PID, so a manually launched
 * `koda serve` (whose parent shell exiting may be intentional) is never affected.
 *
 * Returns a function that stops the watchdog.
 */
export function startParentWatchdog(onOrphan: () => void, intervalMs = 1000): () => void {
  const configured = Number(process.env["koda_PARENT_PID"])
  if (!Number.isInteger(configured) || configured <= 0) return () => {}
  const initial = process.ppid
  log.info("watching parent process", { parent: configured, ppid: initial, intervalMs })
  const timer = setInterval(() => {
    if (!orphaned(configured, initial)) return
    clearInterval(timer)
    log.info("parent process gone — shutting down server", { parent: configured })
    onOrphan()
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}

function orphaned(parent: number, initial: number): boolean {
  // Re-parented away from the spawner (parent already exited on some platforms).
  if (initial !== 1 && process.ppid !== initial) return true
  if (parent === 1) return false
  try {
    // Signal 0 probes liveness without delivering a signal.
    process.kill(parent, 0)
    return false
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ESRCH") return true
    // EPERM etc. means the process still exists; treat only "no such process" as dead.
    log.debug("parent liveness check inconclusive", { parent, code })
    return false
  }
}
