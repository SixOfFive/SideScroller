export const PORT = Number(process.env.PORT) || 3000;
export const SAVE_INTERVAL_MS = 60000;
export const WORLD_SEED = 20260713;
// SS_DATA lets a test instance point at its own save dir (relative, ends in /).
const DATA = process.env.SS_DATA || '../data/';
export const DATA_DIR = new URL(DATA, import.meta.url);
export const SAVE_PATH = new URL('save.json', DATA_DIR);
export const SAVE_TMP_PATH = new URL('save.json.tmp', DATA_DIR);
export const MAX_PROFILES = 100;
