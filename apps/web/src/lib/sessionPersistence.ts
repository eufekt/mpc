import type { PaletteMode } from "./chopColors";
import { assignColorsToChops, getColorForIndex } from "./chopColors";
import type { Chop, PadMode, SavedSessionMeta, SourceType } from "./types";

const META_KEY = "mpc-session";
const DB_NAME = "mpc";
const DB_VERSION = 1;
const AUDIO_STORE = "audio";
const AUDIO_KEY = "session";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(AUDIO_STORE);
    };
  });
}

type RawSessionMeta = Partial<SavedSessionMeta> & {
  version?: number;
  chops?: Partial<Chop>[];
};

export function normalizeSavedChops(
  chops: Partial<Chop>[],
  paletteMode: PaletteMode,
): Chop[] {
  const withColors = chops.map((chop, index) => ({
    id: chop.id ?? `chop-${index}`,
    start: chop.start ?? 0,
    end: chop.end ?? 0,
    key: chop.key ?? null,
    color: chop.color ?? getColorForIndex(paletteMode, index),
  }));
  return assignColorsToChops(withColors, paletteMode);
}

export function loadSessionMeta(): SavedSessionMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RawSessionMeta;
    if (parsed.version !== 1) return null;
    if (!parsed.sourceType || !parsed.sourceName || !Array.isArray(parsed.chops)) {
      return null;
    }

    const paletteMode = parsed.paletteMode === "acidic" ? "acidic" : "pastel";
    const padMode: PadMode =
      parsed.padMode === "clear" ||
      parsed.padMode === "loop" ||
      parsed.padMode === "layer"
        ? parsed.padMode
        : "layer";

    return {
      version: 1,
      sourceType: parsed.sourceType as SourceType,
      sourceName: parsed.sourceName,
      sourceUrl: parsed.sourceUrl,
      paletteMode,
      padMode,
      volume: typeof parsed.volume === "number" ? parsed.volume : 1,
      chops: normalizeSavedChops(parsed.chops, paletteMode),
    };
  } catch {
    return null;
  }
}

export function saveSessionMeta(meta: SavedSessionMeta): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export async function saveAudioBlob(blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.objectStore(AUDIO_STORE).put(blob, AUDIO_KEY);
  });
}

export async function loadAudioBlob(): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const request = tx.objectStore(AUDIO_STORE).get(AUDIO_KEY);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      const result = request.result;
      if (!result) {
        resolve(null);
        return;
      }
      if (result instanceof Blob) {
        resolve(result);
        return;
      }
      resolve(new Blob([result]));
    };
  });
}

export async function clearSession(): Promise<void> {
  localStorage.removeItem(META_KEY);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.objectStore(AUDIO_STORE).delete(AUDIO_KEY);
    });
  } catch {
    // indexedDB may be unavailable
  }
}

export function buildSessionMeta(params: {
  sourceType: SavedSessionMeta["sourceType"];
  sourceName: string;
  sourceUrl?: string;
  chops: Chop[];
  paletteMode: PaletteMode;
  padMode: SavedSessionMeta["padMode"];
  volume: number;
}): SavedSessionMeta {
  return {
    version: 1,
    sourceType: params.sourceType,
    sourceName: params.sourceName,
    sourceUrl: params.sourceUrl,
    chops: params.chops,
    paletteMode: params.paletteMode,
    padMode: params.padMode,
    volume: params.volume,
  };
}
