import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ONLY an isolated cluster. No inherited connection/credential environment.
export function localPostgres() {
  const directory = mkdtempSync(join(tmpdir(), "coaching-stripe-test-"));
  const database = join(directory, "data");
  const env = { PATH: process.env.PATH, LC_ALL: "C", PGTZ: "UTC" };
  const options = { env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] };
  const args = ["-X", "-h", directory, "-p", "55439", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
  let started = false;
  return {
    start(fixture, migrations) {
      execFileSync("initdb", ["-D", database, "-A", "trust", "-U", "postgres", "--no-locale"], options);
      execFileSync("pg_ctl", ["-D", database, "-l", join(directory, "postgres.log"), "-o", `-F -k ${directory} -h '' -p 55439`, "-w", "start"], options);
      started = true;
      this.sql(readFileSync(fixture, "utf8"));
      for (const migration of migrations) this.sql(readFileSync(migration, "utf8"));
    },
    sql(input) { return execFileSync("psql", args, { ...options, input }).trim(); },
    async run(input) {
      return await new Promise((resolve, reject) => {
        const child = spawn("psql", args, { env });
        let output = "", errors = "";
        child.stdout.on("data", chunk => { output += chunk; });
        child.stderr.on("data", chunk => { errors += chunk; });
        // ON_ERROR_STOP can close stdin before a deliberately rejected migration
        // has finished streaming. Keep the actual psql exit code/diagnostic.
        child.stdin.on("error", error => { if (error.code !== "EPIPE") reject(error); });
        child.on("error", reject);
        child.on("close", code => resolve({ code, output: output.trim(), errors }));
        child.stdin.end(input);
      });
    },
    stop() {
      if (started) execFileSync("pg_ctl", ["-D", database, "-m", "immediate", "-w", "stop"], options);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
