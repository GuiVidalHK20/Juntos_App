// Confere se todo arquivo de public/ está na lista SHELL do service worker e se os imports existem.
// Uso (Node 18+):  node tools/verificar-offline.mjs      — sai com erro se algo faltar.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, normalize } from "node:path";

const root = new URL("../public/", import.meta.url).pathname;
const sw = readFileSync(join(root, "sw.js"), "utf8");
const shell = new Set([...sw.matchAll(/"\.\/([^"]+)"/g)].map((m) => normalize(m[1])));
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(root).map((f) => relative(root, f));
const need = files.filter((f) => /\.(js|html|json|png)$/.test(f) && !["sw.js", "_headers"].includes(f));
let bad = 0;
for (const f of need) if (!shell.has(normalize(f))) { console.log("FALTA no SHELL do sw.js:", f); bad++; }
for (const f of files.filter((f) => f.endsWith(".js") && f !== "sw.js")) {
  const src = readFileSync(join(root, f), "utf8");
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*"(\.{1,2}\/[^"]+)"/g)) {
    const target = normalize(join(dirname(f), m[1]));
    if (!existsSync(join(root, target))) { console.log(`IMPORT quebrado em ${f}: ${m[1]}`); bad++; }
  }
}
console.log(bad ? `\n${bad} problema(s).` : `Tudo certo: ${need.length} arquivos cobertos pelo cache offline.`);
process.exit(bad ? 1 : 0);
