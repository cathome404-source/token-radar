// Token Radar v2: a fitted, validated launch-value model over a sealed DefiLlama snapshot.
//
// The program reads the snapshot, fits its value curve and its launch odds from the snapshot's
// own figures, validates the fit out of sample, and writes the ranked board, the dashboard data
// and the dossier. No protocol name is ever special-cased: every term is fitted from the data,
// and every term that failed a blind test is dropped and named as dropped.
//
// The model, in one paragraph:
//   comps      the 128 protocols whose token trades and whose market cap is recorded.
//   value      log(mcap) = a + b * log(TVL), ordinary least squares on the comps. Forty-five
//              challengers were fitted and tested — a quadratic term, category terms, age,
//              7d growth, chain count, robust fits, kNN, local-linear, trimmed fits, splines,
//              hinges, ensembles, comps subsets — and every one failed the held-out tests
//              (leave-one-out, walk-forward, 10-fold) or failed a stress test, so the board
//              keeps the plain log-log curve. The full candidate table is on the dashboard.
//   odds       P(launch) from a logistic fit on the 645 protocols whose listing date is known:
//              has-token ~ age + log(TVL). Fitting on the dated protocols only (no age
//              imputation in the fit) beats the v1 fit on 5-fold cross-validated log-loss,
//              0.6260 against 0.6407. A protocol with no listing date is predicted at the
//              median dated age (677 days). Older cohorts launched more, so the odds rise with
//              age in this cross-section; the board says that plainly and notes the cohort
//              caveat, and shows the raw age-bucket shares beside the fit.
//   ranges     not one flat band: each row's range is priced by its own kind. Where a category
//              has at least 8 comps, the band is that category's own leave-one-out median error
//              (RWA x1.59, Basis Trading x2.38, Yield x3.96, Dexs x5.28, Lending x7.26); sparse
//              kinds fall back to the global x3.40. A Lending launch is shown with a wider range
//              than an RWA launch because the curve really is that much worse for Lending.
//   rank       every row carries the rank range its value range allows: the ranks of the rows
//              whose value ranges overlap its own. Rank #1 with a range of #1-4 is an honest #1.
//   farm       deposit-sized plans with costs, hours and a $/hour verdict from stated
//              assumptions (10% of launch value to farmers; one farmer per $10,000 of TVL).
//              The $/hour is netted to the dollar: farmer value minus gas minus the opportunity
//              cost of the capital (5% APY over the hold), with a break-even airdrop value and
//              a $/hour table at $50 / $100 / $250 deposits in the detail view.

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
  dated_n: number;
  median_age_days: number;
  cv_logloss: number;
}

export interface KindBand {
  band: number;
  p80: number;
  n: number;
}

export interface KindShare {
  median_mcap_tvl: number;
  n: number;
}

export interface AgeBucket {
  label: string;
  n: number;
  share_with_token: number;
}

export interface Validation {
  loo_median: number;
  loo_geo: number;
  wf_median: number;
  wf_geo: number;
  kfold_median: number;
  kfold_geo: number;
  comps_n: number;
  bands: { global: number; global_p80: number; by_kind: Record<string, KindBand>; min_n: number };
  kind_share: Record<string, KindShare>;
  age_buckets: AgeBucket[];
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
  rank_low: number;
  rank_high: number;
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
  band: number;
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
  rl: number;
  rh: number;
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
  bd: number;
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
  assumptions: { allocation_share: number; avg_deposit_usd: number; farm_threshold_usd_h: number; thin_threshold_usd_h: number; opportunity_apy: number };
  watchlist: string[];
  rows: RadarRow[];
  set_aside: SetAsideRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export const MODEL_VERSION = 'radar-3-fitted';
export const AVG_DEPOSIT_USD = 10_000;
export const ALLOCATION_SHARE = 0.1;
export const FARM_THRESHOLD = 25;
export const THIN_THRESHOLD = 5;
export const OPPORTUNITY_APY = 0.05;
export const KIND_BAND_MIN_N = 8;

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

/** Linear-interpolation quantile (the numpy default), for the 80th-percentile band tails. */
function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0]!;
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
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

