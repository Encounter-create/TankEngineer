// Shared offscreen canvas for lens/holo/rewind pixel effects (1/3 resolution)
import { MAP_W, MAP_H } from '../utils/Grid';

export const LENS_W = Math.floor(MAP_W / 3);
export const LENS_H = Math.floor(MAP_H / 3);

export const lensCanvas = document.createElement('canvas');
lensCanvas.width = LENS_W;
lensCanvas.height = LENS_H;
export const lensCtx = lensCanvas.getContext('2d')!;
