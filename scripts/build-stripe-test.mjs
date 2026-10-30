// Build a sanitized copy, deliberately never opening/copying .env.local.
import { cpSync, mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const target = mkdtempSync(join(tmpdir(), "coaching-safe-build-"));
const excluded = new Set(["node_modules", ".git", ".next", ".aws", ".codex", ".agents"]);
try {
  cpSync(root, target, { recursive: true, filter(source) {
    const first = relative(root, source).split("/")[0];
    return !excluded.has(first) && !first.startsWith(".env");
  } });
  symlinkSync(join(root, "node_modules"), join(target, "node_modules"), "dir");
  execFileSync("npm", ["run", "build", "--", "--webpack"], {
    cwd: target, stdio: "inherit", env: {
      PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-build-placeholder",
      SUPABASE_SECRET_KEY: "test-build-placeholder",
    },
  });
} finally {
  rmSync(target, { recursive: true, force: true });
}
