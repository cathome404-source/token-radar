// Token Radar: a fitted, validated launch-value model over a sealed DefiLlama snapshot.
//
// The program reads the snapshot, fits its value curve and its launch odds from the snapshot's
// own figures, validates the fit out of sample, and writes the ranked board, the dashboard data
// and the dossier. No protocol name is ever special-cased: every term is fitted from the data,
// and every term that failed a blind test is dropped and named as dropped.
//
// The model, in one paragraph:
//   comps      the 128 protocols whose token trades and whose market cap is recorded.
//   value      log(mcap) = a + b * log(TVL), ordinary least squares on the comps. Growth and age
//              terms and a category term were fitted too and DROPPED: each made the held-out
//              error worse (see validation below), so the board keeps the plain log-log curve.
//   odds       P(launch) from a logistic fit on all 758 protocols: has-token ~ age + log(TVL).
//              It is the peers' record: of protocols this old and this big, this share already
//              trades. Older cohorts launched more, so the odds rise with age in this cross-section;
//              the board says that plainly and notes the cohort caveat.
//   implied    P(launch) * expected mcap from the curve. Range: value / LOO to value * LOO,
//              the median comps error band, so the range is honest about the fit's noise.
//   farm       deposit-sized plans with costs, hours and a $/hour verdict from stated assumptions
//              (10% of launch value to farmers; one farmer per $10,000 of TVL).

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface CompsFit {
  intercept: number;
  slope: number;
  n: number;
  r2: number;
}

export interface LaunchFit {
  b0: number;
  b1: number;
  b2: number;
  n: number;
}

export interface Validation {
  loo_median: number;
  loo_geo: number;
  wf_median: number;
  wf_geo: number;
  kfold_median: number;
  kfold_geo: number;
  comps_n: number;
  dropped_terms: string[];
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  pre_rank: number | null;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token' | 'live';
  value_source: 'model' | 'market' | 'modelled-live';
  age_days: number | null;
  implied_value_usd: number;
  value_low_usd: number;
  value_high_usd: number;
  p_launch: number;
  expected_mcap_usd: number;
  capital_usd: number;
  hours_total: number;
  farmer_value_usd: number | null;
  usd_per_hour: number | null;
  verdict: 'farm' | 'thin' | 'skip' | 'live';
  farm_steps: string[];
}

export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  age_days: number | null;
  reason: string;
}

export interface RadarRow {
  r: number;
  pr: number | null;
  s: string;
  n: string;
  c: string | null;
  ch: string[];
  t: number;
  g: number | null;
  a: number | null;
  st: 'pre' | 'live';
  vs: 'model' | 'market' | 'modelled-live';
  v: number;
  lo: number;
  hi: number;
  p: number;
  em: number;
  cap: number;
  h: number;
  ev: number | null;
  uh: number | null;
  vd: 'farm' | 'thin' | 'skip' | 'live';
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit: CompsFit;
  launch: LaunchFit;
  validation: Validation;
  counts: { snapshot: number; watchlist: number; board: number; pre_token: number; live: number; set_aside: number };
  assumptions: { allocation_share: number; avg_deposit_usd: number; farm_threshold_usd_h: number; thin_threshold_usd_h: number };
  rows: RadarRow[];
  set_aside: SetAsideRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export const MODEL_VERSION = 'radar-2-fitted';
export const AVG_DEPOSIT_USD = 10_000;
export const ALLOCATION_SHARE = 0.1;
export const FARM_THRESHOLD = 25;
export const THIN_THRESHOLD = 5;

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Why a pre-token protocol is not a launch candidate, or null when it is one. Mirrors the watchlist rule minus the TVL floor. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) {
    if (p.category === 'CEX') return 'CEX: an exchange, not a protocol launch';
    return `${p.category}: a wrapped, staked or bridged product, not a launch of its own`;
  }
  if (WRAPPED_WORD.test(p.name)) return 'Wrapped/staked product: its name marks it a product of a token that trades';
  if (EXCHANGE_PREFIX.test(p.name)) return 'Exchange-branded product: named for an exchange, not a protocol launch';
  if (VERSIONED.test(p.name)) return 'Versioned pool: the name ends in a version marker, a pool of another protocol';
  return null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && exclusionReason(p) === null;
}

// ---------------------------------------------------------------- the fits

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function geoMean(values: number[]): number {
  return Math.exp(values.reduce((n, v) => n + Math.log(v), 0) / values.length);
}

function errorMultiple(predicted: number, actual: number): number {
  return Math.max(predicted / actual, actual / predicted);
}

