import { SC } from './h.mjs'; process.chdir(SC); // the node-only table scripts read the json files the measuring scripts wrote
import fs from 'node:fs';
let r = JSON.parse(fs.readFileSync('measure.json', 'utf8')); if (typeof r === 'string') r = JSON.parse(r);
const f = (x, n = 0) => String(x).padStart(n);
const re = new RegExp(process.argv[2] || '.');
console.log('key'.padEnd(24), 'cat'.padEnd(7), '  ms', 'pkdB', 'LUFSsp', ' L100', ' SEL', ' cen', 'att', 'tpk', 'punch', 't20', 'bite', 'body', ' sub/low/lm/mid/hm/air', 'c20');
for (const x of r.filter((q) => re.test(q.key))) console.log(x.key.replace('sfx:', '').padEnd(24), x.cat.padEnd(7), f(Math.round(x.msMean), 4), f(x.peakDb, 5), f(x.lufsSpanMean.toFixed(1), 6), f(x.l100Mean.toFixed(1), 6), f(x.selMean.toFixed(1), 5), f(x.centroidMean, 5), f(x.attack, 4), f(x.tpeak, 4), f(x.punch, 5), f(x.t20, 4), f(x.bite, 5), f(x.body, 5), ' ' + x.band.map((v) => String(Math.round(v * 100)).padStart(2)).join('/'), f(x.centroid20, 5));
