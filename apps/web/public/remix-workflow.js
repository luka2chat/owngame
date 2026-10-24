import { element } from "./data.js";
import { t } from "./i18n.js";
import {
  createWorkflow,
  createStep,
  stepKinds,
  stepLabels,
  fieldLabels,
  maxSteps,
  validateWorkflow,
  workflowIssues,
  workflowPrompt,
  executionOrder,
  arrangeSteps,
} from "./remix-workflow-model.js";

const keyFor = (id) => "owngame:remix-workflow:" + id;
const clone = (value) => structuredClone(value);
const button = (label, action, cls = "") => {
  const node = element("button", "workflow-button " + cls, t(label));
  node.type = "button";
  node.onclick = action;
  return node;
};

export function createRemixWorkflow(host, game, { onEdit, onCopy } = {}) {
  const key = keyFor(game.id);
  let plan = createWorkflow(game),
    selected = plan.steps[0].id,
    zoom = 1;
  let stored = null,
    conflict = false,
    disposed = false,
    copyAttempt = 0;
  let notice = "草稿仅保存在当前浏览器，可导出备份。";
  let history = [],
    future = [];
  try {
    stored = localStorage.getItem(key);
    if (stored) {
      plan = validateWorkflow(JSON.parse(stored), game.id);
      selected = plan.steps[0].id;
      notice = "已恢复这款游戏的草稿。";
    }
  } catch {
    if (stored) {
      conflict = true;
      notice = "已有草稿无法读取。可导出当前方案，或导入有效备份继续。";
    } else {
      notice = "浏览器无法保存草稿，请导出备份。";
    }
  }

  const toolbar = element("div", "workflow-toolbar");
  const workspace = element("div", "workflow-workspace");
  const viewport = element("div", "workflow-viewport");
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", t("工作流画布"));
  const surface = element("div", "workflow-surface");
  const board = element("div", "workflow-board");
  const inspector = element("section", "workflow-inspector");
  inspector.setAttribute("aria-label", t("步骤详情"));
  surface.append(board);
  viewport.append(surface);
  workspace.append(viewport, inspector);
  const meta = element("div", "workflow-meta");
  const saveStatus = element("p", "workflow-save");
  saveStatus.setAttribute("role", "status");
  const errors = element("p", "workflow-errors");
  errors.setAttribute("role", "alert");
  const output = element("details", "workflow-output");
  const summary = element("summary", "", t("预览给 AI 的完整方案"));
  const preview = element("textarea", "remix-prompt");
  preview.readOnly = true;
  preview.rows = 8;
  preview.setAttribute("aria-label", t("完整工作流方案"));
  output.append(summary, preview);
  const footer = element("div", "workflow-footer");
  const copyStatus = element("p", "remix-status");
  copyStatus.setAttribute("role", "status");
  const copy = button(
    "复制工作流给 AI",
    async () => {
      const request = ++copyAttempt,
        text = preview.value;
      copy.disabled = true;
      try {
        await navigator.clipboard.writeText(text);
        if (disposed || request !== copyAttempt) return;
        copyStatus.textContent = t(
          "已复制。粘贴到 Codex、Cursor 或你使用的 AI 助手中。",
        );
        onCopy?.();
      } catch {
        if (disposed || request !== copyAttempt) return;
        output.open = true;
        preview.focus();
        preview.select();
        copyStatus.textContent = t(
          "浏览器未允许自动复制。请选中上方文字手动复制，再粘贴给 AI。",
        );
      } finally {
        if (!disposed && request === copyAttempt)
          copy.disabled = workflowIssues(plan).length > 0;
      }
    },
    "workflow-primary",
  );
  const download = button("导出方案", () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(plan, null, 2) + "\n"], {
        type: "application/json",
      }),
    );
    const link = element("a");
    link.href = url;
    link.download = game.id + "-remix-workflow.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const file = element("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.hidden = true;
  file.onchange = async () => {
    const incoming = file.files[0];
    if (!incoming) return;
    try {
      if (incoming.size > 1024 * 1024) throw Error("工作流文件不能超过 1 MB。");
      const next = validateWorkflow(JSON.parse(await incoming.text()), game.id);
      if (disposed) return;
      // Import is explicit replacement and remains undoable. A broken draft is retained until this action.
      history.push(clone(plan));
      future = [];
      plan = next;
      selected = plan.steps[0].id;
      conflict = false;
      try {
        stored = localStorage.getItem(key);
      } catch {}
      save();
      render();
    } catch (error) {
      notice =
        error instanceof SyntaxError
          ? "这不是当前游戏的有效工作流文件。"
          : error.message;
      renderStatus();
    } finally {
      file.value = "";
    }
  };
  const importButton = button("导入方案", () => file.click());
  footer.append(download, importButton, copy);
  host.append(
    meta,
    toolbar,
    saveStatus,
    workspace,
    errors,
    output,
    copyStatus,
    footer,
    file,
  );

  function renderStatus() {
    saveStatus.textContent = t(notice);
    if (
      plan.reference.version &&
      game.version &&
      plan.reference.version !== game.version
    )
      saveStatus.append(
        element(
          "span",
          "workflow-version-note",
          t("草稿参考的是较早版本，交给 AI 前请核对原游戏变化。"),
        ),
      );
  }
  function save() {
    copyAttempt++;
    copyStatus.textContent = "";
    onEdit?.();
    try {
      if (conflict || localStorage.getItem(key) !== stored) {
        conflict = true;
        notice = "另一个窗口已修改草稿。请先导出当前方案，再载入最新草稿。";
      } else {
        const data = JSON.stringify(validateWorkflow(plan, game.id));
        localStorage.setItem(key, data);
        stored = data;
        notice = "已保存到当前浏览器。";
      }
    } catch {
      notice = "浏览器无法保存草稿，请导出备份。";
    }
    renderStatus();
  }
  function update(change, redraw = true) {
    history.push(clone(plan));
    if (history.length > 35) history.shift();
    future = [];
    change();
    save();
    if (redraw) render();
    else {
      renderBoard();
      renderOutput();
      renderToolbar();
    }
  }
  function renderOutput() {
    const issues = workflowIssues(plan);
    errors.textContent = issues.join(" ");
    errors.hidden = !issues.length;
    copy.disabled = Boolean(issues.length);
    preview.value = issues.length ? "" : workflowPrompt(plan);
  }
  function field(
    parent,
    label,
    value,
    change,
    { area = false, max = 4000, name = label } = {},
  ) {
    const wrap = element("label", "workflow-field");
    wrap.append(element("span", "", t(label)));
    const input = element(area ? "textarea" : "input");
    input.value = value;
    input.maxLength = max;
    input.name = name;
    if (area) input.rows = 3;
    input.oninput = () => update(() => change(input.value), false);
    wrap.append(input);
    parent.append(wrap);
    return input;
  }
  function toggle(parent, label, checked, action) {
    const wrap = element("label", "workflow-toggle");
    const input = element("input");
    input.type = "checkbox";
    input.checked = checked;
    input.onchange = () => action(input.checked);
    wrap.append(input, element("span", "", label));
    parent.append(wrap);
    return input;
  }
  function renderMeta() {
    meta.replaceChildren();
    field(meta, "方案名称", plan.title, (value) => (plan.title = value), {
      max: 160,
    });
    field(meta, "整体目标", plan.goal, (value) => (plan.goal = value), {
      area: true,
    });
    const targets = element("fieldset", "workflow-targets");
    targets.append(element("legend", "", t("目标平台")));
    for (const target of ["mobile", "pc"]) {
      const input = toggle(
        targets,
        target === "pc" ? "PC" : t("移动端"),
        plan.targets.includes(target),
        (enabled) => {
          update(
            () =>
              (plan.targets = enabled
                ? [...plan.targets, target]
                : plan.targets.filter((p) => p !== target)),
          );
        },
      );
      input.disabled =
        plan.targets.length === 1 && plan.targets.includes(target);
    }
    meta.append(targets);
  }
  function renderToolbar() {
    toolbar.replaceChildren();
    const kind = element("select");
    kind.setAttribute("aria-label", t("新增步骤类型"));
    for (const value of stepKinds) {
      const option = element("option", "", t(stepLabels[value]));
      option.value = value;
      kind.append(option);
    }
    kind.value = "custom";
    const add = button("＋ 添加步骤", () =>
      update(() => {
        const step = createStep(
          kind.value,
          "step-" + crypto.randomUUID(),
          plan.steps.length,
        );
        plan.steps.push(step);
        selected = step.id;
      }),
    );
    add.disabled = plan.steps.length >= maxSteps;
    const undo = button("撤销", () => {
      future.push(clone(plan));
      plan = history.pop();
      save();
      render();
    });
    undo.disabled = !history.length;
    const redo = button("重做", () => {
      history.push(clone(plan));
      plan = future.pop();
      save();
      render();
    });
    redo.disabled = !future.length;
    const arrange = button("整理画布", () =>
      update(() => {
        arrangeSteps(plan.steps);
      }),
    );
    const less = button("−", () => {
      zoom = Math.max(0.25, zoom - 0.1);
      renderBoard();
      renderToolbar();
    });
    less.setAttribute("aria-label", t("缩小画布"));
    less.disabled = zoom <= 0.25;
    const more = button("＋", () => {
      zoom = Math.min(1.5, zoom + 0.1);
      renderBoard();
      renderToolbar();
    });
    more.setAttribute("aria-label", t("放大画布"));
    more.disabled = zoom >= 1.5;
    toolbar.append(
      kind,
      add,
      undo,
      redo,
      arrange,
      button("适合画布", fitCanvas),
      less,
      element("span", "workflow-zoom", Math.round(zoom * 100) + "%"),
      more,
    );
    if (conflict)
      toolbar.append(
        button("载入最新草稿", () => {
          try {
            const latest = localStorage.getItem(key);
            const next = latest
              ? validateWorkflow(JSON.parse(latest), game.id)
              : createWorkflow(game);
            history.push(clone(plan));
            future = [];
            plan = next;
            stored = latest;
            conflict = false;
            notice = "已恢复这款游戏的草稿。";
            render();
          } catch {
            notice = "已有草稿无法读取。可导出当前方案，或导入有效备份继续。";
            renderStatus();
          }
        }),
      );
  }
  function renderBoard() {
    board.replaceChildren();
    const width = Math.max(900, ...plan.steps.map((s) => s.x + 280));
    const height = Math.max(470, ...plan.steps.map((s) => s.y + 210));
    board.style.width = width + "px";
    board.style.height = height + "px";
    board.style.transform = `scale(${zoom})`;
    surface.style.width = width * zoom + "px";
    surface.style.height = height * zoom + "px";
    const ns = "http://www.w3.org/2000/svg",
      svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("aria-hidden", "true");
    const defs = document.createElementNS(ns, "defs"),
      marker = document.createElementNS(ns, "marker"),
      arrow = document.createElementNS(ns, "path");
    marker.id = "workflow-arrow";
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrow.setAttribute("fill", "#075bb4");
    marker.append(arrow);
    defs.append(marker);
    svg.append(defs);
    for (const step of plan.steps)
      for (const id of step.dependsOn) {
        const from = plan.steps.find((s) => s.id === id);
        if (!from) continue;
        const line = document.createElementNS(ns, "path"),
          x1 = from.x + 244,
          y1 = from.y + 80,
          x2 = step.x,
          y2 = step.y + 80;
        line.setAttribute(
          "d",
          `M ${x1} ${y1} C ${x1 + 54} ${y1}, ${x2 - 54} ${y2}, ${x2 - 4} ${y2}`,
        );
        line.setAttribute("marker-end", "url(#workflow-arrow)");
        if (!step.enabled || !from.enabled) line.classList.add("is-disabled");
        svg.append(line);
      }
    board.append(svg);
    const ordered = executionOrder(plan.steps);
    for (const step of plan.steps) {
      const card = element(
        "article",
        "workflow-card kind-" +
          step.kind +
          (step.id === selected ? " is-selected" : "") +
          (step.enabled ? "" : " is-disabled"),
      );
      card.style.left = step.x + "px";
      card.style.top = step.y + "px";
      const handle = button("拖动步骤", null, "workflow-drag");
      handle.textContent = "⠿ " + t(stepLabels[step.kind]);
      handle.setAttribute(
        "aria-label",
        t("移动「{title}」；也可用方向键", { title: step.title }),
      );
      handle.onkeydown = (event) => {
        const delta = {
          ArrowLeft: [-20, 0],
          ArrowRight: [20, 0],
          ArrowUp: [0, -20],
          ArrowDown: [0, 20],
        }[event.key];
        if (!delta) return;
        event.preventDefault();
        update(() => {
          step.x = Math.max(0, Math.min(6000, step.x + delta[0]));
          step.y = Math.max(0, Math.min(6000, step.y + delta[1]));
        }, false);
        board.querySelector(`[data-handle="${step.id}"]`)?.focus();
      };
      handle.dataset.handle = step.id;
      handle.onpointerdown = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const before = clone(plan),
          startX = event.clientX,
          startY = event.clientY,
          x = step.x,
          y = step.y;
        handle.onpointermove = (move) => {
          step.x = Math.max(
            0,
            Math.min(6000, x + (move.clientX - startX) / zoom),
          );
          step.y = Math.max(
            0,
            Math.min(6000, y + (move.clientY - startY) / zoom),
          );
          card.style.left = step.x + "px";
          card.style.top = step.y + "px";
        };
        const finish = (event) => {
          handle.onpointermove = null;
          handle.onpointerup = null;
          handle.onpointercancel = null;
          if (event.type === "pointercancel") {
            step.x = x;
            step.y = y;
          } else if (step.x !== x || step.y !== y) {
            history.push(before);
            if (history.length > 35) history.shift();
            future = [];
            save();
          }
          renderBoard();
          renderToolbar();
        };
        handle.onpointerup = finish;
        handle.onpointercancel = finish;
      };
      const select = button(
        step.title || t("未命名步骤"),
        () => {
          selected = step.id;
          renderBoard();
          renderInspector();
          inspector.querySelector("input")?.focus({ preventScroll: true });
        },
        "workflow-select",
      );
      // User-authored titles must not be run through the translation dictionary.
      select.textContent = step.title || t("未命名步骤");
      select.setAttribute("aria-pressed", String(step.id === selected));
      card.append(
        handle,
        element(
          "span",
          "workflow-number",
          String(ordered.indexOf(step) + 1).padStart(2, "0"),
        ),
        select,
        element(
          "p",
          "workflow-card-detail",
          step.change || step.preserve || t("点击填写这一步的具体要求。"),
        ),
        element(
          "span",
          "workflow-badge",
          t(
            !step.enabled
              ? "已停用"
              : step.checkpoint
                ? "完成后等我确认"
                : "验证后继续",
          ),
        ),
      );
      board.append(card);
    }
  }
  function fitCanvas() {
    zoom = Math.max(
      0.02,
      Math.min(
        1,
        (viewport.clientWidth - 8) / board.offsetWidth,
        (viewport.clientHeight - 8) / board.offsetHeight,
      ),
    );
    viewport.scrollTo(0, 0);
    renderBoard();
    renderToolbar();
  }
  function renderInspector() {
    if (!plan.steps.some((s) => s.id === selected)) selected = plan.steps[0].id;
    const step = plan.steps.find((s) => s.id === selected),
      index = plan.steps.indexOf(step);
    inspector.replaceChildren(element("h3", "", t("步骤详情")));
    field(inspector, "步骤名称", step.title, (value) => (step.title = value), {
      max: 160,
      name: "step-title",
    });
    const switches = element("div", "workflow-switches");
    toggle(switches, t("启用这一步"), step.enabled, (value) =>
      update(() => (step.enabled = value)),
    );
    toggle(switches, t("完成后等我确认"), step.checkpoint, (value) =>
      update(() => (step.checkpoint = value)),
    );
    inspector.append(switches);
    for (const [key, label] of Object.entries(fieldLabels))
      field(inspector, label, step[key], (value) => (step[key] = value), {
        area: true,
        name: key,
      });
    const deps = element("fieldset", "workflow-dependencies");
    deps.append(element("legend", "", t("前置步骤")));
    deps.append(element("p", "", t("这些步骤完成后，才开始当前步骤。")));
    for (const other of plan.steps.filter((s) => s.id !== selected)) {
      let cyclic = false;
      try {
        executionOrder(
          plan.steps.map((s) =>
            s.id === selected
              ? { ...s, dependsOn: [...new Set([...s.dependsOn, other.id])] }
              : s,
          ),
        );
      } catch {
        cyclic = true;
      }
      const input = toggle(
        deps,
        other.title || t("未命名步骤"),
        step.dependsOn.includes(other.id),
        (enabled) =>
          update(() => {
            step.dependsOn = enabled
              ? [...step.dependsOn, other.id]
              : step.dependsOn.filter((id) => id !== other.id);
          }),
      );
      input.disabled = cyclic;
      if (cyclic) input.parentElement.title = t("会形成循环依赖，不能连接。");
    }
    inspector.append(deps);
    const order = element("div", "workflow-step-actions");
    const move = (delta) =>
      update(() => {
        const [s] = plan.steps.splice(index, 1);
        plan.steps.splice(index + delta, 0, s);
      });
    const up = button("优先提前", () => move(-1));
    up.disabled = index === 0;
    const down = button("优先延后", () => move(1));
    down.disabled = index === plan.steps.length - 1;
    const remove = button("删除步骤", () =>
      update(() => {
        plan.steps.splice(index, 1);
        for (const s of plan.steps)
          s.dependsOn = s.dependsOn.filter((id) => id !== step.id);
        selected = plan.steps[Math.min(index, plan.steps.length - 1)].id;
      }),
    );
    remove.disabled = plan.steps.length === 1;
    order.append(up, down, remove);
    inspector.append(
      order,
      element(
        "p",
        "workflow-hint",
        t("依赖优先于排列顺序。拖动只调整画布位置；删除可撤销。"),
      ),
    );
  }
  function render() {
    if (!plan.steps.some((s) => s.id === selected)) selected = plan.steps[0].id;
    renderMeta();
    renderToolbar();
    renderStatus();
    renderBoard();
    renderInspector();
    renderOutput();
  }
  const onStorage = (event) => {
    if (
      (event.key === key || event.key === null) &&
      event.newValue !== stored
    ) {
      conflict = true;
      notice = "另一个窗口已修改草稿。请先导出当前方案，再载入最新草稿。";
      renderStatus();
      renderToolbar();
    }
  };
  window.addEventListener("storage", onStorage);
  render();
  requestAnimationFrame(() => {
    if (!disposed && !host.hidden && viewport.clientWidth > 600) fitCanvas();
  });
  return {
    refreshLanguage() {
      summary.textContent = t("预览给 AI 的完整方案");
      preview.setAttribute("aria-label", t("完整工作流方案"));
      copy.textContent = t("复制工作流给 AI");
      download.textContent = t("导出方案");
      importButton.textContent = t("导入方案");
      copyAttempt++;
      copyStatus.textContent = "";
      render();
    },
    dispose() {
      disposed = true;
      copyAttempt++;
      window.removeEventListener("storage", onStorage);
    },
  };
}
