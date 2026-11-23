# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cathome404-source/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cathome404-source/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar for the 2026-11-14 DeFiLlama protocol index (758 protocols, 40 on the watchlist). It fits a value curve on the 128 protocols whose token already trades — `log(mcap) = 6.9646 + 0.5223 · log(TVL)`, R² 0.194 — validates it out of sample (leave-one-out median error ×3.40, walk-forward ×3.41, 10-fold ×3.63), turns age and size into launch odds with a logistic fitted on the 645 dated protocols (5-fold CV log-loss 0.6260), and ranks every rankable protocol by implied value = P(launch) × expected market cap. Every value is shown as a range priced per kind — RWA ×1.59, Yield ×3.96, Dexs ×5.28, Lending ×7.26, sparse kinds the global ×3.40 — and every rank carries the rank range its value range allows (rank #1, plausible #1–129). The board covers 614 rows — 198 pre-token launches plus 416 live protocols (market cap where it trades, modelled value where it does not) — with the other 144 accounted for in a set-aside tab with the reason each was excluded (CEX, wrapped/staked/bridge products, versioned pools). Every row carries a costed farm plan: deposit size, gas by chain tier, hold time, expected farmer value and a $/hour verdict netted to the dollar (farmer value minus gas minus the opportunity cost of the capital at 5% APY), with a farm / thin / skip verdict (151 farm, 22 thin, 25 skip) and a $/hour table at $50 / $100 / $250 deposits in the detail view. Forty-five value models and seven odds models were fitted and tested the same way and are listed on the dashboard with their numbers — the plain log-log curve is kept because nothing beat it on all three held-out tests. No hardcoded protocol names anywhere: the model refits from the snapshot at runtime. The dashboard verifies itself live: nine checks (watchlist, coverage, ranks, recomputed values, ranges, farm steps, set-aside, odds) run in the browser against the data file and all pass.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

Requires Node 22.18+ (runs TypeScript as-is). Writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Fully deterministic: two runs write byte-identical output.

---

<sub>Entered on [make.fun](https://make.fun/?ref=j8pfc02z&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
