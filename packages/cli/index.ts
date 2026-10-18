#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Core } from "../core/index.js";
import path from "node:path";
import { setup, doctor } from "./setup.js";
import { options } from "../core/options.js";
let core: Core | undefined;
try {
  const parsed = options(process.argv.slice(2));
  const command = parsed.rest[0];
  if (["--help", "help", "-h"].includes(command)) {
    console.log("owngame — game authoring tools for your existing agent\n\nsetup [--agent codex|cursor|generic] [--apply]  Preview/apply project integration\ndoctor                                      Read-only readiness report\n--version                                   Installed toolkit version\n<operation> [JSON | @file | -]               Call the shared CLI/MCP core\n\nOptions: --workspace <path>, --knowledge <path>, --config <file>\nStart: owngame project.create '{\"directory\":\"my-game\",\"name\":\"my-game\"}'\nTemplates: web-canvas (default), web-phaser, cocos-minimal");
  } else if (command === "--version") {
    console.log(JSON.parse(await readFile(path.join(parsed.options.root, "package.json"), "utf8")).version);
  } else if (command === "setup" || command === "doctor") {
    if (command === "doctor" && parsed.rest.length > 1) throw Error("doctor accepts only --workspace");
    const data = command === "setup" ? await setup(parsed.options.root, parsed.options.workspace!, parsed.rest.slice(1)) : await doctor(parsed.options.root, parsed.options.workspace!);
    console.log(JSON.stringify(data));
    if (command === "doctor" && (!(data as any).node_supported || (data as any).knowledge !== "succeeded")) process.exitCode = 1;
  } else {
  core = new Core(parsed.options);
  await core.initialize();
  const [operation = "capabilities", argument = "{}", ...extra] = parsed.rest;
  if (extra.length)
    throw new Error(
      "Usage: owngame <operation> [JSON | @file | -] [--workspace path] [--config file]",
    );
  const input = JSON.parse(
    argument === "-"
      ? await (async () => {
          let data = "";
          for await (const chunk of process.stdin) data += chunk;
          return data;
        })()
      : argument.startsWith("@")
        ? await readFile(argument.slice(1), "utf8")
        : argument,
  );
  const result = await core.call(operation, input);
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode =
    result.status === "succeeded" ? 0 : result.status === "failed" ? 1 : 2;
  }
} catch (error) {
  const fallback = core ?? new Core({ root: process.cwd() });
  process.stdout.write(
    JSON.stringify(
      fallback.result(
        "cli",
        "failed",
        null,
        "CLI_INPUT_ERROR",
        error instanceof Error ? error.message : String(error),
      ),
    ) + "\n",
  );
  process.exitCode = 1;
}