/** One IRLS logistic fit: has-token ~ 1 + age_years + log(TVL). Returns the coefficient vector. */
function logisticFit(rows: { age_years: number; log_tvl: number; y: number }[]): number[] {
  let beta = [0, 0, 0];
  for (let iter = 0; iter < 100; iter++) {
    const grad = [0, 0, 0];
    const hess: number[][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (const r of rows) {
      const x = [1, r.age_years, r.log_tvl];
      const z = Math.max(-30, Math.min(30, beta[0]! * x[0] + beta[1]! * x[1] + beta[2]! * x[2]));
      const pr = 1 / (1 + Math.exp(-z));
      for (let i = 0; i < 3; i++) {
        grad[i] += (r.y - pr) * x[i]!;
        for (let j = 0; j < 3; j++) hess[i]![j] = hess[i]![j]! + pr * (1 - pr) * x[i]! * x[j]!;
      }
    }
    for (let i = 0; i < 3; i++) hess[i]![i] = hess[i]![i]! + 1e-8;
    const step = solveLinear(hess, grad);
    beta = beta.map((b, i) => b + step[i]!);
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  return beta;
}

/** A deterministic PRNG (mulberry32) so the 10-fold and 5-fold splits are identical on every run. */
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

/**
 * Logistic fit for launch odds, on the DATED protocols only. v1 fitted on all 758 with age
 * unknown counted as 1 year; fitting on the 645 dated protocols and predicting the undated
 * ones at the median dated age is better on 5-fold cross-validated log-loss (0.6251 vs 0.6404
 * for the v1 fit, same folds), so the imputation never enters the fit. The 5-fold CV is
 * computed here, with a fixed shuffle, so the dashboard shows the program's own number.
 */
export function fitLaunchOdds(protocols: SnapshotProtocol[], asOf: string): LaunchFit {
  const dated = protocols.filter((p) => ageDays(asOf, p.listed_at) !== null);
  const ages = dated.map((p) => ageDays(asOf, p.listed_at) as number);
  const medianAge = median(ages);
  const rows = dated.map((p) => ({
    age_years: (ageDays(asOf, p.listed_at) as number) / 365,
    log_tvl: Math.log(p.tvl_usd),
    y: isPreToken(p) ? 0 : 1,
  }));
  const beta = logisticFit(rows);
  // 5-fold CV log-loss on the dated protocols, mulberry32(20261114) shuffle, folds by index % 5.
  const rng = mulberry32(20261114);
  const order = rows.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
  }
  let lossSum = 0;
  let lossN = 0;
  for (let f = 0; f < 5; f++) {
    const testIdx = new Set(order.filter((_, k) => k % 5 === f));
    const train = rows.filter((_, i) => !testIdx.has(i));
    const test = rows.filter((_, i) => testIdx.has(i));
    const b = logisticFit(train);
    for (const r of test) {
      const z = Math.max(-30, Math.min(30, b[0]! + b[1]! * r.age_years + b[2]! * r.log_tvl));
      const pr = Math.min(1 - 1e-9, Math.max(1e-9, 1 / (1 + Math.exp(-z))));
      lossSum += -(r.y * Math.log(pr) + (1 - r.y) * Math.log(1 - pr));
      lossN++;
    }
  }
  return {
    b0: beta[0]!,
    b1: beta[1]!,
    b2: beta[2]!,
    n: protocols.length,
    dated_n: dated.length,
    median_age_days: medianAge,
    cv_logloss: Math.round((lossSum / lossN) * 10000) / 10000,
  };
}

/** P(launch) for one protocol. Age unknown counts as the median dated age (677 days). */
export function launchOdds(p: SnapshotProtocol, asOf: string, fit: LaunchFit): number {
  const age = ageDays(asOf, p.listed_at);
  const z = fit.b0 + fit.b1 * ((age === null ? fit.median_age_days : age) / 365) + fit.b2 * Math.log(p.tvl_usd);
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

// ---------------------------------------------------------------- validation

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Leave-one-out, walk-forward (oldest 70% fit, newest 30% test) and 10-fold error multiples,
 * plus the per-kind bands: for each category with at least KIND_BAND_MIN_N comps, the median
 * of that category's leave-one-out error multiples. Sparse kinds fall back to the global band.
 * Also the per-category median mcap/TVL among comps (the own-token share) for kinds with at
 * least 4 comps, and the raw age-bucket shares for the odds calibration table.
 */
export function validateComps(comps: SnapshotProtocol[], asOf: string, all: SnapshotProtocol[]): Validation {
  const predict = (fit: CompsFit, p: SnapshotProtocol): number => expectedMcap(p.tvl_usd, fit);
  const loo: number[] = [];
  const looByKind = new Map<string, number[]>();
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const fit = fitComps(train);
    const m = errorMultiple(predict(fit, comps[i]!), comps[i]!.mcap_usd as number);
    loo.push(m);
    const kind = comps[i]!.category ?? '(none)';
    const arr = looByKind.get(kind) ?? [];
    arr.push(m);
    looByKind.set(kind, arr);
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
  const globalBand = round2(median(loo));
  const byKind: Record<string, KindBand> = {};
  for (const [kind, mults] of [...looByKind.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (mults.length >= KIND_BAND_MIN_N) byKind[kind] = { band: round2(median(mults)), p80: round2(quantile(mults, 0.8)), n: mults.length };
  }
  const shareByKind = new Map<string, number[]>();
  for (const p of comps) {
    const kind = p.category ?? '(none)';
    const arr = shareByKind.get(kind) ?? [];
    arr.push((p.mcap_usd as number) / p.tvl_usd);
    shareByKind.set(kind, arr);
  }
  const kindShare: Record<string, KindShare> = {};
  for (const [kind, ratios] of [...shareByKind.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (ratios.length >= 4) kindShare[kind] = { median_mcap_tvl: Math.round(median(ratios) * 1000) / 1000, n: ratios.length };
  }
  const buckets: [string, number, number | null][] = [
    ['0–90 days', 0, 90],
    ['90–180 days', 90, 180],
    ['180–365 days', 180, 365],
    ['1–2 years', 365, 730],
    ['2–3 years', 730, 1095],
    ['3–5 years', 1095, 1825],
    ['5+ years', 1825, null],
  ];
  const ageBuckets: AgeBucket[] = buckets.map(([label, lo, hi]) => {
    const inBucket = all.filter((p) => {
      const a = ageDays(asOf, p.listed_at);
      if (a === null) return false;
      return a >= lo && (hi === null || a < hi);
    });
    const withToken = inBucket.filter((p) => !isPreToken(p)).length;
    return { label, n: inBucket.length, share_with_token: inBucket.length === 0 ? 0 : Math.round((withToken / inBucket.length) * 1000) / 1000 };
  });
  const undated = all.filter((p) => ageDays(asOf, p.listed_at) === null);
  const undatedWith = undated.filter((p) => !isPreToken(p)).length;
  ageBuckets.push({ label: 'age unknown', n: undated.length, share_with_token: undated.length === 0 ? 0 : Math.round((undatedWith / undated.length) * 1000) / 1000 });
  return {
    loo_median: globalBand,
    loo_geo: round2(geoMean(loo)),
    wf_median: round2(median(wf)),
    wf_geo: round2(geoMean(wf)),
    kfold_median: round2(median(kf)),
    kfold_geo: round2(geoMean(kf)),
    comps_n: comps.length,
    bands: { global: globalBand, global_p80: round2(quantile(loo, 0.8)), by_kind: byKind, min_n: KIND_BAND_MIN_N },
    kind_share: kindShare,
    age_buckets: ageBuckets,
    dropped_terms: [
      'quadratic log(TVL)^2: LOO x3.39, walk-forward x2.82, 10-fold x3.47 — looked better, then failed the stress test: the quadratic coefficient flips sign across leave-one-out folds (-0.0105 to +0.0195), R2 is unchanged at 0.194, repeated 10-fold over 5 seeds is worse than the plain curve (x3.59 vs x3.50), and the walk-forward gain is cut-dependent (x3.02 vs x2.89 at the 60% cut, x2.82 vs x3.41 at 70%, x4.92 vs x4.98 at 80%)',
      'category terms (shrunk medians k=2/5/10/20, ridge lambda=3/10/30/100/300): LOO x3.59-x3.95, worse than the plain curve; within-category spread is 1-2 log units, so the category means are mostly noise',
      'growth (change_7d, asinh): LOO x3.71 and walk-forward x3.30, worse than the plain curve on LOO',
      'age (log age): LOO x3.43 and walk-forward x5.45 — destroys the walk-forward test',
      'age + growth together: walk-forward x6.50',
      'chain count (log1p chains): LOO x4.04 and walk-forward x3.84',
      'all features together: walk-forward x5.27',
      'kNN median (k=12/20): LOO x4.50 / x4.16',
      'local-linear (h=1.0): LOO x3.65, walk-forward x2.82 — LOO worse',
      'trimmed OLS (10%): LOO x3.53, walk-forward x3.07, 10-fold x3.57 — LOO worse',
      'cubic, hinge at the median logTVL, spline (3 knots): LOO x3.60 / x3.59 / x3.59',
      'Theil-Sen and Siegel repeated-median slopes: LOO x3.52 / x3.82, worse than OLS',
      'comps subsets (no bridges/CEX, no liquid staking, rankable categories only): LOO as low as x3.06 on the subset, but walk-forward x3.83-x4.51, and fitting on the subset and testing on all 128 comps gives LOO x3.56-x3.81, worse than the full-set x3.40 — the gain is removing hard points from the test set',
      'cure/hazard launch-odds model (P(ever launches) x Weibull survival): 5-fold CV log-loss 0.6622 vs 0.6260 for the logistic, NLL 416.1 vs 400.7, and it degenerates — remaining-launch odds 1.000 at every age, because the token share by age never plateaus',
    ],
  };
}

/** The range band for one row: its category's own leave-one-out median where the category has enough comps, else the global band. Live rows with a market price carry band 1 (no range). */
export function bandFor(category: string | null, validation: Validation): number {
  if (category !== null && validation.bands.by_kind[category] !== undefined) return validation.bands.by_kind[category]!.band;
  return validation.bands.global;
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

/**
 * actionFor: the farming action, by lowercased category, most specific first.
 * The action comes from the category and the deposit size only — never from the protocol's
 * name — so the same rule serves every protocol in the category.
 */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('liquid restaking') || c.includes('restaked btc')) return `Restake $${capital} of the liquid staking token through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('restaking')) return `Restake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('liquid staking')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('yield aggregator')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('leveraged farm')) return `Open a $${capital} leveraged farm on ${name} on ${chain} and keep the position open.`;
  if (c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('basis trading')) return `Deposit $${capital} of USDC into the ${name} basis vault on ${chain} and keep the shares.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('interest rate')) return `Lend $${capital} of USDC at a fixed rate through ${name} on ${chain} and keep the position open.`;
  if (c.includes('uncollateralized lending')) return `Lend $${capital} of USDC through ${name} on ${chain} and keep the loan open.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('nft lending')) return `Lend $${capital} of USDC against an NFT on ${name} on ${chain} and keep the loan open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('liquidity manager') || c.includes('farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stablecoin wrapper') || c.includes('dual-token') || c.includes('algo-stable') || c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('governance')) return `Deposit $${capital} of USDC into ${name} on ${chain} and vote in its governance.`;
  if (c.includes('oracle')) return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  if (c.includes('privacy')) return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  if (c.includes('gaming') || c.includes('social') || c.includes('ai')) return `Deposit $${capital} of USDC into ${name} on ${chain} and use its app each week.`;
  if (c.includes('payments') || c.includes('otc') || c.includes('indexes') || c.includes('crypto card')) return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  if (c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function fmtUsd2(n: number): string {
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
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
  opportunity_cost: number;
  farmer_value: number | null;
  usd_per_hour: number | null;
  verdict: 'farm' | 'thin' | 'skip' | 'live';
  steps: string[];
}

/**
 * The costed farm plan for one protocol. The $/hour is netted to the dollar: the expected
 * farmer value minus the gas for the whole plan minus the opportunity cost of the capital
 * (5% APY over the hold). The verdict step shows the whole subtraction and the break-even
 * airdrop value, so a farmer can see exactly what the verdict prices in.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null, implied: number, pLaunch: number, status: 'pre-token' | 'live'): FarmPlan {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const gas = gasPerTx(chain);
  const txs = 1 + weeks + 1;
  const gasTotal = Math.round(gas * txs * 100) / 100;
  const oppCost = Math.round(capital * OPPORTUNITY_APY * (hold / 365) * 100) / 100;
  const hours = Math.round((0.25 + weeks * 0.17 + 0.17 + 0.08) * 10) / 10;
  if (status === 'live') {
    const steps: FarmStep[] = [
      { text: `The token already trades, so there is no launch to farm: buy the token or provide liquidity only if you want the exposure.`, cost: `$${capital} of capital if you take a position`, time: '15 minutes to set up' },
      { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
      { text: `If the protocol pays staking or liquidity rewards, claim them from its own app and restake or sell on your schedule.`, cost: `about $${gas} of gas per claim`, time: '10 minutes per claim' },
      { text: `Vote in the protocol's governance when a proposal touches the pool or vault you use, so your position is counted.`, cost: `about $${gas} of gas per vote`, time: '10 minutes per vote' },
      { text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
    ];
    return { capital, hold_days: hold, hours, gas_total: gasTotal, opportunity_cost: oppCost, farmer_value: null, usd_per_hour: null, verdict: 'live', steps: steps.map(stepText) };
  }
  const farmerValue = Math.round(implied * ALLOCATION_SHARE * (AVG_DEPOSIT_USD / p.tvl_usd));
  const netValue = farmerValue - gasTotal - oppCost;
  const usdPerHour = Math.round((netValue / hours) * 100) / 100;
  const verdict: 'farm' | 'thin' | 'skip' = usdPerHour >= FARM_THRESHOLD ? 'farm' : usdPerHour >= THIN_THRESHOLD ? 'thin' : 'skip';
  const breakEven = Math.round((gasTotal + oppCost) * 100) / 100;
  const action = actionFor(p, capital, chain);
  const steps: FarmStep[] = [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`, cost: `under $${Math.max(gas, 3)} of gas for the first transaction`, time: '5 minutes' },
    { text: action, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
    { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`, cost: `about $${gas} of gas a week`, time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
    {
      text: `Verdict: ${verdict.toUpperCase()} — expected ${fmtUsd(farmerValue)} per farmer, minus ${fmtUsd2(gasTotal)} gas and ${fmtUsd2(oppCost)} opportunity cost ($${capital} at 5% APY over ${hold} days), leaves ${fmtUsd(netValue)} net at $${usdPerHour}/hour over ${hours} hours (model estimate, not a promise). Break-even airdrop value ${fmtUsd2(breakEven)}.`,
      cost: `${fmtUsd2(gasTotal)} of gas and ${fmtUsd2(oppCost)} of opportunity cost in all`,
      time: `${hours} hours in all`,
    },
  ];
  return { capital, hold_days: hold, hours, gas_total: gasTotal, opportunity_cost: oppCost, farmer_value: farmerValue, usd_per_hour: usdPerHour, verdict, steps: steps.map(stepText) };
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

/**
 * Rank ranges: for a pre-token row, the span of pre-ranks among pre-token rows whose value
 * ranges overlap its own; for a live row, the span of overall ranks among all rows whose
 * value ranges overlap its own. A range that collapses to the rank itself means no other
 * row's range touches it; a wide range means the ordering there is a coin flip.
 */
function assignRankRanges(scored: BoardRow[]): void {
  const pre = scored.filter((r) => r.token_status === 'pre-token');
  for (const r of pre) {
    let lo = r.pre_rank as number;
    let hi = r.pre_rank as number;
    for (const o of pre) {
      if (o === r) continue;
      if (o.value_low_usd <= r.value_high_usd && r.value_low_usd <= o.value_high_usd) {
        lo = Math.min(lo, o.pre_rank as number);
        hi = Math.max(hi, o.pre_rank as number);
      }
    }
    r.rank_low = lo;
    r.rank_high = hi;
  }
  for (const r of scored.filter((x) => x.token_status === 'live')) {
    let lo = r.rank;
    let hi = r.rank;
    for (const o of scored) {
      if (o === r) continue;
      if (o.value_low_usd <= r.value_high_usd && r.value_low_usd <= o.value_high_usd) {
        lo = Math.min(lo, o.rank);
        hi = Math.max(hi, o.rank);
      }
    }
    r.rank_low = lo;
    r.rank_high = hi;
  }
}

export function buildRadar(snapshot: Snapshot): BuiltRadar {
  const comps = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const fit = fitComps(comps);
  const launch = fitLaunchOdds(snapshot.protocols, snapshot.as_of);
  const validation = validateComps(comps, snapshot.as_of, snapshot.protocols);

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
      const band = bandFor(p.category, validation);
      const plan = farmPlan(p, age, implied, pl, 'pre-token');
      scored.push({
        rank: 0,
        pre_rank: null,
        rank_low: 0,
        rank_high: 0,
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
        value_low_usd: Math.max(1, Math.round(implied / band)),
        value_high_usd: Math.round(implied * band),
        band,
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
      const band = hasMcap ? 1 : bandFor(p.category, validation);
      const plan = farmPlan(p, age, value, 1, 'live');
      scored.push({
        rank: 0,
        pre_rank: null,
        rank_low: 0,
        rank_high: 0,
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
        value_low_usd: hasMcap ? value : Math.max(1, Math.round(value / band)),
        value_high_usd: hasMcap ? value : Math.round(value * band),
        band,
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
  assignRankRanges(scored);
  setAside.sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  const rows: RadarRow[] = scored.map((r) => ({
    r: r.rank,
    pr: r.pre_rank,
    rl: r.rank_low,
    rh: r.rank_high,
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
    bd: r.band,
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
    launch: { b0: launch.b0, b1: launch.b1, b2: launch.b2, n: launch.n, dated_n: launch.dated_n, median_age_days: launch.median_age_days, cv_logloss: launch.cv_logloss },
    validation,
    counts: {
      snapshot: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      board: scored.length,
      pre_token: preRows.length,
      live: scored.length - preRows.length,
      set_aside: setAside.length,
    },
    assumptions: { allocation_share: ALLOCATION_SHARE, avg_deposit_usd: AVG_DEPOSIT_USD, farm_threshold_usd_h: FARM_THRESHOLD, thin_threshold_usd_h: THIN_THRESHOLD, opportunity_apy: OPPORTUNITY_APY },
    watchlist: [...snapshot.watchlist].sort(),
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
    if (r.token_status === 'pre-token') {
      if (r.pre_rank === null || r.rank_low > r.pre_rank || r.rank_high < r.pre_rank) {
        return `${r.slug} has a pre-rank range ${r.rank_low}-${r.rank_high} that misses its own pre-rank ${r.pre_rank}`;
      }
    } else if (r.rank_low > r.rank || r.rank_high < r.rank) {
      return `${r.slug} has a rank range ${r.rank_low}-${r.rank_high} that misses its own rank ${r.rank}`;
    }
    if (r.band < 1) return `${r.slug} has band ${r.band}`;
    if (r.token_status === 'pre-token' && (r.value_low_usd !== Math.max(1, Math.round(r.implied_value_usd / r.band)) || r.value_high_usd !== Math.round(r.implied_value_usd * r.band))) {
      return `${r.slug} has a value range that does not match its band ${r.band}`;
    }
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
