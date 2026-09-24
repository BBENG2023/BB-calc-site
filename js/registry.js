// registry.js — imports and registers every calculation. To add a new
// calc: copy /calcs/_template.js, fill it in, then add one import + one
// line to the array below (see CONTRIBUTING.md).

import bearingCapacity from '../calcs/bearing-capacity.js';
import retainingWall from '../calcs/retaining-wall.js';
import schmertmannSettlement from '../calcs/schmertmann-settlement.js';
import phaseRelations from '../calcs/phase-relations.js';

export const registry = [
  bearingCapacity,
  retainingWall,
  schmertmannSettlement,
  phaseRelations,
];