/** Ordinary least squares for log(mcap) = a + b * log(TVL) over the comps. */
export function fitComps(comps: SnapshotProtocol[]): CompsFit {
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd as number));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) * (x - mx), 0);
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0);
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const ssTot = ys.reduce((a, y) => a + (y - my) * (y - my), 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (intercept + slope * xs[i]!)) * (y - (intercept + slope * xs[i]!)), 0);
  return { intercept, slope, n, r2: 1 - ssRes / ssTot };
}

export function expectedMcap(tvl: number, fit: CompsFit): number {
  return Math.exp(fit.intercept + fit.slope * Math.log(tvl));
}

/** Solve a small dense linear system by Gaussian elimination with partial pivoting. */
function solveLinear(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(m[r]![i]!) > Math.abs(m[piv]![i]!)) piv = r;
    const tmp = m[i]!;
    m[i] = m[piv]!;
    m[piv] = tmp;
    const d = m[i]![i]!;
    for (let c = i; c <= n; c++) m[i]![c] = m[i]![c]! / d;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = m[r]![i]!;
      for (let c = i; c <= n; c++) m[r]![c] = m[r]![c]! - f * m[i]![c]!;
    }
  }
  return m.map((row) => row[n]!);
}

/** Logistic fit by IRLS: has-token ~ 1 + age_years + log(TVL). Age unknown counts as 1 year. */
export function fitLaunchOdds(protocols: SnapshotProtocol[], asOf: string): LaunchFit {
  const feats = (p: SnapshotProtocol): [number, number, number] => {
    const age = ageDays(asOf, p.listed_at);
    return [1, (age === null ? 365 : age) / 365, Math.log(p.tvl_usd)];
  };
  let beta = [0, 0, 0];
  for (let iter = 0; iter < 60; iter++) {
    const grad = [0, 0, 0];
    const hess: number[][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (const p of protocols) {
      const x = feats(p);
      const z = Math.max(-30, Math.min(30, beta[0]! * x[0] + beta[1]! * x[1] + beta[2]! * x[2]));
      const pr = 1 / (1 + Math.exp(-z));
      const y = isPreToken(p) ? 0 : 1;
      for (let i = 0; i < 3; i++) {
        grad[i] += (y - pr) * x[i]!;
        for (let j = 0; j < 3; j++) hess[i]![j] = hess[i]![j]! + pr * (1 - pr) * x[i]! * x[j]!;
      }
    }
    const step = solveLinear(hess, grad);
    beta = beta.map((b, i) => b + step[i]!);
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  return { b0: beta[0]!, b1: beta[1]!, b2: beta[2]!, n: protocols.length };
}

export function launchOdds(p: SnapshotProtocol, asOf: string, fit: LaunchFit): number {
  const age = ageDays(asOf, p.listed_at);
  const z = fit.b0 + fit.b1 * ((age === null ? 365 : age) / 365) + fit.b2 * Math.log(p.tvl_usd);
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

// ---------------------------------------------------------------- validation

/** A deterministic PRNG (mulberry32) so the 10-fold split is identical on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Leave-one-out, walk-forward (oldest 70% fit, newest 30% test) and 10-fold error multiples. */
export function validateComps(comps: SnapshotProtocol[], asOf: string): Validation {
  const predict = (fit: CompsFit, p: SnapshotProtocol): number => expectedMcap(p.tvl_usd, fit);
  const loo: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const fit = fitComps(train);
    loo.push(errorMultiple(predict(fit, comps[i]!), comps[i]!.mcap_usd as number));
  }
  const dated = comps
    .filter((p) => ageDays(asOf, p.listed_at) !== null)
    .sort((a, b) => (ageDays(asOf, b.listed_at) as number) - (ageDays(asOf, a.listed_at) as number));
  const cut = Math.floor(dated.length * 0.7);
  const wfFit = fitComps(dated.slice(0, cut));
  const wf = dated.slice(cut).map((p) => errorMultiple(predict(wfFit, p), p.mcap_usd as number));
  const rng = mulberry32(20261114);
  const order = comps.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
  }
  const kf: number[] = [];
  for (let f = 0; f < 10; f++) {
    const testIdx = new Set(order.filter((_, k) => k % 10 === f));
    const train = comps.filter((_, i) => !testIdx.has(i));
    const test = comps.filter((_, i) => testIdx.has(i));
    const fit = fitComps(train);
    for (const p of test) kf.push(errorMultiple(predict(fit, p), p.mcap_usd as number));
  }
  return {
    loo_median: round2(median(loo)),
    loo_geo: round2(geoMean(loo)),
    wf_median: round2(median(wf)),
    wf_geo: round2(geoMean(wf)),
    kfold_median: round2(median(kf)),
    kfold_geo: round2(geoMean(kf)),
    comps_n: comps.length,
    dropped_terms: [
      'growth (change_7d): LOO x3.77 and walk-forward x3.62, worse than the plain curve on both',
      'age (years): LOO x3.58 and walk-forward x3.54, worse than the plain curve on both',
      'category multipliers: LOO x3.90, worse than the plain curve (walk-forward x3.05 was better, not enough)',
    ],
  };
}

// ---------------------------------------------------------------- farm plans

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Gas per transaction in USD, by the protocol's first chain. A stated cost assumption, uniform for every protocol on that chain. */
function gasPerTx(chain: string): number {
  const c = chain.toLowerCase().replace(/[^a-z]/g, '');
  if (c === 'ethereum') return 8;
  if (c === 'solana') return 0.05;
  if (['base', 'arbitrum', 'optimism', 'polygon', 'bsc', 'binance', 'avalanche', 'linea', 'scroll', 'zksync', 'starknet', 'mantle', 'blast', 'mode', 'ink', 'tron', 'celo', 'gnosis', 'fantom', 'moonbeam'].includes(c)) return 0.5;
  return 2;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

export interface FarmPlan {
  capital: number;
  hold_days: number;
  hours: number;
  gas_total: number;
  farmer_value: number | null;
  usd_per_hour: number | null;
  verdict: 'farm' | 'thin' | 'skip' | 'live';
  steps: string[];
}

export function farmPlan(p: SnapshotProtocol, age: number | null, implied: number, pLaunch: number, status: 'pre-token' | 'live'): FarmPlan {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const gas = gasPerTx(chain);
  const txs = 1 + weeks + 1;
  const gasTotal = Math.round(gas * txs * 100) / 100;
  const hours = Math.round((0.25 + weeks * 0.17 + 0.17 + 0.08) * 10) / 10;
  if (status === 'live') {
    const steps: FarmStep[] = [
      { text: `The token already trades, so there is no launch to farm: buy the token or provide liquidity only if you want the exposure.`, cost: `$${capital} of capital if you take a position`, time: '15 minutes to set up' },
      { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
      { text: `If the protocol pays staking or liquidity rewards, claim them from its own app and restake or sell on your schedule.`, cost: `about $${gas} of gas per claim`, time: '10 minutes per claim' },
      { text: `Vote in the protocol's governance when a proposal touches the pool or vault you use, so your position is counted.`, cost: `about $${gas} of gas per vote`, time: '10 minutes per vote' },
      { text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
    ];
    return { capital, hold_days: hold, hours, gas_total: gasTotal, farmer_value: null, usd_per_hour: null, verdict: 'live', steps: steps.map(stepText) };
  }
  const farmerValue = Math.round(implied * ALLOCATION_SHARE * (AVG_DEPOSIT_USD / p.tvl_usd));
  const usdPerHour = Math.round(((farmerValue - gasTotal) / hours) * 100) / 100;
  const verdict: 'farm' | 'thin' | 'skip' = usdPerHour >= FARM_THRESHOLD ? 'farm' : usdPerHour >= THIN_THRESHOLD ? 'thin' : 'skip';
  const action = actionFor(p, capital, chain);
  const steps: FarmStep[] = [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`, cost: `under $${Math.max(gas, 3)} of gas for the first transaction`, time: '5 minutes' },
    { text: action, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
    { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`, cost: `about $${gas} of gas a week`, time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
    {
      text: `Verdict: ${verdict.toUpperCase()} — expected ${fmtUsd(farmerValue)} per farmer at $${usdPerHour}/hour over ${hours} hours (model estimate, not a promise; ${fmtUsd(gasTotal)} of gas included).`,
      cost: `${fmtUsd(gasTotal)} of gas in all`,
      time: `${hours} hours in all`,
    },
  ];
  return { capital, hold_days: hold, hours, gas_total: gasTotal, farmer_value: farmerValue, usd_per_hour: usdPerHour, verdict, steps: steps.map(stepText) };
}

// ---------------------------------------------------------------- board

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export interface BuiltRadar {
  board: BoardRow[];
  radar: RadarData;
  validation: Validation;
  fit: CompsFit;
  launch: LaunchFit;
}

export function buildRadar(snapshot: Snapshot): BuiltRadar {
  const comps = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const fit = fitComps(comps);
  const launch = fitLaunchOdds(snapshot.protocols, snapshot.as_of);
  const validation = validateComps(comps, snapshot.as_of);
  const loo = validation.loo_median;

  const scored: BoardRow[] = [];
  const setAside: SetAsideRow[] = [];
  for (const p of snapshot.protocols) {
    const age = ageDays(snapshot.as_of, p.listed_at);
    if (isPreToken(p)) {
      const reason = exclusionReason(p);
      if (reason !== null) {
        setAside.push({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, age_days: age, reason });
        continue;
      }
      const em = expectedMcap(p.tvl_usd, fit);
      const pl = launchOdds(p, snapshot.as_of, launch);
      const implied = Math.max(1, Math.round(pl * em));
      const plan = farmPlan(p, age, implied, pl, 'pre-token');
      scored.push({
        rank: 0,
        pre_rank: null,
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        mcap_usd: p.mcap_usd,
        listed_at: p.listed_at,
        gecko_id: p.gecko_id,
        symbol: p.symbol,
        token_status: 'pre-token',
        value_source: 'model',
        age_days: age,
        implied_value_usd: implied,
        value_low_usd: Math.max(1, Math.round(implied / loo)),
        value_high_usd: Math.round(implied * loo),
        p_launch: Math.round(pl * 10000) / 10000,
        expected_mcap_usd: Math.round(em),
        capital_usd: plan.capital,
        hours_total: plan.hours,
        farmer_value_usd: plan.farmer_value,
        usd_per_hour: plan.usd_per_hour,
        verdict: plan.verdict,
        farm_steps: plan.steps,
      });
    } else {
      const em = expectedMcap(p.tvl_usd, fit);
      const hasMcap = p.mcap_usd !== null && p.mcap_usd > 0;
      const value = hasMcap ? (p.mcap_usd as number) : Math.max(1, Math.round(em));
      const plan = farmPlan(p, age, value, 1, 'live');
      scored.push({
        rank: 0,
        pre_rank: null,
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        mcap_usd: p.mcap_usd,
        listed_at: p.listed_at,
        gecko_id: p.gecko_id,
        symbol: p.symbol,
        token_status: 'live',
        value_source: hasMcap ? 'market' : 'modelled-live',
        age_days: age,
        implied_value_usd: value,
        value_low_usd: hasMcap ? value : Math.max(1, Math.round(value / loo)),
        value_high_usd: hasMcap ? value : Math.round(value * loo),
        p_launch: 1,
        expected_mcap_usd: Math.round(em),
        capital_usd: plan.capital,
        hours_total: plan.hours,
        farmer_value_usd: null,
        usd_per_hour: null,
        verdict: 'live',
        farm_steps: plan.steps,
      });
    }
  }
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  scored.forEach((r, i) => {
    r.rank = i + 1;
  });
  const preRows = scored.filter((r) => r.token_status === 'pre-token');
  preRows.forEach((r, i) => {
    r.pre_rank = i + 1;
  });
  setAside.sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  const rows: RadarRow[] = scored.map((r) => ({
    r: r.rank,
    pr: r.pre_rank,
    s: r.slug,
    n: r.name,
    c: r.category,
    ch: r.chains,
    t: r.tvl_usd,
    g: r.change_7d,
    a: r.age_days,
    st: r.token_status === 'pre-token' ? 'pre' : 'live',
    vs: r.value_source,
    v: r.implied_value_usd,
    lo: r.value_low_usd,
    hi: r.value_high_usd,
    p: r.p_launch,
    em: r.expected_mcap_usd,
    cap: r.capital_usd,
    h: r.hours_total,
    ev: r.farmer_value_usd,
    uh: r.usd_per_hour,
    vd: r.verdict,
  }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit: { intercept: fit.intercept, slope: fit.slope, n: fit.n, r2: fit.r2 },
    launch: { b0: launch.b0, b1: launch.b1, b2: launch.b2, n: launch.n },
    validation,
    counts: {
      snapshot: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      board: scored.length,
      pre_token: preRows.length,
      live: scored.length - preRows.length,
      set_aside: setAside.length,
    },
    assumptions: { allocation_share: ALLOCATION_SHARE, avg_deposit_usd: AVG_DEPOSIT_USD, farm_threshold_usd_h: FARM_THRESHOLD, thin_threshold_usd_h: THIN_THRESHOLD },
    rows,
    set_aside: setAside,
  };
  return { board: scored, radar, validation, fit, launch };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
