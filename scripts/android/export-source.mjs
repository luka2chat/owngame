import fs from "node:fs/promises";
import path from "node:path";
import { readPublicFiles } from "./public-source.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--out")) throw Error("Usage: node scripts/android/export-source.mjs [--out NEW_DIRECTORY]");
const files = await readPublicFiles(root);
if (args.length) {
  const out = path.resolve(args[1]);
  if (out === root || root.startsWith(out + path.sep) || out.startsWith(root + path.sep)) throw Error("Export outside the source workspace to a new directory");
  await fs.mkdir(out);
  try {
    for (const [relative, bytes] of files) {
      await fs.mkdir(path.dirname(path.join(out, relative)), {recursive: true});
      await fs.writeFile(path.join(out, relative), bytes);
    }
  } catch (error) {
    await fs.rm(out, {recursive: true, force: true});
    throw error;
  }
}
console.log(JSON.stringify({status: "verified", files: files.size, exported: Boolean(args.length)}));
