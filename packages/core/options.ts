import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CoreOptions } from "./index.js";
export function options(argv: string[]) {
  const result: CoreOptions = {
    root: fileURLToPath(new URL("../../../", import.meta.url)),
    workspace: process.cwd(),
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--legacy") {
      result.legacy = true;
      continue;
    }
    if (["--workspace", "--knowledge", "--config"].includes(argv[i])) {
      const key = argv[i].slice(2) as "workspace" | "knowledge" | "config";
      if (!argv[i + 1]) throw new Error(`Missing ${argv[i]}`);
      result[key] = path.resolve(argv[++i]);
    } else rest.push(argv[i]);
  }
  return { options: result, rest };
}
