// Build a sanitized copy, deliberately never opening/copying .env.local.
import { mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copySource, assertNoEnvFiles } from "./dev-stripe-test.mjs";

export function prepareBuildSource(root, target) {
  copySource(root, target);
  assertNoEnvFiles(target);
}

function main() {
  const root = resolve(import.meta.dirname, "..");
  const target = mkdtempSync(join(tmpdir(), "coaching-safe-build-"));
  try {
    prepareBuildSource(root, target);
    // This dependency link is intentional and only added after source checks.
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
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
