# Legato interlocking block bank seat — method statement

For the checking Chartered Engineer. Calc id `legato-abutment` v1.0.0
(`calcs/legato-abutment/`). Every output is advisory and requires
independent verification and sign-off by a CEng (MICE / MIStructE) before
acceptance for tender, fabrication or construction.

## 1. Scope

Dry-laid Elite Precast Legato blocks forming the bank seats of a
single-span bridge: both ends in one design file, straight bank seats with
optional wing returns. Skew is used for load resolution and the plan
drawings only. A retaining-wall mode (no bridge, no crossing) reproduces the
Elite guide examples.

Out of scope: BS EN 1992-4 anchor resistance; non-circular slip surfaces;
undrained rapid drawdown; scour depth calculation; Vee/Duo blocks; DXF;
3D skew/wing interaction; multi-span piers; EN 1997:2024. See
`legato-abutment-deferred.md`.

## 2. Axes and sign conventions

- Bridge axes: X longitudinal (+ from End 1 to End 2), Y transverse, Z
  vertical. Reaction schedules give Z positive downward.
- Abutment axes: u normal to the face, **+ landward**, measured from the
  front face of the bottom course; v along the face; z up from the
  underside of the bottom course.
- Rotation: Fu = FX cos θ + FY sin θ; Fv = −FX sin θ + FY cos θ at End 2.
  At End 1 both components are negated (a 180° rotation), because landward
  there is −X. *Deviation from the brief:* the brief's formula flips only
  End 2; applied literally it would make +X landward at End 1, which
  contradicts "+u is always landward". Unit-tested at θ = 0° and 90°.

## 3. Reference data (js/shared-data.js)

- **Blocks LG1–LG8:** 800 × 800 × L (400–1600), 2350 kg/m³, fcu 50. Stated
  volumes, masses, lifting and drawing references as the Elite drawings.
- **Volume model:** V = L·W·H − edge × 0.0002 − n·V_recess − V_lift +
  (male ? n·V_nib : 0), with V_recess = 0.001896, V_nib = 0.001132,
  V_lift = (2/3)π·0.047³ m³, edge = 4H + 2(2L + 2W). LG1–LG7 within 0.2% of
  Elite; LG8 computes 1.0151 m³ against 1.105 stated (data flag 1).
- **Self-weight basis:** computed volume × 23.05 kN/m³ (default); Elite
  stated masses; or gross L·W·H × γ (the Elite guide examples use 23.0).
  Handling always uses the greater of stated and computed mass.
- **Plain concrete:** C40/50, fcd,pl = 0.6 × 40 / 1.5 = 16.0 N/mm²,
  fctd,pl = 0.6 × 2.5 / 1.5 = 1.0 N/mm² (BS EN 1992-1-1 §12 + UK NA —
  verify).
