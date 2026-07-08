// EffectRenderer — unified skill visual effect dispatcher
// Each skill file self-registers its draw function at module load time.
// main.ts calls renderAllEffects() once per frame, after game render.

type SkillDrawFn = (ctx: CanvasRenderingContext2D, state: any) => void;

const registry = new Map<string, SkillDrawFn>();

/** Register a skill's draw function. Called at module load time. */
export function registerEffect(id: string, fn: SkillDrawFn): void {
  registry.set(id, fn);
}

/** Render all registered skill effects for the given state. */
export function renderAllEffects(ctx: CanvasRenderingContext2D, state: any): void {
  for (const fn of registry.values()) {
    fn(ctx, state);
  }
}
