import { t, localizeGame } from "./i18n.js";
import { platforms, supportsPlatform } from "./platforms.js";

export const workflowSchema = "owngame.remix-workflow.v1";
export const stepKinds = [
  "reference",
  "art",
  "rules",
  "levels",
  "controls",
  "validation",
  "custom",
];
export const stepLabels = {
  reference: "参考与目标",
  art: "画面与素材",
  rules: "玩法与规则",
  levels: "场景与关卡",
  controls: "操作与反馈",
  validation: "试玩与交付",
  custom: "自定义步骤",
};
export const fieldLabels = {
  preserve: "保留什么",
  change: "调整什么",
  details: "具体参数与细节",
  acceptance: "怎样算完成",
};
export const maxSteps = 30;

export function createStep(kind, id, index = 0) {
  return {
    id,
    kind,
    title: t(stepLabels[kind]),
    enabled: true,
    checkpoint: false,
    preserve: "",
    change: "",
    details: "",
    acceptance: "",
    dependsOn: [],
    x: 36 + (index % 3) * 292,
    y: 36 + Math.floor(index / 3) * 218,
  };
}

export function createWorkflow(game) {
  const display = localizeGame(game);
  const steps = stepKinds
    .filter((k) => k !== "custom")
    .map((kind, i) => createStep(kind, kind, i));
  Object.assign(steps[0], {
    preserve: display.instructions || "",
    change: t("先保留核心玩法，明确这次想改编的体验。"),
    acceptance: t("记录已确认的方向与待决定的问题。"),
    checkpoint: true,
  });
  Object.assign(steps[1], {
    preserve: [display.tag, display.description].filter(Boolean).join(" · "),
    change: t("确定画风、配色、角色与素材方向。"),
    acceptance: t("展示能运行的视觉与交互；注明素材来源与许可。"),
    dependsOn: ["reference"],
    checkpoint: true,
  });
  Object.assign(steps[2], {
    preserve: display.instructions || "",
    change: t("细化规则、胜负条件、难度与数值。"),
    acceptance: t("完整玩法循环可玩，关键边界与无效操作有验证。"),
    dependsOn: ["reference"],
  });
  Object.assign(steps[3], {
    change: t("设计场景、关卡目标、布局和难度递进。"),
    acceptance: t("在实际游戏里验证关卡可完成；静态预览不算试玩。"),
    dependsOn: ["art", "rules"],
  });
  Object.assign(steps[4], {
    change: t("调整操作方式、界面、动画、音效与反馈。"),
    acceptance: t("目标设备操作有响应，布局清楚，支持重开。"),
    dependsOn: ["art", "rules"],
  });
  Object.assign(steps[5], {
    change: t("试玩完整流程，检查性能与适用的存档续玩。"),
    acceptance: t("给出运行方式、实际验证证据及尚未验证的项目。"),
    dependsOn: ["levels", "controls"],
    checkpoint: true,
  });
  arrangeSteps(steps);
  return {
    schema: workflowSchema,
    gameId: game.id,
    title: display.title + " · " + t("复杂复刻"),
    goal: "",
    targets: platforms.filter((target) => supportsPlatform(game, target)),
    reference: {
      title: display.title,
      version: game.version || "",
      sourceUrl: game.sourceUrl || "",
      sourceCommit: game.sourceCommit || "",
    },
    steps,
  };
}

// Array order is the preferred execution order among steps whose dependencies are ready.
export function executionOrder(steps) {
  const pending = [...steps],
    result = [],
    done = new Set();
  while (pending.length) {
    const index = pending.findIndex((s) =>
      s.dependsOn.every((id) => done.has(id)),
    );
    if (index < 0) throw Error("工作流存在循环或缺失的前置步骤。");
    const [step] = pending.splice(index, 1);
    result.push(step);
    done.add(step.id);
  }
  return result;
}

export function arrangeSteps(steps) {
  const ordered = executionOrder(steps),
    depths = new Map(),
    columns = [];
  for (const step of ordered) {
    const depth =
      Math.max(-1, ...step.dependsOn.map((id) => depths.get(id))) + 1;
    depths.set(step.id, depth);
    (columns[depth] ||= []).push(step);
  }
  const rows = Math.max(...columns.map((column) => column.length));
  // Keep very large plans within the bounded canvas; typical plans read left to right.
  if (columns.length > 6 || rows > 8) {
    ordered.forEach((step, index) => {
      step.x = 36 + (index % 3) * 292;
      step.y = 36 + Math.floor(index / 3) * 218;
    });
    return;
  }
  columns.forEach((column, depth) =>
    column.forEach((step, row) => {
      step.x = 36 + depth * 292;
      step.y = 36 + (row + (rows - column.length) / 2) * 218;
    }),
  );
}

