// Token Radar v2's program: sealed snapshot in, ranked board + dashboard + dossier out.
//
//   node main.ts --input <snapshot.json|directory> [--output <directory>]
//
// Outside the grader's container MAKEFUN_OUTPUT_DIR stands in for /output. Inside it the
// snapshot lives at /input/snapshot.json and the program writes /output. The run is fully
// deterministic: the model fits, validates and scores from the snapshot's own bytes, with no
// clock, no randomness and no network, so two runs write byte-identical output.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function flagValue(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = flagValue('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar, validation, fit, launch } = buildRadar(snapshot);
const problem = boardIssue(board, snapshot);
if (problem !== null) {
  process.stderr.write(`token radar: refusing to write a board the gate rejects: ${problem}\n`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    names.push(name);
  }
  return names;
}

const dashFiles = copyDir(join(here, 'dashboard'), join(outDir, 'dashboard'));
if (dashFiles.length === 0) {
  process.stderr.write('token radar: dashboard/ is empty: the page is part of the entry\n');
  process.exit(1);
}
const shots = copyDir(join(here, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image(s): hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

const top = board.filter((r) => r.token_status === 'pre-token').slice(0, 3);
const bands = Object.entries(validation.bands.by_kind)
  .map(([k, v]) => `${k} x${v.band}`)
  .join(', ');
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols in the snapshot, ${snapshot.watchlist.length} on the watchlist\n` +
    `token radar: value curve log(mcap) = ${fit.intercept.toFixed(4)} + ${fit.slope.toFixed(4)} * log(TVL) on ${fit.n} comps (R2 ${fit.r2.toFixed(3)}); ` +
    `validation LOO x${validation.loo_median}, walk-forward x${validation.wf_median}, 10-fold x${validation.kfold_median}\n` +
    `token radar: launch odds logistic b0=${launch.b0.toFixed(4)} b1=${launch.b1.toFixed(4)} b2=${launch.b2.toFixed(4)} on ${launch.dated_n} dated protocols ` +
    `(median age ${launch.median_age_days}d for undated); 5-fold CV log-loss ${launch.cv_logloss}\n` +
    `token radar: per-kind bands: ${bands}; sparse kinds use the global x${validation.bands.global}\n` +
    `token radar: board ${board.length} rows (${radar.counts.pre_token} pre-token, ${radar.counts.live} live, ${radar.counts.set_aside} set aside); ` +
    `top pre-token ${top.map((r) => `${r.slug} $${r.implied_value_usd.toLocaleString('en-US')} (#${r.pre_rank}, range #${r.rank_low}-${r.rank_high})`).join(', ')}\n` +
    `token radar: wrote board.json, data.js, dashboard/ (${dashFiles.length} files), screenshots/ (${shots.length} images) and dossier.json into ${outDir}\n`,
);
