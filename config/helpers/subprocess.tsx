import Gio from "gi://Gio";

/**
 * Run a shell command without blocking the GTK main loop and resolve with
 * the captured stdout. We use Gio.Subprocess (the GLib-blessed async-IO
 * primitive) so the result lands on the main thread via the GLib MainContext
 * — no manual `idle_add` plumbing required.
 *
 * Errors and non-zero exits resolve to `null` rather than rejecting; callers
 * uniformly want "if it didn't work, fall through" semantics, and we'd
 * otherwise need a try/catch at every call site.
 */
export function runAsync(argv: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let proc: Gio.Subprocess;
    try {
      proc = Gio.Subprocess.new(
        argv,
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
      );
    } catch {
      resolve(null);
      return;
    }

    proc.communicate_utf8_async(null, null, (_p, res) => {
      try {
        const [success, stdout] = proc.communicate_utf8_finish(res);
        if (!success || !proc.get_successful()) {
          resolve(null);
          return;
        }
        resolve(stdout ?? null);
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Fire-and-forget command spawn that doesn't block the main loop and
 * doesn't capture output. Use for action commands (e.g. `nmcli connection
 * up`, `systemctl reboot`, compositor exit). Logs spawn-time failures to
 * console; runtime failures of the spawned process are not observable
 * (by design — same as `g_spawn_async`).
 */
export function spawnDetached(argv: string[]): void {
  try {
    Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
  } catch (e) {
    console.error("spawnDetached failed:", argv.join(" "), e);
  }
}