// Reject malformed or oversized drafts before they reach rendering or local storage.
export function validateWorkflow(value, gameId) {
  const fail = () => {
    throw Error("这不是当前游戏的有效工作流文件。");
  };
  const string = (v, limit) => typeof v === "string" && v.length <= limit;
  if (
    !value ||
    value.schema !== workflowSchema ||
    value.gameId !== gameId ||
    !string(value.title, 160) ||
    !string(value.goal, 4000) ||
    !Array.isArray(value.targets) ||
    !value.targets.length ||
    value.targets.length > 2 ||
    new Set(value.targets).size !== value.targets.length ||
    value.targets.some((p) => !platforms.includes(p)) ||
    !value.reference ||
    Object.values(value.reference).some((v) => !string(v, 2000)) ||
    !["title", "version", "sourceUrl", "sourceCommit"].every((k) =>
      string(value.reference[k], 2000),
    ) ||
    !Array.isArray(value.steps) ||
    !value.steps.length ||
    value.steps.length > maxSteps
  )
    fail();
  const ids = new Set();
  for (const s of value.steps) {
    if (
      !s ||
      !string(s.id, 80) ||
      !/^[a-zA-Z0-9_-]+$/.test(s.id) ||
      ids.has(s.id) ||
      !stepKinds.includes(s.kind) ||
      !string(s.title, 160) ||
      !Object.keys(fieldLabels).every((k) => string(s[k], 4000)) ||
      typeof s.enabled !== "boolean" ||
      typeof s.checkpoint !== "boolean" ||
      ![s.x, s.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 6000) ||
      !Array.isArray(s.dependsOn) ||
      s.dependsOn.length > maxSteps ||
      new Set(s.dependsOn).size !== s.dependsOn.length
    )
      fail();
    ids.add(s.id);
  }
  for (const s of value.steps)
    if (s.dependsOn.some((id) => !ids.has(id) || id === s.id)) fail();
  executionOrder(value.steps);
  // Copy known fields only; an import is data, never executable markup or configuration.
  return {
    schema: workflowSchema,
    gameId,
    title: value.title,
    goal: value.goal,
    targets: [...value.targets],
    reference: Object.fromEntries(
      ["title", "version", "sourceUrl", "sourceCommit"].map((k) => [
        k,
        value.reference[k],
      ]),
    ),
    steps: value.steps.map((s) =>
      Object.fromEntries(
        [
          "id",
          "kind",
          "title",
          "enabled",
          "checkpoint",
          ...Object.keys(fieldLabels),
          "x",
          "y",
          "dependsOn",
        ].map((k) => [k, k === "dependsOn" ? [...s[k]] : s[k]]),
      ),
    ),
  };
}

export function workflowIssues(plan) {
  const active = plan.steps.filter((s) => s.enabled),
    ids = new Set(active.map((s) => s.id));
  const issues = [];
  if (!plan.targets.length) issues.push(t("至少选择一个目标平台。"));
  if (!active.length) issues.push(t("至少启用一个步骤。"));
  for (const step of active) {
    if (!step.title.trim()) issues.push(t("请填写步骤名称。"));
    if (step.dependsOn.some((id) => !ids.has(id)))
      issues.push(
        t("「{title}」依赖了已停用的步骤，请调整依赖或重新启用。", {
          title: step.title,
        }),
      );
  }
  return issues;
}

export function workflowPrompt(plan) {
  const issues = workflowIssues(plan);
  if (issues.length) throw Error(issues.join("\n"));
  const steps = executionOrder(plan.steps.filter((s) => s.enabled));
  const names = new Map(steps.map((s, i) => [s.id, `${i + 1}. ${s.title}`]));
  return [
    t("请用 owngame 按以下工作流复刻游戏，完成我自己的可玩版本。"),
    `${t("方案名称")}: ${plan.title}`,
    `${t("整体目标")}: ${plan.goal.trim() || t("保留核心体验，按各步骤中的要求调整。")}`,
    `${t("参考游戏")}: ${plan.reference.title}`,
    `https://owngame.dev/play?game=${encodeURIComponent(plan.gameId)}`,
    `${t("参考说明")}: https://owngame.dev/remix/${encodeURIComponent(plan.gameId)}.json`,
    `${t("参考版本")}: ${plan.reference.version || t("未记录")}`,
    ...(plan.reference.sourceUrl
      ? [
          `${t("对应源码")}: ${plan.reference.sourceUrl}`,
          `${t("源码版本")}: ${plan.reference.sourceCommit || t("未记录")}`,
        ]
      : []),
    `${t("目标平台")}: ${plan.targets.map((p) => (p === "pc" ? "PC" : t("移动端"))).join(" / ")}`,
    t(
      "先阅读 https://github.com/luka2chat/owngame 的安装说明，按当前 AI 助手完成接入。读取参考说明，有浏览器能力时试玩原游戏；复用源码或素材前检查对应许可。只支持以上目标平台。",
    ),
    t(
      "先读取项目的 game-outline.json；没有时用 outline.init 初始化。把本方案的目标、步骤和依赖整理到设计板，保留现有设计和较新的编辑。每步完成后记录实际验证与剩余问题。",
    ),
    t(
      "按下面的依赖与顺序执行。标记「完成后等我确认」的步骤需展示结果并等待我确认；未标记的步骤可在验证后继续。空白细节代表尚未指定，不要当作已经确认。",
    ),
    "",
    ...steps.flatMap((s) => [
      `## ${names.get(s.id)}`,
      `${t("前置步骤")}: ${s.dependsOn.map((id) => names.get(id)).join("; ") || t("无")}`,
      ...Object.entries(fieldLabels)
        .filter(([key]) => s[key].trim())
        .map(([key, label]) => `${t(label)}: ${s[key]}`),
      `${t("完成后等我确认")}: ${t(s.checkpoint ? "是" : "否")}`,
      "",
    ]),
    t(
      "最后交付运行方式与验证证据。区分规则测试、浏览器操作、实机测试和人的视觉体验反馈；未执行的检查明确标为未验证。",
    ),
  ].join("\n");
}
