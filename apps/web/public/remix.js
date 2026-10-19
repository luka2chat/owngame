import { track, gameParams, eventId } from "./analytics.js";
import { element } from "./data.js";

export const TOOLKIT_URL = "https://github.com/luka2chat/owngame";

export function remixPrompt(game, change = "") {
  const reference = "https://owngame.dev/play?game=" + encodeURIComponent(game.id);
  const brief = "https://owngame.dev/remix/" + encodeURIComponent(game.id) + ".json";
  return `请用 owngame 为我复刻并改编《${game.title}》（${reference}），做成我自己的可玩游戏。先阅读 ${TOOLKIT_URL} 的安装说明；如果尚未接入 owngame，按当前 AI 助手完成安装与配置。读取这款游戏的参考说明 ${brief}，并在能够使用浏览器时试玩原游戏。${game.sourceUrl ? "对应版本的完整源码：" + game.sourceUrl + "。阅读该目录的 LICENSE 和 THIRD_PARTY_NOTICES.md 后，再决定复用或改编。" : ""}玩法参考：${game.instructions} 视觉方向：${game.tag}；${game.description} ${change.trim() ? "我的改编要求：" + change.trim() + "。" : "先保留核心玩法，和我确定希望改变的主题或细节。"}美术优先，先给我看能运行的视觉与交互，再逐步完成规则、反馈和内容；使用自制或已获许可的素材。完成后实际试玩，检查重开、适用的存档续玩及电脑和手机尺寸，并告诉我如何运行以及还有哪些未验证。`;
}

// Shared by the library and player. Clipboard failure keeps an editable,
// selectable prompt available instead of reporting a copy that never happened.
export function openRemix(game) {
  let dialog = document.getElementById("remix-dialog");
  if (dialog?.open) return;
  dialog?.remove();
  const context={...gameParams(game),action_id:eventId()};
  const openedAt=performance.now();
  let copied=false, customized=false;
  dialog = element("dialog", "remix-dialog");
  dialog.id = "remix-dialog";
  dialog.setAttribute("aria-labelledby", "remix-title");
  const close = element("button", "remix-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "关闭复刻");
  close.onclick = () => dialog.close();
  dialog.addEventListener("close",()=>track("remix_close",{...context,outcome:copied?"copied":"without_copy",duration_ms:performance.now()-openedAt}));
  const eyebrow = element("div", "eyebrow", "YOUR GAME, YOUR RULES");
  const title = element("h2", "", "复刻 · " + game.title);
  title.id = "remix-title";
  const intro = element("p", "remix-intro", "把这段话交给你的 AI，让喜欢的游戏长成你的样子。");
  const label = element("label", "remix-label", "想怎么改？");
  label.htmlFor = "remix-change";
  const input = element("input", "remix-change");
  input.id = "remix-change";
  input.placeholder = "选填，例如：换成雨天咖啡馆的画风";
  input.maxLength = 500;
  const promptLabel = element("label", "remix-label", "给 AI 的话");
  promptLabel.htmlFor = "remix-prompt";
  const prompt = element("textarea", "remix-prompt");
  prompt.id = "remix-prompt";
  prompt.rows = 7;
  prompt.value = remixPrompt(game);
  prompt.spellcheck = false;
  const status = element("p", "remix-status", "正在复制…");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const actions = element("div", "remix-actions");
  const source = element("a", "remix-source", "了解 owngame ↗");
  source.href = TOOLKIT_URL;
  source.target = "_blank";
  source.rel = "noopener";
  source.onclick=()=>track("toolkit_click",{...context,target:"github",entry_point:"remix"});
  const copy = element("button", "remix-copy", "复制给 AI");
  copy.type = "button";
  let attempt = 0;
  async function copyPrompt(mode="manual") {
    const request = ++attempt;
    const text = prompt.value;
    copy.disabled = true;
    try {
      await navigator.clipboard.writeText(text);
      if (request !== attempt) return;
      copied=true;
      track("remix_copy",{...context,copy_mode:mode,is_customized:Number(customized)});
      status.textContent = "已复制。粘贴到 Codex、Cursor 或你使用的 AI 助手中。";
      copy.textContent = "✓ 已复制 · 再复制";
    } catch {
      if (request !== attempt) return;
      track("remix_copy_error",{...context,copy_mode:mode,reason:"clipboard_unavailable"});
      status.textContent = "浏览器未允许自动复制。请选中上方文字手动复制，再粘贴给 AI。";
      prompt.focus();
      prompt.select();
    } finally {
      if (request === attempt) copy.disabled = false;
    }
  }
  function changed() {
    if(!customized) track("remix_edit",context);
    customized=true;
    attempt++;
    copy.disabled = false;
    copy.textContent = "复制给 AI";
    status.textContent = "内容已修改，点击「复制给 AI」复制新版。";
  }
  input.oninput = () => { prompt.value = remixPrompt(game, input.value); changed(); };
  prompt.oninput = changed;
  copy.onclick = ()=>copyPrompt("manual");
  actions.append(source, copy);
  dialog.append(close, eyebrow, title, intro, label, input, promptLabel, prompt, status, actions);
  document.body.append(dialog);
  dialog.showModal();
  track("remix_open",context);
  void copyPrompt("auto");
}
