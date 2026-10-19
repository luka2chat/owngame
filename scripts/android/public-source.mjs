import fs from "node:fs/promises";
import path from "node:path";

export function assertPublicSource(relative, bytes) {
  if (relative.includes("\\") || relative.startsWith("/") || relative.split("/").some(p => !p || p === "." || p === "..")) {
    throw Error("Unsafe public source path");
  }
  if (/(^|\/)(?:\.[^/]+|node_modules|artifacts|local\.properties)(\/|$)|\.(?:jks|keystore|p12|pfx|pem|key|apk|aab|log|tgz|zip)$/i.test(relative)) {
    throw Error("Private file type in Android export: " + relative);
  }
  if (bytes === null) return;
  if (relative.endsWith(".png")) {
    if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error("Invalid PNG: " + relative);
    let offset = 8;
    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) throw Error("Truncated PNG: " + relative);
      const length = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
      if (["tEXt", "zTXt", "iTXt", "eXIf", "caBX"].includes(type)) throw Error("Review/remove PNG metadata before export: " + relative);
      offset += length + 12;
    }
    if (offset !== bytes.length) throw Error("Invalid PNG length: " + relative);
    return;
  }
  if (!/\.(?:java|xml|html|css|js|mjs|json|md|svg)$/.test(relative) && !relative.includes("/LICENSES/")) {
    throw Error("Unreviewed Android source type: " + relative);
  }
  const text = bytes.toString("utf8");
  const checks = [
    [/\/(?:Users|Volumes|home)\/[\w.-]+|[A-Z]:\\Users\\/i, "absolute personal path"],
    [/\b(?:127|10)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b192\.168\.\d{1,3}\.\d{1,3}\b|\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b|https?:\/\/localhost\b/i, "local network address"],
    [/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/, "credential"],
    [/(?:pairing[_-]?token|api[_-]?key|client[_-]?secret|access[_-]?token)\s*["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i, "embedded secret"],
  ];
  for (const [pattern, reason] of checks) if (pattern.test(text)) throw Error("Android export contains " + reason + ": " + relative);
}

// Keep rendering chunks verbatim; exclude embedded provenance/text from public copies.
export function publicPng(bytes) {
  const chunks = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw Error("Truncated PNG");
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (end > bytes.length) throw Error("Invalid PNG length");
    if (!["tEXt", "zTXt", "iTXt", "eXIf", "caBX"].includes(bytes.toString("ascii", offset + 4, offset + 8))) chunks.push(bytes.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
}

export async function readPublicFiles(root) {
  const files = JSON.parse(await fs.readFile(path.join(root, "scripts/android/public-files.json"), "utf8"));
  if (!Array.isArray(files) || new Set(files).size !== files.length) throw Error("Invalid Android public allowlist");
  const result = new Map();
  for (const relative of files) {
    assertPublicSource(relative, null);
    let current = root;
    for (const part of relative.split("/")) {
      current = path.join(current, part);
      if ((await fs.lstat(current)).isSymbolicLink()) throw Error("Symlink in Android export: " + relative);
    }
    let bytes = await fs.readFile(current);
    if (relative.endsWith(".png")) bytes = publicPng(bytes);
    assertPublicSource(relative, bytes);
    result.set(relative, bytes);
  }
  return result;
}
