export const schemaVersion = "1";
export const events = new Set([
  "page_view", "catalog_ready", "catalog_error", "filter_select",
  "view_search_results", "search_clear", "game_impression", "game_select",
  "player_open", "player_frame_loaded", "player_load_timeout", "player_error",
  "player_focus", "player_restart", "player_fullscreen", "page_active_time",
  "favorite_change", "download_start", "download_progress", "download_complete",
  "download_error", "download_cached", "remix_open", "remix_edit",
  "remix_copy", "remix_copy_error", "remix_close", "toolkit_click",
  "offline_help", "install_prompt", "install_choice", "app_installed",
  "network_change", "scroll_depth", "shell_error",
]);
const strings = new Set([
  "game_id", "game_name", "game_category", "game_version", "entry_point", "filter",
  "search_id", "search_status", "action_id", "outcome", "reason", "copy_mode",
  "error_type", "target", "navigation_id",
]);
const numbers = new Set([
  "result_count", "position", "duration_ms", "progress_percent", "bytes",
  "is_favorite", "storage_saved", "is_customized", "is_offline_ready",
  "active_ms", "scroll_percent", "game_count", "has_search", "load_number",
]);
// Free text is accepted only for short, game-related searches. Reject likely
// identifiers/URLs instead of masking them and accidentally leaking fragments.
export function safeSearch(value) {
  const text = String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  if (!text || text.length > 60 || /[@:/\\?=<>\n\r]|\d[\d\s()+.-]{5,}\d|(?:token|password|密码|手机|电话|邮箱|身份证|住址|姓名|我叫)/i.test(text)) return "";
  return /^[\p{L}\p{N}\s·'!&+_.-]+$/u.test(text) ? text : "";
}
export function cleanParams(params = {}) {
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === "search_term") { const term = safeSearch(value); if (term) out[key] = term; }
    else if (strings.has(key) && typeof value === "string") out[key] = value.slice(0, 100);
    else if (numbers.has(key) && Number.isFinite(value)) out[key] = Math.max(0, Math.round(value));
  }
  return out;
}
