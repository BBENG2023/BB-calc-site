# Spec — `crane-outrigger-mats`

Sources: Unified Crane Platform EC7, BB Crane Pad EKKI / Aluminium Track Mats,
Track Mat Analysis, Plate Load Test Brief (all reference only; no project data
carried across).

## Purpose
One outrigger or track load spread through a stack of mats (steel, timber,
aluminium, HDPE), then through a granular working platform to the subgrade.
Checks each mat, platform and subgrade bearing (EC7 DA1), stress on a buried
service, and writes a plate load test brief.

## Method
- Load: characteristic outrigger force F (t or kN). Structural mat checks at
  γF·F (default 1.5). Geotechnical: DA1 C1 (γ 1.5) and C2 (γ 1.3), variable action.
  Mat self-weight added as permanent.
- Each mat layer i is loaded over the footprint of the layer above (pad first).
  Cantilever lengths cx = (Li − ai)/2, cy = (Wi − bi)/2.
  Pressure under the mat p = Fd / (Li·Wi) (rigid mat assumption).
  Bending per metre m = p·c²/2; shear per metre v = p·c. Checked in both directions.
- Section capacity per metre width: solid plate/timber Z = t²/6, A = t;
  aluminium / HDPE from supplier I and Z per metre, or solid if not given.
  Steel fy/γM0 (γM0 1.0), shear fy/√3. Timber BS 5268-2 grade stresses ×K3
  (short term 1.5), K7. HDPE/composite: user fmk, fvk, γM (default 1.5).
- Stiffness check: cantilever tip deflection δ = p·c⁴/(8EI) against c/limit
  (default 1/100). Fails mean the uniform-pressure assumption is not safe.
  Where bending fails, the effective footprint is reduced until m = mRd.
- Multi-layer mats (e.g. two layers of aluminium) share load equally (n layers).
- Platform: spread at angle θ (default 26.6°, 2V:1H) through thickness h.
  Platform bearing directly beneath the bottom mat (drained, φ′p).
  Subgrade bearing on the spread area (drained φ′ or undrained cu).
  EC7 Annex D via `drainedBearing` / `undrainedBearing`; γφ = 1.25 on tan φ′,
  γcu = 1.4 in C2.
- Buried service: vertical stress at depth z under the bottom mat by
  Boussinesq (rectangle, corner superposition). Compared with a user
  allowable (e.g. from BS 9295:2020 Table 2 — enter manually).
- PLT brief: target pressure = SLS formation pressure rounded up to 5 kPa;
  plate 600 mm; acceptance settlement = user % of plate diameter (default 1.5%);
  frequency, positioning, recording text (generic).

## Fixes against source
Load factors not mixed with material factors; φ′ factored on tan; Annex D Nγ;
shear check uses shear; pass/fail tied to the correct cells; load over the
loaded footprint, not the whole track.

## Validation
- S1: master structure only (project data). 
- S2 (synthetic): 400 kN outrigger, 0.6 m pad, steel plate 2.0 × 2.0 × 0.05 m
  S275, platform 0.6 m (φ′ 40°, γ 20), subgrade cu 50 kPa. Hand values in the
  validation sample.
