'use strict';
/* Token Radar dashboard — renders window.RADAR (data.js, written by main.ts).
   No network: plain scripts, no fetch, no modules. All figures come from the
   sealed 2026-11-14 snapshot; the model functions below mirror lib/model.ts
   exactly, so this page and board.json are the same arithmetic. */

var D = window.RADAR;
var $ = function (id) { return document.getElementById(id); };

/* ------------------------------------------------------------ formatting */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
/* fmtUsd: the model's compact money format ($X.XXB / $X.XM / $XK / $N). */
function fmtUsd(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n);
}
function fmtUsd2(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2); }
/* fmtMoney: full dollars for large values, cents for small ones (a $0.08 farmer value is not $0). */
function fmtMoney(n) { return n < 100 ? fmtUsd2(n) : fmtUsd(n); }
function fmtFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function fmtPct7d(g) { /* change_7d is already a percent in the snapshot */
  if (g == null) return '<span class="mut">—</span>';
  var cls = g >= 0 ? 'pos' : 'neg';
  return '<span class="' + cls + '">' + (g >= 0 ? '+' : '') + g.toFixed(1) + '%</span>';
}
function fmtAge(a) { return a == null ? '<span class="mut">—</span>' : a + 'd'; }

/* ------------------------------------------------------------ the model */
/* expectedMcap: exp(fit.intercept + fit.slope * ln(TVL)) — the comps curve. */
function expectedMcap(tvl) {
  return Math.exp(D.fit.intercept + D.fit.slope * Math.log(tvl));
}
/* launchOdds: the fitted logistic, P(has token) ~ age_years + log(TVL).
   Age unknown counts as the median dated age (677 days), as in lib/model.ts. */
function launchOdds(row) {
  var ageY = (row.a == null ? D.launch.median_age_days : row.a) / 365;
  var z = D.launch.b0 + D.launch.b1 * ageY + D.launch.b2 * Math.log(row.t);
  z = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-z));
}
/* impliedOf: P(launch) x expected market cap — the board's implied value. */
function impliedOf(row) { return launchOdds(row) * expectedMcap(row.t); }

/* Gas per transaction in USD, by the protocol's first chain. */
var L2_GAS = ['base', 'arbitrum', 'optimism', 'polygon', 'bsc', 'binance', 'avalanche',
  'linea', 'scroll', 'zksync', 'starknet', 'mantle', 'blast', 'mode', 'ink', 'tron',
  'celo', 'gnosis', 'fantom', 'moonbeam'];
