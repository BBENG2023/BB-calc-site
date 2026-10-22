# Spec — `pile-group-settlement`

Source: Geotech Bible 1 "Pile Granular Settlement" sheet (reference-only).

## Purpose
Settlement of a pile group founded in granular soil, by the equivalent raft
method (Tomlinson) with Burland & Burbidge (1985) beneath the raft.

## Method
- Group plan: rows × columns at spacing s, pile diameter D.
  Group footprint Bg = (cols−1)s + D, Lg = (rows−1)s + D.
- Raft depth: end-bearing piles → top of bearing stratum + 2/3 of the
  embedment into it. Friction piles → 2/3 of pile length below the head.
- Load spread 1H:4V from the group perimeter at the top of the bearing
  stratum (end bearing) or the pile head (friction) down to raft level.
- Raft net pressure q = (G + Q)/(B·L).
- Burland & Burbidge: Ic = 1.71/N̄^1.4, zI = B^0.763, fs, fl, ft;
  si = fs·fl·(q′ − ⅔σ′v0)·B^0.7·Ic for normally consolidated sand
  (q′/3 if q′ ≤ σ′v0).
- N corrections: fine/silty sand below water N′ = 15 + 0.5(N − 15) for N > 15;
  gravel ×1.25.
- Elastic shortening of the pile: Δ = P·Lp/(A·E) × factor (0.5 friction,
  1.0 end bearing).
- Settlement limit is a user input (structure SLS), not 10%D.

## Outputs
Raft depth, B, L, q, σ′v0, Ic, zI, fs, fl, ft, immediate and long-term
settlement, shortening, total, utilisation against the limit.

## Fixes against source
Raft from levels in the bearing stratum; N correction by soil type; σ′v0
deduction; limit as SLS input.

## Validation
- S1: master method reproduced locally (project data, not committed).
- S2 (synthetic): 3×3 group, s 1.8 m, D 0.6 m, head 1 m, toe 16 m, bearing
  stratum top 10 m, γ 19, water 50 m, N̄ 25 (medium sand), G 6000 kN,
  Q 1500 kN, t 30 yr. Hand values in the validation sample.
