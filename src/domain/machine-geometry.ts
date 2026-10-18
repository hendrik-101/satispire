import { machineGeometrySnapshot } from '../data/machine-geometry.js';

/** Source-local geometry is metadata; schematic coordinates remain logical. */
export function getMachineGeometry(catalogVersion: string, machineId: string) {
  if (
    catalogVersion !== machineGeometrySnapshot.catalogVersion ||
    !Object.hasOwn(machineGeometrySnapshot.machines, machineId)
  )
    return null;
  const geometry =
    machineGeometrySnapshot.machines[
      machineId as keyof typeof machineGeometrySnapshot.machines
    ];
  return structuredClone({
    ...geometry,
    units: machineGeometrySnapshot.units,
    provenance: machineGeometrySnapshot.provenance,
  });
}