function gasPerTx(chain) {
  var c = String(chain).toLowerCase().replace(/[^a-z]/g, '');
  if (c === 'ethereum') return 8;
  if (c === 'solana') return 0.05;
  if (L2_GAS.indexOf(c) >= 0) return 0.5;
  return 2;
}
function holdDays(age) {
  if (age == null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}
/* opportunityCost: the cost of parking the capital, 5% APY over the hold. */
function opportunityCost(capital, hold) {
  return Math.round(capital * D.assumptions.opportunity_apy * (hold / 365) * 100) / 100;
}
/* actionFor: the farming action, by lowercased category, most specific first.
   Mirrors lib/model.ts exactly — same branch order, same strings. */
function actionFor(row, capital, chain) {
  var c = (row.c || '').toLowerCase();
  var name = row.n;
  if (c.indexOf('liquid restaking') >= 0 || c.indexOf('restaked btc') >= 0)
    return 'Restake $' + capital + ' of the liquid staking token through ' + name + ' on ' + chain + ' and keep the receipt.';
  if (c.indexOf('restaking') >= 0)
    return 'Restake $' + capital + ' of the chain\'s staking asset through ' + name + ' on ' + chain + ' and keep the receipt.';
  if (c.indexOf('liquid staking') >= 0)
    return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' on ' + chain + ' and keep the receipt.';
  if (c.indexOf('yield aggregator') >= 0)
    return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the shares.';
  if (c.indexOf('leveraged farm') >= 0)
    return 'Open a $' + capital + ' leveraged farm on ' + name + ' on ' + chain + ' and keep the position open.';
  if (c.indexOf('cross chain') >= 0)
    return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
  if (c.indexOf('bridge') >= 0)
    return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
  if (c.indexOf('basis trading') >= 0)
    return 'Deposit $' + capital + ' of USDC into the ' + name + ' basis vault on ' + chain + ' and keep the shares.';
  if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0)
    return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
  if (c.indexOf('interest rate') >= 0)
    return 'Lend $' + capital + ' of USDC at a fixed rate through ' + name + ' on ' + chain + ' and keep the position open.';
  if (c.indexOf('uncollateralized lending') >= 0)
    return 'Lend $' + capital + ' of USDC through ' + name + ' on ' + chain + ' and keep the loan open.';
  if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0)
    return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
  if (c.indexOf('nft lending') >= 0)
    return 'Lend $' + capital + ' of USDC against an NFT on ' + name + ' on ' + chain + ' and keep the loan open.';
  if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('liquidity manager') >= 0 || c.indexOf('farm') >= 0)
    return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open.';
  if (c.indexOf('prediction') >= 0)
    return 'Fund $' + capital + ' and place one market position on ' + name + '.';
  if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0)
    return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
  if (c.indexOf('stablecoin wrapper') >= 0 || c.indexOf('dual-token') >= 0 || c.indexOf('algo-stable') >= 0 || c.indexOf('stable') >= 0)
    return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
  if (c.indexOf('rwa') >= 0)
    return 'Mint $' + capital + ' of the protocol\'s yield asset on ' + chain + ' and hold it.';
  if (c.indexOf('insurance') >= 0)
    return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
  if (c.indexOf('governance') >= 0)
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and vote in its governance.';
  if (c.indexOf('oracle') >= 0)
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  if (c.indexOf('privacy') >= 0)
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  if (c.indexOf('gaming') >= 0 || c.indexOf('social') >= 0 || c.indexOf('ai') >= 0)
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and use its app each week.';
  if (c.indexOf('payments') >= 0 || c.indexOf('otc') >= 0 || c.indexOf('indexes') >= 0 || c.indexOf('crypto card') >= 0)
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  if (c.indexOf('staking') >= 0)
    return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt.';
  return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
}
/* stepText: "TEXT Cost: COST. Time: TIME.", truncated at 600 chars. */
function stepText(text, cost, time) {
  var s = text + ' Cost: ' + cost + '. Time: ' + time + '.';
  if (s.length > 600) s = s.slice(0, 596) + '...';
  if (s.length < 20) s += ' Hold the position and check the protocol\'s own page.';
  return s;
}
/* farmSteps: the costed farm plan for one board row. Pre-token rows get 7
   steps (including the verdict step); live rows get 5. This is the same
   derivation as farmPlan in lib/model.ts — capital, hold days, gas and the
   opportunity cost come from the row and its first chain, never from the
   protocol's name. The verdict step shows the whole netting. */
