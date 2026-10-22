# Spec — `pile-axial-ec7`

Sources: Geotech Bible 1 "EC Pile Design" sheet (reference-only), and
"H-piles Capacity via SPT N value" (password-protected — method deduced, not opened).

## Purpose
Compression resistance of a single bored, CFA or driven pile from ground test
results (calculation method), verified to BS EN 1997-1 DA1 with the UK
National Annex.

## Method
- Layers by depth below ground. Pile head and toe depths cut the layers.
- σ′v from γ and groundwater depth (γw = 9.81).
- Cohesive shaft: qs = α·cu, capped (default 110 kPa). α default: bored/CFA
  0.5; driven from cu/σ′v (1.0 to 0.35, linear to 0.5 at 0.8). User override.
- Cohesive base: qb = 9·cu at toe.
- Granular shaft (effective stress): qs = K·σ′v·tan δ, K = (Ks/K0)·(1 − sin φ′),
  δ = (δ/φ′)·φ′. Defaults by pile type (Ks/K0: bored 0.9, driven 1.5, H-pile 1.0;
  δ/φ′: cast in place 1.0, precast 0.9, steel 0.7).
- Granular base: qb = Nq·σ′v,toe, Nq from EC7 Annex D formula (conservative)
  or user value from the Berezantsev chart. Limit qb,lim (default 10 MPa).
- Granular SPT method (Meyerhof 1976), driven piles only: qs = 2N̄ (large
  displacement) or 1N̄ (small displacement, H-piles) kPa; qb = 40N·L/D ≤ 400N kPa.
- H-pile geometry: shaft perimeter = box 2(b+h); base area = box b·h
  (plugged) or steel area.
- Downdrag layers: excluded from resistance; their shaft friction is a
  permanent action (γG 1.35 C1, 1.0 C2).
- Rc,k = (Rb,cal + Rs,cal) / (ξ·γRd). ξ = max(ξ3/ξ4) per UK NA Table A.NA.10 for
  n profiles; optional ÷1.1 for stiff caps. γRd = 1.4 (1.2 with load test).
- C1: A1 + M1 + R1 (UK NA R1 = 1.0). C2: A2 + M1 + R4 (UK NA Tables
  A.NA.6–A.NA.8, with/without explicit SLS verification). Separate base and
  shaft factors: Rc,d = Rb,k/γb + Rs,k/γs.
- Pile self-weight optional as a permanent action.

## Inputs
Pile type, D (or H-section h, b, As), head depth, toe depth, groundwater depth,
number of soil profiles n, stiff cap, load test, SLS verified, Gk and Qk per
pile, layer table (top depth, base depth, type, γ, cu, φ′, N, method, downdrag).

## Outputs
Per-layer shaft table, Rs,cal, Rb,cal, Rc,k, Rc,d (C1, C2), Fc,d (C1, C2),
utilisation, governing combination.

## Fixes against source
UK NA factors (R4, ξ, model factor); K from Ks/K0; shaft lengths from levels;
downdrag excluded from resistance and factored as permanent; single-pile basis.
Block failure and lateral capacity deferred (FUTURE.md).

## Validation
- S1: master method reproduced locally (project data, not committed).
- S2 (synthetic): 0.6 m bored pile, head 0, toe 15 m, clay 0–8 m (γ 19, cu 60,
  α 0.5), sand 8–20 m (γ 20, φ′ 32°), no groundwater. Hand values in the
  validation sample.
