const fs = require('fs');
const o = 'F:/Manaintibojanam_final2/orderbhojan/scripts/post-deploy-location-fix-proof.mjs';
let t = fs.readFileSync(o, 'utf8');
if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
fs.writeFileSync(o, t, { encoding: 'utf8' });
console.log('stripped', t.startsWith('#!'));