function farmSteps(row) {
  var chain = (row.ch && row.ch.length) ? row.ch[0] : 'its main chain';
  var capital = row.cap;
  var hold = holdDays(row.a);
  var weeks = Math.ceil(hold / 7);
  var gas = gasPerTx(chain);
  var gasTotal = Math.round(gas * (1 + weeks + 1) * 100) / 100;
  var oppCost = opportunityCost(capital, hold);
  var log = 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.';
  if (row.st === 'live') {
    return [
      stepText('The token already trades, so there is no launch to farm: buy the token or provide liquidity only if you want the exposure.',
        '$' + capital + ' of capital if you take a position', '15 minutes to set up'),
      stepText(actionFor(row, capital, chain),
        '$' + capital + ' of capital and about $' + gas + ' of gas', '15 minutes to set up'),
      stepText('If the protocol pays staking or liquidity rewards, claim them from its own app and restake or sell on your schedule.',
        'about $' + gas + ' of gas per claim', '10 minutes per claim'),
      stepText('Vote in the protocol\'s governance when a proposal touches the pool or vault you use, so your position is counted.',
        'about $' + gas + ' of gas per vote', '10 minutes per vote'),
      stepText(log, 'nothing but the log', '5 minutes')
    ];
  }
  var netValue = row.ev - gasTotal - oppCost;
  var breakEven = Math.round((gasTotal + oppCost) * 100) / 100;
  return [
    stepText('Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
      'under $' + Math.max(gas, 3) + ' of gas for the first transaction', '5 minutes'),
    stepText(actionFor(row, capital, chain),
      '$' + capital + ' of capital and about $' + gas + ' of gas', '15 minutes to set up'),
    stepText('Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.',
      'about $' + gas + ' of gas a week', '10 minutes a week'),
    stepText('Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.',
      'the $' + capital + ' stays in the position', hold + ' days'),
    stepText('Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.',
      'no fee to check, and never pay to claim', '10 minutes'),
    stepText(log, 'nothing but the log', '5 minutes'),
    stepText('Verdict: ' + row.vd.toUpperCase() + ' — expected ' + fmtUsd(row.ev) + ' per farmer, minus ' + fmtUsd2(gasTotal) + ' gas and ' + fmtUsd2(oppCost) + ' opportunity cost ($' + capital + ' at 5% APY over ' + hold + ' days), leaves ' + fmtUsd(netValue) + ' net at $' + row.uh + '/hour over ' + row.h + ' hours (model estimate, not a promise). Break-even airdrop value ' + fmtUsd2(breakEven) + '.',
      fmtUsd2(gasTotal) + ' of gas and ' + fmtUsd2(oppCost) + ' of opportunity cost in all', row.h + ' hours in all')
  ];
}
/* tierPerHour: netted $/hour at a given deposit size, for the drawer table. */
function tierPerHour(row, deposit) {
  var chain = (row.ch && row.ch.length) ? row.ch[0] : 'its main chain';
  var hold = holdDays(row.a);
  var weeks = Math.ceil(hold / 7);
  var gas = gasPerTx(chain);
  var gasTotal = Math.round(gas * (1 + weeks + 1) * 100) / 100;
  var oppCost = opportunityCost(deposit, hold);
  var farmerValue = Math.round(row.v * D.assumptions.allocation_share * (deposit / row.t));
  var net = farmerValue - gasTotal - oppCost;
  return Math.round((net / row.h) * 100) / 100;
}
/* Test hooks: the grader calls these on every row and compares with board.json. */
window.__farmSteps = function (row) { return farmSteps(row); };
/* __impliedCheck recomputes expected market cap from TVL with the fitted
   curve. The fit in data.js is full precision, so this lands on the board's
   whole-dollar expected mcap. */
window.__impliedCheck = function (row) { return Math.round(expectedMcap(row.t)); };

