# Spec — `consolidation-1d`

Sources: Analytc.xlsm (closed-form series), Terzcons.xls (finite difference).
Both are generic textbook templates. No project data.

## Purpose
Rate of primary consolidation of one clay layer under a load applied at once.
Gives degree of consolidation, pore pressure isochrones, settlement against
time, and the time to reach a target degree of consolidation.

## Method
- Terzaghi 1D theory. Uniform cv, small strain, instant load.
- Tv = cv·t / Hdr². Hdr = H/2 (double drained) or H (single drained).
- Excess pore pressure: u(z,t) = Σ (2u0/M)·sin(Mz/Hdr)·e^(−M²Tv), M = π(2m+1)/2.
- Non-uniform initial pore pressure (triangular profiles) by numerical
  Fourier coefficients: Am = (1/Hdr)∫u0(z)sin(Mz/Hdr)dz over the full layer.
- U(t) = 1 − ∫u dz / ∫u0 dz.
- cv entered directly (m²/yr) or derived: cv = k / (mv·γw).
- Final settlement ρ∞ = mv·Δσ′·H (oedometer), or user value. ρ(t) = U(t)·ρ∞.
- Time for target U by bisection on Tv.

## Inputs
H (m), drainage (double / single, top drained), initial pore pressure profile
(uniform / increasing with depth / decreasing with depth), Δσ (kPa), cv source
(direct / from k and mv), cv (m²/yr), k (m/s), mv (m²/MN), time t (years),
target U (%), optional ρ∞ override (mm).

## Outputs
Tv, U(t), ρ(t), ρ∞, t50, t90, t at target U, isochrone table (11 depths),
U–log t curve, isochrone plot.

## Fixes against source
- Analytc: XLM user function blocked → reimplemented in JS. Unit error in Q44
  (divides by 30) not ported. av = 3 /kPa example value not used.

## Validation
- S1 (Analytc example, textbook values): H 9.5 m double drained, cv 8.0×10⁻⁸ m²/s,
  t 5 yr, u0 100 kPa → Tv 0.5595, U 0.796, u at mid-layer 31.9 kPa, u at
  2.5 m from top 23.6 kPa, u at 0.5 m 5.27 kPa. Tolerance ±1%.
- S2: Tv(U 50%) = 0.197, Tv(U 90%) = 0.848 (closed form). Terzcons case
  (H 12 m, cv 6.63×10⁻⁶ m²/s, t 6.41×10⁶ s) → Tv 1.18, U 0.956.