- **Friction:** block–block and block–grout μk = 0.5 (EC2 6.2.5(2) "very
  smooth"); block on Type 1 δ = ⅔φ′cv; Type 1 on formation δ = φ′ of the
  weaker; precast blocks directly on soil δ = ⅔φ′k; cast-in-place base
  δ = φ′k. tan δd = tan δk / γφ′.
- **Nib shear (opt-in, BB judgement):** VRd,nib = fctd,pl × 195² / 1.5 ≈
  25.4 kN per nib × η_eng (default 0.5), counting only male nibs of the lower
  course under upper-course blocks.
- **Factor presets:** EN 1990 A2 (bridges, default), A1 / EC7 Annex A,
  Legacy (unity + FoS), User. All values editable; edits are listed on the
  printed design basis.

## 4. Ground model (ground.js)

1. SPT strings parsed ("N=15", "15", "50/113", "50 for 113mm",
   "50 (24 for 37mm/50 for 113mm)"). Refusal: N = blows × 300 / p.
2. N60 = N × Er/60 (Er = 60% with a warning if not given).
3. σ′v at test depth from stratum unit weights and the design water level;
   C_N = min(√(100/σ′v), 2.0) (Liao & Whitman 1986); (N1)60 = C_N × N60.
4. N60 and (N1)60 capped at N_cap (50) before correlation.
5. φ′ = 27.1 + 0.3(N1)60 − 0.00054(N1)60² (Peck, Hanson & Thornburn via
   Wolff) or √(20(N1)60) + 20 (Hatanaka & Uchida), capped at φ′max (40°).
6. cu = f1·N60 (Stroud 1974; f1 6.0/5.0/4.5/4.2 by PI band, 4.5 unknown);
   mv = 1/(f2·N60), f2 = 0.45 MN/m²; E′ = 1.0 (NC) or 2.0 (OC) × N60 MPa.
   Cohesive drained φ′ = 42 − 12.5 log10(PI) (BS 8002:1994) with c′ = 0,
   unless lab values are entered.
7. Unit weights from the class/band table unless lab values are entered.
8. Characteristic values per stratum (EC7 2.4.5.2): cautious mean
   (mean − 0.5 SD) when n ≥ 5, otherwise the minimum; lower quartile or
   minimum selectable. Overrides apply only with a written justification.
9. Design borehole: user choice, or the borehole with the lowest cautious
   parameter at the candidate founding level.
10. Design groundwater: highest of standing, rose-to, phreatic at the
    abutment and the user value.
11. Topsoil, peat and made ground cannot be the founding stratum unless
    overridden; they are flagged for removal within the pad footprint.

## 5. Layout and levels (layout.js)

- Courses tiled on the 400 grid. Bond options: **Mixed** (default — a
  1600 L-band and an 800 T-row, the order reversed on alternate courses so
  rows bond across each other), T (long axis transverse, stretcher bond with
  800 stagger) or L. *This is what makes the V2 "9 × LG8 per course"
  arrangement tileable.*
- Block-type rule: seat, ballast and top courses female-only; blocks fully
  covered above male + female; > 50% exposed female-only; per-course
  override.
- Validation: 400-grid multiples (error), overhang of the course below
  (error), end-joint stagger < 400 mm and joints continuing through two
  interfaces (warnings), and continuous vertical joint planes through ≥ 2
  courses (warning + I4c part check).
- Levels solver: highest acceptable formation = min(top of the founding
  stratum; front ground − d_min; scour level − margin **where the pad front
  lies on the bank slope**). Pad thickness (auto, 150–500 mm) chosen to
  minimise excavation; if no fit, options (a) deepen and add a course,
  (b) special-height block, (c) packing ≤ 20 mm are reported.

## 6. Actions (actions.js)

- Free bodies above a cut: formation (underside of pad), base (underside of
  course 1) and each block interface. Each includes blocks (per block, so
  bodies can be split), pad, fill on steps/heel behind the stack up to a
  vertical virtual back at the rear of the stack, earth pressure on the
  virtual back from the cut to the fill surface, surcharge (never counted as
  stabilising), compaction pressure (Ingold envelope, optional), water on
  the back and front faces, water standing on exposed top surfaces, uplift at
  the cut (linear front → back), passive (optional, below the guaranteed
  front level), bridge reactions (only on bodies containing the seat
  course), launch loads, hydraulic and impact actions.
- Earth pressure: Rankine Ka (δ = 0) default; Coulomb (δ ≤ ⅔φ′, β) or K0.
  φ′ factored by the category's M set (M2 for EQU and DA1-C2).
- Water: total unit weights with pore pressure at every cut. For a fully
  submerged block this is identical to the buoyant weight 23.05 − 9.81 =
  13.24 kN/m³.
- Bridge reactions: per-bearing values × bearings per end; X resisted at the
  fixed end only (flag); free end X = ±μ(G + concurrent vertical traffic)
  as the brief specifies.
- Hydraulics (when the abutment or pad lies below DFL): F = ½kρv²hb
  (BS EN 1991-1-6 4.9, k = 1.44), debris force from the user.
- **Situations:** S1 traffic model i leading (+ braking, approach surcharge
  with the same γQ unless excluded for that model, wind and thermal at ψ0);
  S2 wind leading / thermal leading; S3 no deck, backfilled; S4 launch; S5
  design flood; S6 rapid drawdown; S7 accidental impact. Each is combined with
  EQU, DA1-C1, DA1-C2, SLS characteristic, SLS quasi-permanent and legacy
  factors, for both signs of reversible actions.
- **Favourable/unfavourable:** decided per action for each check —
  sliding by the direction of the horizontal component, toppling by the sign
  of the moment about the pivot, bearing by running all weights at γG,sup
  and again at γG,inf (horizontal permanent actions stay unfavourable).
  Favourable variable actions are omitted, except that vertical traffic
  always accompanies its own braking in bearing and SLS.

## 7. Checks

| Check | Method | Clause |
|---|---|---|
| E1 bearing | Annex D drained (Nq, Nγ, Nc; s, i with m per D.4; b for base inclination) and undrained (cohesive), on the formation. Granular pad: 2V:1H spread limited to the pad. Weaker layers within 2B by 2V:1H spread (simplified). γ′ interpolated for water between the base and B below. Vesic gq = gγ = max(0, 1 − tan β)² when setback b < 2B (conservative). Rock: user Rd × A′. | EC7 6.5.2, Annex D |
| E2 sliding | Block/pad and pad/formation interfaces; V favourable only; undrained A′cu,d ≤ 0.4Vd; passive only if enabled. | EC7 6.5.3 |
| E3 overturning | EQU about the front toe of the bottom rigid element (bottom course, or a mass concrete base); landward about the rear edge. | EN 1990 6.4.3.1 |
| E4 eccentricity | SLS characteristic e ≤ B/6, L/6 and kern; ULS e ≤ B/3; trapezoidal/triangular formation pressure. | EC7 6.5.4 |
| E5 overall | Bishop simplified circular search, DA1-C2 (M2 on soil, A2 on loads), ≥ 30 slices, convergence 0.001, mα < 0.2 discarded; cases normal, flood, drained drawdown, construction with plant. Pond water carried as slice weight with the hydrostatic thrust at the arc ends. | EC7 Section 11 |
| E6 settlement | Burland & Burbidge (granular), 1D consolidation with 2:1 spread (cohesive), SLS characteristic pressure; differential and tilt. | EC7 6.6 |
| E7 buoyancy | Net permanent V under flood vs dry; flag below 50%. | EC7 2.4.7.4 |
| I1 | ULS Hd ≤ μVd,fav (/1.25 optional) + nib share; SLS friction alone resists the characteristic force; legacy FoS ≥ 1.5. | EC2 6.2.5 |
| I2 | EQU about the front/rear edge of contact; legacy FoS ≥ 1.5. | EN 1990 |
| I3 | Resultant within the contact: kern under **quasi-permanent** loading (characteristic ratio reported), ULS e ≤ b/3; peak stress on the net area (gross − recesses, 72.4%) ≤ 16 N/mm². | EC2 §12 |
| I4 | (a) ballast wall alone; (b) seat course alone under braking with earth on its own height (ballast wall not assisting, channel direction); (c) parts split by continuous joint planes — front part sliding including the rear part's excess thrust; (d) wing returns as gravity sections per metre. | — |
| L1–L4 | Seat compression ≤ fcd,pl; anchor V/N demand, edge distances and lifting-recess clearance from the seat tiling; handling masses and accessory flag; grout limits (110 / 20 mm). | EC2 §12; EN 1992-4 (by others) |
| X1–X6 | Setback and θinf influence line from toe or scour level; scour (FAIL if in flood extent and not assessed); freeboard; regulatory buffer; span feedback against the modular increment; construction information. | CIRIA C742; DMRB CD 356 |

## 8. Judgement calls the checker should review

1. **I3 kern combination.** The brief does not say which SLS combination.
   Checked under quasi-permanent loading (a long-term no-gap criterion); the
   characteristic ratio is printed alongside. With a front-of-shelf bearing,
   the V2 seat/C2 interface is outside the middle third under full
   characteristic traffic plus braking (ratio 1.18).
2. **E5 verdict.** Based on circles through or under the abutment
   footprint. Shallow bank-face slips that do not reach the abutment are
   reported and warned (bank protection/regrading) but not used for the
   verdict.
3. **Approach surcharge** is part of the leading traffic group (same γQ) —
   this is what reproduces the V2 figures.
4. **I4b** loads the seat with braking and the earth on its own height only;
   the ballast wall and its own thrust are the separate I4a body.
5. **Continuous joint planes** are checked in sliding only (part check);
   toppling of parts is not implemented.
6. **Scour in the levels solver** only constrains the formation when the pad
   front lies on the bank slope; the influence-line checks (X1/X2) apply
   everywhere.
7. **Pad overhang along v** is taken as the smaller of the front and rear
   overhangs.
8. **Stale results:** global stability and auto-size are button-run and
   cached against a hash of the inputs; the report marks them stale when
   inputs change.

## 9. Validation

`test.html` (or `node tools/run-tests.mjs`) runs V1–V6 and unit tests:

- **V1** Elite guide example: Ka 0.3333; toppling C1/C2 FoS 1.568 (Elite
  LimitState GEO 1.47 — method difference); sliding C1/C2 1.358 (FAIL
  against 1.5 with friction only); external toppling 2.166; sliding 1.583;
  x_R 0.632, e 0.618, q_max 273.6 kPa.
- **V2** synthetic 4-course bank seat: all bearing, sliding, EQU and
  interface values reproduced (e.g. DA1-C2 sliding 0.992, Rd 2453 kN).
- **V3** Burland & Burbidge; **V4** SPT processing; **V5** ACADS 1(a)
  Bishop 0.99; **V6** block volumes and the LG8 data warning.
- Unit tests: SPT parser, tiling validator, levels solver, axis rotation,
  JSON round trip, situation counts.

## 10. Data flags (Elite — confirm before relying on them)

1. LG8 stated volume 1.105 m³ is inconsistent with its geometry and 2400 kg
   mass; 1.015 m³ is used.
2. LG1–LG3: 2.5 t handling note vs 5.0 t load-class anchor on the drawings.
3. No published interlock shear capacity — nib shear is BB judgement.
4. Elite guide examples use 23 kN/m³; drawings give 2350 kg/m³ (23.05).
