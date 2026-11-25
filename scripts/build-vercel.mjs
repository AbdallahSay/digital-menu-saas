// Run from repository root. Never deploy or read hosting credentials here.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw new Error("MenuSaaS Vercel build requires Node 24.");
const frontend = join(root, "frontend");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
execFileSync(npm, ["run", "build"], { cwd: frontend, stdio: "inherit" });
execFileSync(
  process.execPath,
  ["scripts/write-build-manifest.mjs", "npm run build:vercel (build-vercel.mjs)"],
  { cwd: frontend, stdio: "inherit" },
);
execFileSync(process.execPath, ["scripts/vercel-output.mjs"], {
  cwd: frontend,
  stdio: "inherit",
});
const destination = join(root, ".vercel", "output");
rmSync(destination, { recursive: true, force: true });
mkdirSync(join(root, ".vercel"), { recursive: true });
cpSync(join(frontend, ".vercel", "output"), destination, { recursive: true });
console.log(
  "Prepared repository-root .vercel/output. No deployment performed.",
);
