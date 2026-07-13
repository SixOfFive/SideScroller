export const PORT = Number(process.env.PORT) || 3000;
export const SAVE_INTERVAL_MS = 60000;
export const WORLD_SEED = 20260713;
export const DATA_DIR = new URL('../data/', import.meta.url);
export const SAVE_PATH = new URL('../data/save.json', import.meta.url);