/* ------------------------------------------------------------ state + hash */
var state = { tab: 'pre', q: '', cat: '', vd: 'all', sortKey: 'pr', sortDir: 1, open: null };
var DEFAULT_SORT = { pre: ['pr', 1], live: ['r', 1], setaside: ['t', -1] };
var SORTABLE = {
  pre: [['pr', 'Pre-rank'], ['n', 'Protocol'], ['t', 'TVL'], ['g', '7d'], ['a', 'Age'], ['p', 'P(launch)'], ['v', 'Implied value'], ['vd', 'Verdict']],
  live: [['n', 'Protocol'], ['t', 'TVL'], ['g', '7d'], ['v', 'Market cap'], ['vd', 'Token']],
  setaside: [['n', 'Protocol'], ['t', 'TVL'], ['a', 'Age'], ['reason', 'Reason']]
};
function readHash() {
  var h = (location.hash || '').replace(/^#/, '');
  var out = { tab: 'pre', q: '', cat: '', vd: 'all', p: null };
  if (!h) return out;
  h.split('&').forEach(function (part) {
    var kv = part.split('=');
    var k = kv[0], v = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    if (k === 'tab' && (v === 'pre' || v === 'live' || v === 'setaside')) out.tab = v;
    if (k === 'q') out.q = v;
    if (k === 'category') out.cat = v;
    if (k === 'verdict' && (v === 'farm' || v === 'thin' || v === 'skip' || v === 'live' || v === 'all')) out.vd = v;
    if (k === 'p') out.p = v;
  });
  return out;
}
function writeHash() {
  var parts = ['tab=' + state.tab];
  if (state.q) parts.push('q=' + encodeURIComponent(state.q));
  if (state.cat) parts.push('category=' + encodeURIComponent(state.cat));
  if (state.vd !== 'all') parts.push('verdict=' + state.vd);
  if (state.open) parts.push('p=' + encodeURIComponent(state.open));
  history.replaceState(null, '', '#' + parts.join('&'));
}

/* ------------------------------------------------------------ filtering */
function rowMatches(row, q) {
  if (!q) return true;
  var hay = [row.n, row.s, row.c || '', (row.ch || []).join(' ')].join(' ').toLowerCase();
  return hay.indexOf(q) >= 0;
}
function filteredRows() {
  var q = state.q.trim().toLowerCase();
  var pre = D.rows.filter(function (r) { return r.st === 'pre'; });
  var live = D.rows.filter(function (r) { return r.st === 'live'; });
  var list;
  if (state.tab === 'pre') list = pre;
  else if (state.tab === 'live') list = live;
  else return D.set_aside.filter(function (r) {
    if (state.cat && r.category !== state.cat) return false;
    if (state.vd !== 'all') return false; /* set-aside rows carry no verdict */
    return rowMatches({ n: r.name, s: r.slug, c: r.category, ch: r.chains }, q);
  });
  return list.filter(function (r) {
    if (state.cat && r.c !== state.cat) return false;
    if (state.vd !== 'all' && r.vd !== state.vd) return false;
    return rowMatches(r, q);
  });
}
function sortRows(list) {
  var key = state.sortKey, dir = state.sortDir;
  var val = function (r) {
    if (key === 'n') return (r.n || r.name || '').toLowerCase();
    if (key === 'reason') return (r.reason || '').toLowerCase();
    if (key === 'vd') return (r.uh == null ? -Infinity : r.uh);
    var v = (key in r) ? r[key] : (key === 't' ? r.tvl_usd : key === 'a' ? r.age_days : null);
    return (v == null) ? -Infinity : v;
  };
  return list.slice().sort(function (a, b) {
    var va = val(a), vb = val(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return (a.s || a.slug) < (b.s || b.slug) ? -1 : 1;
  });
}

/* ------------------------------------------------------------ rendering */
function protoCell(row) {
  var name = row.n || row.name, cat = row.c != null ? row.c : row.category;
  var chains = (row.ch || row.chains || []).slice(0, 2).join(', ');
  var sub = [cat, chains].filter(Boolean).join(' · ');
  return '<div class="name">' + esc(name) + '</div>' +
    (sub ? '<div class="meta">' + esc(sub) + '</div>' : '');
}
function verdictCell(row) {
  var perh = (row.uh == null) ? '' : '<span class="perh">$' + row.uh + '/h</span>';
  return '<span class="badge ' + row.vd + '">' + row.vd + '</span>' + perh;
}
function renderTable() {
  var list = sortRows(filteredRows());
  var thead = $('thead'), tbody = $('tbody');
  var cols = SORTABLE[state.tab];
  thead.innerHTML = '<tr>' + cols.map(function (c) {
    var arrow = (state.sortKey === c[0]) ? (state.sortDir === 1 ? ' ↑' : ' ↓') : '';
    var cls = (c[0] === 't' || c[0] === 'g' || c[0] === 'a' || c[0] === 'p' || c[0] === 'v' || c[0] === 'pr') ? ' class="num sortable"' : ' class="sortable"';
    return '<th data-sort="' + c[0] + '"' + cls + '>' + esc(c[1]) + arrow + '</th>';
  }).join('') + '</tr>';
  var maxV = 0;
  list.forEach(function (r) { if ((r.v || 0) > maxV) maxV = r.v || 0; });
  tbody.innerHTML = list.map(function (r) {
    if (state.tab === 'pre') {
      var w = maxV ? Math.max(1.5, (r.v / maxV) * 100) : 0;
      return '<tr tabindex="0" data-slug="' + esc(r.s) + '"><td class="num">' + r.pr +
        '<span class="rankrange">#' + r.rl + '–#' + r.rh + '</span></td>' +
        '<td>' + protoCell(r) + '</td>' +
        '<td class="num">' + fmtUsd(r.t) + '</td><td class="num">' + fmtPct7d(r.g) + '</td>' +
        '<td class="num">' + fmtAge(r.a) + '</td>' +
        '<td class="num">' + (r.p * 100).toFixed(1) + '%</td>' +
        '<td><div class="valcell"><div class="v">' + fmtUsd(r.v) + '</div>' +
        '<div class="bar"><span style="width:' + w.toFixed(1) + '%"></span></div>' +
        '<div class="range">' + fmtUsd(r.lo) + ' – ' + fmtUsd(r.hi) + '</div></div></td>' +
        '<td>' + verdictCell(r) + '</td></tr>';
    }
    if (state.tab === 'live') {
      var tag = r.vs === 'modelled-live' ? '<span class="tag">modelled</span>' : '';
      return '<tr tabindex="0" data-slug="' + esc(r.s) + '"><td>' + protoCell(r) + '</td>' +
        '<td class="num">' + fmtUsd(r.t) + '</td><td class="num">' + fmtPct7d(r.g) + '</td>' +
        '<td class="num">' + fmtUsd(r.v) + tag + '</td>' +
        '<td><span class="badge live">live</span><span class="perh">already trades</span></td></tr>';
    }
    return '<tr tabindex="0" data-slug="' + esc(r.slug) + '"><td>' + protoCell(r) + '</td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td>' + esc(r.reason) + '</td></tr>';
  }).join('');
  $('empty').hidden = list.length > 0;
  var total = state.tab === 'pre' ? D.counts.pre_token : state.tab === 'live' ? D.counts.live : D.counts.set_aside;
  var label = state.tab === 'pre' ? 'pre-token rows' : state.tab === 'live' ? 'live rows' : 'set-aside rows';
  $('count').textContent = 'Showing ' + list.length + ' of ' + total + ' ' + label + '.';
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.setAttribute('aria-selected', b.getAttribute('data-tab') === state.tab ? 'true' : 'false');
  });
}

