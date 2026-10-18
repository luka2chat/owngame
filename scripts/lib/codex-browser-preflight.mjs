// macOS GUI registration aborts when Chromium is launched inside Codex Seatbelt.
// Stop before spawning a browser; request approval for the individual test instead.
if (process.platform === 'darwin' && process.env.CODEX_SANDBOX === 'seatbelt') {
  const error = new Error(
    'Browser test stopped before launching Chrome: the Codex macOS sandbox cannot ' +
    'register this browser with macOS. Use the supported browser tool, or rerun ' +
    'this individual test with require_escalated approval and a temporary profile. ' +
    'Do not unset CODEX_SANDBOX, retry the same sandboxed launch, disable global ' +
    'sandboxing, or close the user\'s running Chrome.'
  );
  error.code = 'CODEX_BROWSER_LAUNCH_REQUIRES_APPROVAL';
  throw error;
}
