import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));

export function testModules(overrides = {}, env = {}) {
  const cache = new Map(), logs = [];
  const load = (path) => {
    const full = resolve(root, path);
    if (cache.has(full)) return cache.get(full).exports;
    const module = { exports: {} };
    cache.set(full, module);
    const source = readFileSync(full, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    const dependency = (name) => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? resolve(root, "src", name.slice(2)) : resolve(dirname(full), name);
        const file = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate) && /\.tsx?$/.test(candidate));
        if (!file) throw new Error(`Unmocked dependency ${name}`);
        return load(file);
      }
      if (["node:crypto", "node:net", "crypto", "react/jsx-runtime", "stripe"].includes(name)) return require(name);
      throw new Error(`Unmocked integration ${name}`);
    };
    new Function("require", "module", "exports", "process", "console", compiled)(
      dependency, module, module.exports, { env }, { error: (...args) => logs.push(args) },
    );
    return module.exports;
  };
  return { load, logs };
}
