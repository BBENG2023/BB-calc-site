# Source register — BB master calculation sheets

File names, hashes and status only. The sheets themselves are confidential
and live outside this repo (the "Original Calculation" folder); they are
never committed or deployed (see `.gitignore`). Baseline taken 2026-10-15, updated after triage (see `docs/triage-2026-10-15.md`);
"built" entries verified against `js/registry.js`.

Status: `built` | `specified` | `deferred` | `merged-into` | `reference-only` | `rejected` | `encrypted` | `new` | `changed`.

| File | SHA-256 (first 12) | Type | Status | Calc id / issue | Notes |
|---|---|---|---|---|---|
| Bearing.xls | d1ade0a9e173 | .xls, 3 sheets | built | `bearing-capacity` | Rebuilt to EC7 Annex D. |
| Retwall.xls | e7fbd42e7ad4 | .xls, 3 sheets | built | `retaining-wall` | |
| Schmertmann.xls | ff74be2486a6 | .xls, 3 sheets | built | `schmertmann-settlement` | |
| STATE.XLS | 5fa82e4b902e | .xls (legacy format) | built | `phase-relations` | Not readable by the encryption probe (old BIFF format); previously read. |
| Analytc.xlsm | (see local inventory) | .xlsm, 5 sheets, 75,580 bytes | built | `consolidation-1d` | New 2026-10-15; replaces Analytc.xls (removed from folder). Terzaghi closed-form series. |
| Fscons.xls | 195138850465 | .xls, 14 sheets | rejected | — | Large-strain consolidation (tailings). Not BB work. See triage 2026-10-15. |
| Terzcons.xls | 00b494876f0b | .xls, 6 sheets | merged-into | `consolidation-1d` | Finite-difference version; used as cross-check. |
| distrib.xls | 47fcf88eb6be | .xls | encrypted | `boussinesqRect` in `js/geo-core.js` | Deduced from name, not opened. Password needed to confirm. |
| H-piles Capacity via SPT N value.xls | ac97a718718b | .xls | encrypted | `pile-axial-ec7` (SPT method) | Deduced (Meyerhof 1976), not opened. Password needed to confirm. |
| Pile Cap Design(Truss Method).xls | eb15268f300e | .xls | encrypted | `pile-cap-strut-tie` (next pass) | Deferred. Password needed. |
| settle.xls | 64d244039ba4 | .xls | encrypted | — | Content unknown. Password needed. |
| Settlement.xls | 4d1cf5c8748b | .xls | encrypted | — | Content unknown. Password needed. |
| Copy of MASTER - Piling Mat Design to BRE 470 Method - Granular_.xlsx | b514b6d852b7 | .xlsx | encrypted | `piling-mat-bre470` (method from Geotech Bible) | Built without opening this file. Password needed to check against it. |
| Copy of MASTER - Piling Mat Design to BRE 470 Method - Cohesive_.xlsx | eac606704206 | .xlsx | encrypted | `piling-mat-bre470` (method from Geotech Bible) | Now supplied as a separate cohesive file. Password needed. |
| Geotech Bible 1.xlsx | 03ecfe3f60ec | .xlsx, 14 sheets | reference-only | `piling-mat-bre470`, `crane-pad-bre470`, `pile-axial-ec7`, `pile-group-settlement` | EC pile and pile settlement built as corrected calcs. EC pad sheets merged into `bearing-capacity` (errors recorded). |
| MASTER - Haul Road - Ramped HGV Access Design.xlsx | 686a64fc7d5f | .xlsx, 6 sheets | built | `haul-road` | |
| MASTER - BB Advanced wind calculation to BS EN1991-1-4 2005 New.xlsm | 936c208fc9d2 | .xlsm, 17 sheets, 36 MB | built | `wind-pressure-ec1` | Manual Vb,map; postcode lookup deferred (dataset too large to bundle). |
| MASTER - Heras Fencing TWD - Wind Load only.xlsm | 8c726ea4da06 | .xlsm, 17 sheets, 37 MB | built | `heras-fencing` | |
| BB Service Protection MASTER.xlsx | 4a09b2675b2a | .xlsx, 3 sheets | built | `service-protection-slab` | |
| MASTER - Track Mat Analysis .xlsm | 3f6765e1ec5c | .xlsm, 2 sheets | built (merged) | `crane-outrigger-mats` | Mat strengths become user inputs. |
| MASTER - BB Crane Pad - EKKI Mats - Aluminium Track Mats Double Skinnedv2.xlsx | 4a8f63256cad | .xlsx, 2 sheets | built (merged) | `crane-outrigger-mats` | Note `crane-pad-bre470` is the BRE 470 platform split, not this sheet. |
| MASTER - Unified Crane Platform EC7.xlsm | 79a7a6104d8b | .xlsm, 2 sheets | built | `crane-outrigger-mats` | |
| Plate Load Test Brief - STANDARD.docx | 217c03006776 | .docx | built (merged) | `crane-outrigger-mats` (PLT brief) | |
| Elite Legato drawings EPC-LEG-001 to 008, Elite retaining wall guide | — (not in this folder) | reference | built | `legato-abutment` | Held outside the repo; data in `js/shared-data.js` with verify flags. |

GitHub Issues: this repo has no remote, so deferred items are tracked in
`FUTURE.md` and `docs/legato-abutment-deferred.md` until one exists.
