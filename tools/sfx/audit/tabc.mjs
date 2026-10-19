import { SC } from './h.mjs'; process.chdir(SC); // the node-only table scripts read the json files the measuring scripts wrote
import fs from 'node:fs';
let r = JSON.parse(fs.readFileSync('measure_cand.json', 'utf8')); if (typeof r === 'string') r = JSON.parse(r);
const f = (x, n = 0) => String(x).padStart(n);
const re = new RegExp(process.argv[2] || '.');
console.log('file'.padEnd(34), '  ms', 'pkdB', ' L100', ' cen', 'att', 't20', 'punch', 'bite', ' sub/low/lm/mid/hm/air');
for (const x of r.filter((q) => re.test(q.pack + '/' + q.name))) console.log((x.pack.slice(0, 3) + '/' + x.name).padEnd(34), f(Math.round(x.ms), 4), f(x.peakDb, 5), f(x.l100, 5), f(x.centroid, 5), f(x.attack, 3), f(x.t20, 3), f(x.punch, 5), f(x.bite, 5), ' ' + x.band.map((v) => String(Math.round(v * 100)).padStart(2)).join('/'));
