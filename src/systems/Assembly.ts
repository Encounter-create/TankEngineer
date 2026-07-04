import { Part, PartType, TankConfig, assembleTank, DEFAULT_COMMANDER } from '../entities/Parts';
import { Inventory } from './Inventory';

/** Validate that a tank build is legal */
export interface AssemblyResult {
  valid: boolean;
  config: TankConfig | null;
  errors: string[];
}

export function tryAssemble(
  barrelId: string,
  turretId: string,
  chassisId: string,
  inventory: Inventory,
): AssemblyResult {
  const errors: string[] = [];

  const barrel = validatePart(barrelId, 'barrel', inventory, errors);
  const turret = validatePart(turretId, 'turret', inventory, errors);
  const chassis = validatePart(chassisId, 'chassis', inventory, errors);

  if (errors.length > 0) {
    return { valid: false, config: null, errors };
  }

  const config = assembleTank(barrel!, turret!, chassis!, DEFAULT_COMMANDER);
  return { valid: true, config, errors: [] };
}

function validatePart(
  partId: string,
  type: PartType,
  inventory: Inventory,
  errors: string[],
): Part | null {
  if (!partId) {
    errors.push(`未选择${typeLabel(type)}`);
    return null;
  }

  const part = Inventory.getPart(partId);
  if (!part) {
    errors.push(`零件 "${partId}" 不存在`);
    return null;
  }

  if (part.type !== type) {
    errors.push(`"${part.name}" 不是${typeLabel(type)}`);
    return null;
  }

  if (!inventory.owns(partId)) {
    errors.push(`你还没有解锁 "${part.name}"`);
    return null;
  }

  return part;
}

function typeLabel(type: PartType): string {
  switch (type) {
    case 'barrel': return '炮管';
    case 'turret': return '炮塔';
    case 'chassis': return '车身';
    case 'commander': return '车长';
  }
}
