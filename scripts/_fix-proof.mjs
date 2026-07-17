const fs = require('fs');
const p = 'F:/Manaintibojanam_final2/orderbhojan/scripts/post-deploy-proof-recovery-01.mjs';
let c = fs.readFileSync(p, 'utf8');
const bad = "  await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });\n});\n}";
const good = "  await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });\n}";
if (c.includes(bad)) c = c.replace(bad, good);
else c = c.replace(/\}\);\r?\n\}\r?\n\r?\nasync function bodyText/, "}\n\nasync function bodyText");
fs.writeFileSync(p, c);
