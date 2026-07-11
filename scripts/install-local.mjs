import { createHash } from "node:crypto";
import { mkdir, copyFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const vaultPluginDir = resolve(
  "C:/develop/notes/.obsidian/plugins/ai-knowledge-dashboard"
);

await mkdir(vaultPluginDir, { recursive: true });

const runtimeFiles = ["manifest.json", "main.js", "styles.css"];

await Promise.all(runtimeFiles.map(file =>
  copyFile(file, resolve(vaultPluginDir, file))
));

const sha256 = async path => createHash("sha256")
  .update(await readFile(path))
  .digest("hex");

for (const file of runtimeFiles) {
  const sourceHash = await sha256(file);
  const installedHash = await sha256(resolve(vaultPluginDir, file));
  if (sourceHash !== installedHash) {
    throw new Error(`Hash mismatch after installing ${file}`);
  }
}

console.log(`Installed and verified ${runtimeFiles.length} runtime files in ${vaultPluginDir}`);