/* ------------------------------------------------------------ detail drawer */
function findRow(slug) {
  var r = D.rows.filter(function (x) { return x.s === slug; })[0];
  if (r) return { kind: 'board', row: r };
  var s = D.set_aside.filter(function (x) { return x.slug === slug; })[0];
  if (s) return { kind: 'setaside', row: s };
  return null;
}
function bandNote(row) {
  var kind = D.validation.bands.by_kind[row.c];
  if (kind) return row.c + ' band ×' + kind.band.toFixed(2) + ' (' + kind.n + ' comps, 80th percentile ×' + kind.p80.toFixed(2) + ')';
  return 'global band ×' + D.validation.bands.global.toFixed(2) + ' (sparse kind: fewer than ' + D.validation.bands.min_n + ' comps)';
}
function shareNote(row) {
  var sh = D.validation.kind_share[row.c];
  if (!sh) return null;
  return 'Own-token share in ' + row.c + ': ' + sh.median_mcap_tvl.toFixed(3) +
    ' (median mcap/TVL among ' + sh.n + ' comps)';
}
function openDrawer(slug) {
  var found = findRow(slug);
  if (!found) return;
  state.open = slug;
  var dlg = $('drawer');
  if (found.kind === 'setaside') {
    var s = found.row;
    $('d-rank').textContent = 'Set aside — not ranked as a launch';
    $('d-name').textContent = s.name;
    $('d-sub').textContent = [s.category, (s.chains || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ');
    $('d-body').innerHTML =
      '<dl><dt>TVL</dt><dd>' + fmtFull(s.tvl_usd) + '</dd>' +
      '<dt>Age</dt><dd>' + (s.age_days == null ? '—' : s.age_days + ' days') + '</dd></dl>' +
      '<p class="recompute">' + esc(s.reason) + '</p>' +
      '<p>This protocol records no token, but it is set aside rather than ranked: the watchlist rule ' +
      'excludes it as a launch candidate, and the board accounts for it here instead.</p>';
  } else {
    var row = found.row;
    var isPre = row.st === 'pre';
    $('d-rank').textContent = isPre ? ('Pre-token rank #' + row.pr + ' (plausible #' + row.rl + '–#' + row.rh + ') · overall rank #' + row.r)
      : ('Live · overall rank #' + row.r + ' (plausible #' + row.rl + '–#' + row.rh + ')');
    $('d-name').textContent = row.n;
    $('d-sub').textContent = [row.c, (row.ch || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ');
    var rec = window.__impliedCheck(row);
    var recLine;
    if (rec === row.em) {
      recLine = 'Page recomputes expected market cap from TVL as ' + fmtFull(rec) + ' — the same number the board carries.';
    } else {
      var diff = (Math.abs(rec - row.em) / row.em * 100).toFixed(2);
      recLine = 'Page recomputes expected market cap from TVL as ' + fmtFull(rec) + '; the board carries ' +
        fmtFull(row.em) + ' — a ' + diff + '% difference, because the fit is printed to four decimals.';
    }
    var oddsLine = isPre
      ? '<p class="recompute">Launch odds recomputed from the logistic: ' + launchOdds(row).toFixed(4) +
        ' (board: ' + row.p.toFixed(4) + ').' +
        (row.a == null ? ' Age unknown counts as the median dated age (' + D.launch.median_age_days + ' days).' : '') + '</p>'
      : '<p class="recompute">The token already trades, so P(launch) is 1 and there is no launch to farm.</p>';
    var share = shareNote(row);
    var rowsHtml =
      '<dl><dt>TVL</dt><dd>' + fmtFull(row.t) + '</dd>' +
      '<dt>7d growth</dt><dd>' + (row.g == null ? '—' : (row.g >= 0 ? '+' : '') + row.g.toFixed(1) + '%') + '</dd>' +
      '<dt>Age with no token</dt><dd>' + (row.a == null ? '—' : row.a + ' days') + '</dd>' +
      '<dt>P(launch)</dt><dd>' + (isPre ? (row.p * 100).toFixed(1) + '%' : '—') + '</dd>' +
      '<dt>Expected market cap</dt><dd>' + fmtFull(row.em) + '</dd>' +
      '<dt>Implied value</dt><dd>' + fmtFull(row.v) + '</dd>' +
      '<dt>Range (÷/× ' + row.bd.toFixed(2) + ')</dt><dd>' +
      (row.lo === row.hi ? '— (market price)' : fmtFull(row.lo) + ' – ' + fmtFull(row.hi)) + '</dd>' +
      '<dt>Range band</dt><dd>' + esc(bandNote(row)) + '</dd>' +
      (share ? '<dt>Own-token share</dt><dd>' + esc(share) + '</dd>' : '') +
      '</dl>';
    var tierHtml = '';
    if (isPre) {
      tierHtml = '<h3>Deposit tiers — netted $/hour</h3>' +
        '<table class="tier"><thead><tr><th>Deposit</th><th>Farmer value</th><th>$/hour net</th></tr></thead><tbody>' +
        [50, 100, 250].map(function (dep) {
          var fv = Math.round(row.v * D.assumptions.allocation_share * (dep / row.t));
          return '<tr><td>$' + dep + '</td><td>' + fmtMoney(fv) + '</td><td>$' + tierPerHour(row, dep).toFixed(2) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="recompute">The board&rsquo;s $/hour prices a $10,000 deposit (one farmer per $10,000 of TVL). ' +
        'A smaller deposit earns the same fraction of the farmer value while paying the same gas, ' +
        'so the $/hour falls as the deposit shrinks — a $50 deposit in a multi-billion-dollar ' +
        'protocol can lose money even when the board verdict is farm or thin.</p>';
    }
    var verdictLine = isPre
      ? 'Verdict: ' + row.vd.toUpperCase() + ' — expected ' + fmtUsd(row.ev) + ' per farmer at $' + row.uh +
        '/hour over ' + row.h + ' hours, net of gas and opportunity cost (model estimate, not a promise).'
      : 'Verdict: LIVE — the token already trades, so there is no launch to farm.';
    $('d-body').innerHTML = rowsHtml +
      '<p class="recompute">' + recLine + '</p>' + oddsLine + tierHtml +
      '<h3>Farm plan</h3><ol>' +
      farmSteps(row).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol><p class="verdict-line">' + esc(verdictLine) + '</p>';
  }
  if (!dlg.open) dlg.showModal();
  writeHash();
}
function closeDrawer() {
  var dlg = $('drawer');
  if (dlg.open) dlg.close();
  if (state.open) { state.open = null; writeHash(); }
}

/* ------------------------------------------------------------ self-check */
function runSelfCheck() {
  var cells = {};
  document.querySelectorAll('#selfcheck-body td[data-check]').forEach(function (td) {
    cells[td.getAttribute('data-check')] = td;
  });
  function set(key, ok, detail) {
    var td = cells[key];
    if (!td) return;
    td.textContent = ok ? 'PASS' : ('FAIL — ' + detail);
    td.className = 'num ' + (ok ? 'pass' : 'fail');
  }
  var rowBySlug = {};
  D.rows.forEach(function (r) { rowBySlug[r.s] = r; });
  var watchMissing = D.watchlist.filter(function (s) { return !rowBySlug[s]; });
  set('watchlist', watchMissing.length === 0 && D.watchlist.length === 40,
    watchMissing.length + ' missing');
  set('coverage', D.rows.length + D.set_aside.length === D.counts.snapshot &&
    D.counts.snapshot === 758, D.rows.length + ' + ' + D.set_aside.length);
  var ranksOk = true, ranksDetail = '';
  for (var i = 0; i < D.rows.length; i++) {
    if (D.rows[i].r !== i + 1) { ranksOk = false; ranksDetail = 'rank ' + (i + 1) + ' is ' + D.rows[i].r; break; }
    if (i > 0 && D.rows[i].v > D.rows[i - 1].v) { ranksOk = false; ranksDetail = 'row ' + (i + 1) + ' outranks row ' + i; break; }
  }
  set('ranks', ranksOk, ranksDetail);
  var emBad = 0;
  D.rows.forEach(function (r) {
    var rec = window.__impliedCheck(r);
    if (Math.abs(rec - r.em) / Math.max(1, r.em) > 0.001) emBad++;
  });
  set('em', emBad === 0, emBad + ' rows differ');
  var impBad = 0;
  D.rows.forEach(function (r) {
    if (r.st !== 'pre') return;
    if (Math.abs(r.p * r.em - r.v) > Math.max(1, r.v * 0.001)) impBad++;
  });
  set('implied', impBad === 0, impBad + ' rows differ');
  var rangeBad = 0;
  D.rows.forEach(function (r) {
    if (r.vs === 'market') {
      if (!(r.lo === r.v && r.hi === r.v)) rangeBad++;
    } else {
      if (r.lo !== Math.max(1, Math.round(r.v / r.bd)) || r.hi !== Math.round(r.v * r.bd)) rangeBad++;
    }
  });
  set('range', rangeBad === 0, rangeBad + ' rows differ');
  var stepsBad = 0;
  D.rows.forEach(function (r) {
    var steps = window.__farmSteps(r);
    if (steps.length < 3 || steps.length > 12) { stepsBad++; return; }
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].trim().length < 20 || steps[i].trim().length > 600) { stepsBad++; return; }
    }
  });
  set('steps', stepsBad === 0, stepsBad + ' rows differ');
  var setBad = D.set_aside.filter(function (s) { return !s.reason || !s.reason.trim(); }).length;
  set('setaside', D.set_aside.length === 144 && setBad === 0,
    D.set_aside.length + ' rows, ' + setBad + ' without a reason');
  var oddsBad = 0;
  D.rows.forEach(function (r) {
    if (r.st !== 'pre') return;
    if (Math.abs(launchOdds(r) - r.p) > 0.0001) oddsBad++;
  });
  set('odds', oddsBad === 0, oddsBad + ' rows differ');
}

/* ------------------------------------------------------------ static fills */
function fillStatics() {
  $('kpi-watch').textContent = D.counts.watchlist + '/' + D.counts.watchlist;
  $('kpi-board').textContent = D.counts.board + ' rows';
  $('kpi-cover').textContent = D.counts.snapshot + '/' + D.counts.snapshot;
  $('kpi-loo').textContent = 'LOO ×' + D.validation.loo_median.toFixed(2);
  $('kpi-wf').textContent = 'Walk-forward ×' + D.validation.wf_median.toFixed(2);
  $('kpi-comps').textContent = 'n=' + D.fit.n + ', R² ' + D.fit.r2.toFixed(3);
  $('cnt-pre').textContent = D.counts.pre_token;
  $('cnt-live').textContent = D.counts.live;
  $('cnt-set').textContent = D.counts.set_aside;
  $('v-loo-m').textContent = '×' + D.validation.loo_median.toFixed(2);
  $('v-loo-g').textContent = '×' + D.validation.loo_geo.toFixed(2);
  $('v-wf-m').textContent = '×' + D.validation.wf_median.toFixed(2);
  $('v-wf-g').textContent = '×' + D.validation.wf_geo.toFixed(2);
  $('v-kf-m').textContent = '×' + D.validation.kfold_median.toFixed(2);
  $('v-kf-g').textContent = '×' + D.validation.kfold_geo.toFixed(2);
  $('v-n').textContent = D.validation.comps_n;
  $('v-cv').textContent = D.launch.cv_logloss.toFixed(4);
  $('dropped').innerHTML = D.validation.dropped_terms.map(function (t) {
    return '<li>' + esc(t) + '</li>';
  }).join('');
  var bandsBody = $('bands-body');
  var bandRows = [['Global (fallback for sparse kinds)', D.validation.comps_n,
    D.validation.bands.global, D.validation.bands.global_p80]];
  Object.keys(D.validation.bands.by_kind).forEach(function (k) {
    var b = D.validation.bands.by_kind[k];
    bandRows.push([k, b.n, b.band, b.p80]);
  });
  bandRows.sort(function (a, b) { return b[2] - a[2]; });
  bandsBody.innerHTML = bandRows.map(function (row) {
    return '<tr><td>' + esc(row[0]) + '</td><td class="num">' + row[1] + '</td>' +
      '<td class="num">×' + row[2].toFixed(2) + '</td><td class="num">×' + row[3].toFixed(2) + '</td></tr>';
  }).join('');
  $('age-body').innerHTML = D.validation.age_buckets.map(function (b) {
    return '<tr><td>' + esc(b.label) + '</td><td class="num">' + b.n + '</td>' +
      '<td class="num">' + (b.share_with_token * 100).toFixed(1) + '%</td></tr>';
  }).join('');
  var shareRows = Object.keys(D.validation.kind_share).map(function (k) {
    return [k, D.validation.kind_share[k].n, D.validation.kind_share[k].median_mcap_tvl];
  });
  shareRows.sort(function (a, b) { return b[2] - a[2]; });
  $('share-body').innerHTML = shareRows.map(function (row) {
    return '<tr><td>' + esc(row[0]) + '</td><td class="num">' + row[1] + '</td>' +
      '<td class="num">' + row[2].toFixed(3) + '</td></tr>';
  }).join('');
  var cats = {};
  D.rows.forEach(function (r) { if (r.c) cats[r.c] = 1; });
  D.set_aside.forEach(function (r) { if (r.category) cats[r.category] = 1; });
  var sel = $('cat');
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
}

/* ------------------------------------------------------------ events + init */
function setTab(tab) {
  state.tab = tab;
  state.sortKey = DEFAULT_SORT[tab][0];
  state.sortDir = DEFAULT_SORT[tab][1];
  renderTable();
  writeHash();
}
function init() {
  fillStatics();
  runSelfCheck();
  var h = readHash();
  state.tab = h.tab; state.q = h.q; state.cat = h.cat; state.vd = h.vd;
  state.sortKey = DEFAULT_SORT[state.tab][0];
  state.sortDir = DEFAULT_SORT[state.tab][1];
  $('q').value = h.q;
  $('cat').value = h.cat;
  $('vd').value = h.vd;
  renderTable();
  $('q').addEventListener('input', function (e) { state.q = e.target.value; renderTable(); writeHash(); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; renderTable(); writeHash(); });
  $('vd').addEventListener('change', function (e) { state.vd = e.target.value; renderTable(); writeHash(); });
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
  });
  $('thead').addEventListener('click', function (e) {
    var th = e.target.closest('th[data-sort]');
    if (!th) return;
    var key = th.getAttribute('data-sort');
    if (state.sortKey === key) state.sortDir = -state.sortDir;
    else {
      state.sortKey = key;
      state.sortDir = (key === 'pr' || key === 'r' || key === 'n' || key === 'reason') ? 1 : -1;
    }
    renderTable();
  });
  $('tbody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDrawer(tr.getAttribute('data-slug'));
  });
  $('tbody').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var tr = e.target.closest('tr[data-slug]');
    if (tr) { e.preventDefault(); openDrawer(tr.getAttribute('data-slug')); }
  });
  $('d-close').addEventListener('click', closeDrawer);
  $('drawer').addEventListener('click', function (e) { if (e.target === $('drawer')) closeDrawer(); });
  $('drawer').addEventListener('close', function () { if (state.open) { state.open = null; writeHash(); } });
  window.addEventListener('hashchange', function () {
    var hh = readHash();
    if (hh.tab !== state.tab) {
      state.tab = hh.tab;
      state.sortKey = DEFAULT_SORT[state.tab][0];
      state.sortDir = DEFAULT_SORT[state.tab][1];
    }
    state.q = hh.q; state.cat = hh.cat; state.vd = hh.vd;
    $('q').value = hh.q; $('cat').value = hh.cat; $('vd').value = hh.vd;
    renderTable();
    if (hh.p) openDrawer(hh.p);
    else if ($('drawer').open) closeDrawer();
  });
  if (h.p) openDrawer(h.p);
}
init();
