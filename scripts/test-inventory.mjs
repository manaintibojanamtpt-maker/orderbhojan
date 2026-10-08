import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
export function discoverTests(roots = ['tests', 'src', 'packages', 'storefront-src']) {
  const found = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir,{withFileTypes:true})) {
      if (e.isSymbolicLink() || ['node_modules','dist','build','.git'].includes(e.name)) continue;
      const p=resolve(dir,e.name);
      if(e.isDirectory()) walk(p);
      else if(/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(e.name)) found.push(relative(process.cwd(),p).replaceAll('\\','/'));
    }
  }
  roots.forEach(walk);
  return [...new Set(found)].sort().map(file=>({file, suite: file.startsWith('tests/backend/') ? 'backend' : /from ['"](?:vitest|@playwright\/test)['"]|require\(['"]vitest/.test(readFileSync(file,'utf8')) ? 'external-runner' : 'node'}));
}
