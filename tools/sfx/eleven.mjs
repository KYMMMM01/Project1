// ElevenLabs sound generation for the game's sounds (the owner's paid plan: commercial use, no attribution; docs/licenses/sounds.md, source 3).
// A dev tool only: nothing here ships in the game. The SDK reads ELEVENLABS_API_KEY from the environment; run it with the project's
// git-ignored .env.local loaded by Node (the key is never printed or written anywhere else):
//
//   node --env-file=.env.local tools/sfx/eleven.mjs check                      plan, credits left, next reset
//   node --env-file=.env.local tools/sfx/eleven.mjs gen <spec.json> <outDir>   one MP3 per take: <outDir>/<id>/<id>_<take>.mp3, and <outDir>/eleven.json
//
// spec.json: { "sounds": [ { "id": "sp_tiger_roar", "takes": [ { "name": "a", "text": "...", "seconds": 1.2, "influence": 0.5 } ] } ], "maxCredits": 3000 }
// A take that already has its MP3 is skipped (re-running costs nothing). The run stops before a request when the credits spent in this run
// would pass maxCredits, or when the plan has fewer credits left than one more take is likely to cost (the first batch is guessed at
// `guessPerTake` credits a take, default 200). `parallel` (default 4) takes run at once.
import fs from 'node:fs';
import path from 'node:path';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const MODEL = 'eleven_text_to_sound_v3';

async function plan(client) {
  const s = await client.user.subscription.get();
  const reset = s.nextCharacterCountResetUnix ? new Date(s.nextCharacterCountResetUnix * 1000).toISOString().slice(0, 10) : null;
  return { tier: s.tier, used: s.characterCount, limit: s.characterLimit, left: s.characterLimit - s.characterCount, reset };
}

async function take(client, t) {
  const stream = await client.textToSoundEffects.convert({
    text: t.text,
    modelId: MODEL,
    promptInfluence: t.influence ?? 0.5,
    ...(t.seconds ? { durationSeconds: t.seconds } : {}),
    ...(t.loop ? { loop: true } : {}),
    outputFormat: 'mp3_44100_128',
  });
  return Buffer.from(await new Response(stream).arrayBuffer());
}

async function gen(client, specPath, outDir) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const max = spec.maxCredits ?? Infinity;
  const width = Math.max(1, spec.parallel ?? 4);
  fs.mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, 'eleven.json');
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : { model: MODEL, takes: {} };
  const save = () => fs.writeFileSync(logPath, JSON.stringify(log, null, 1));
  const todo = spec.sounds.flatMap((s) => s.takes.map((t) => ({ s, t, name: `${s.id}_${t.name}`, file: path.join(outDir, s.id, `${s.id}_${t.name}.mp3`) })))
    .filter((x) => !fs.existsSync(x.file));
  const start = await plan(client);
  console.log(`plan ${start.tier}: ${start.left} credits left of ${start.limit}, ${todo.length} takes to make`);
  let left = start.left;
  let spent = 0;
  let made = 0;
  let stop = null;
  // Each batch is charged by reading the plan before and after it, so a batch's cost is shared by its takes.
  for (let i = 0; i < todo.length && !stop; i += width) {
    const batch = todo.slice(i, i + width);
    const guess = (made ? spent / made : spec.guessPerTake ?? 200) * batch.length;
    if (spent + guess > max) { stop = `this run has spent ${spent}, the next batch would pass maxCredits ${max}`; break; }
    if (left < guess) { stop = `${left} credits left`; break; }
    const done = await Promise.all(batch.map(async (x) => {
      try {
        const bytes = await take(client, x.t);
        fs.mkdirSync(path.dirname(x.file), { recursive: true });
        fs.writeFileSync(x.file, bytes);
        return x;
      } catch (e) {
        console.log(`${x.name}: ${e?.statusCode ?? ''} ${e?.message ?? e}`);
        stop = stop ?? `request failed (${x.name})`;
        return null;
      }
    }));
    const now = (await plan(client)).left;
    const ok = done.filter(Boolean);
    const cost = left - now;
    left = now;
    spent += cost;
    made += ok.length;
    for (const x of ok) {
      log.takes[x.name] = { id: x.s.id, take: x.t.name, text: x.t.text, seconds: x.t.seconds ?? null, influence: x.t.influence ?? 0.5, credits: ok.length ? Math.round(cost / ok.length) : 0, date: new Date().toISOString().slice(0, 10) };
    }
    save();
    console.log(`${ok.map((x) => x.name).join(' ')}: ${cost} credits (${left} left)`);
  }
  save();
  if (stop) console.log(`stop: ${stop}`);
  console.log(`made ${made} takes, ${spent} credits this run, ${left} left`);
}

if (!process.env.ELEVENLABS_API_KEY) {
  console.log('no ELEVENLABS_API_KEY: run with node --env-file=.env.local (see the header)');
  process.exit(1);
}
const client = new ElevenLabsClient();
const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'check') console.log(JSON.stringify(await plan(client)));
else if (cmd === 'gen' && a && b) await gen(client, a, b);
else console.log('usage: node --env-file=.env.local tools/sfx/eleven.mjs check | gen <spec.json> <outDir>');
