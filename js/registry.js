// registry.js — imports and registers every calculation. To add a new
// calc: copy /calcs/_template.js, fill it in, then add one import + one
// line to the array below (see CONTRIBUTING.md).

import bearingCapacity from '../calcs/bearing-capacity.js';
import retainingWall from '../calcs/retaining-wall.js';
import schmertmannSettlement from '../calcs/schmertmann-settlement.js';
import phaseRelations from '../calcs/phase-relations.js';
import haulRoad from '../calcs/haul-road.js';
import pilingMatBre470 from '../calcs/piling-mat-bre470.js';
import windPressureEc1 from '../calcs/wind-pressure-ec1.js';
import herasFencing from '../calcs/heras-fencing.js';
import serviceProtectionSlab from '../calcs/service-protection-slab.js';

export const registry = [
  bearingCapacity,
  retainingWall,
  schmertmannSettlement,
  phaseRelations,
  haulRoad,
  pilingMatBre470,
  windPressureEc1,
  herasFencing,
  serviceProtectionSlab,
];
