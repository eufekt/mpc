import type { PaletteMode } from "./chopColors";
import { getColorForIndex } from "./chopColors";
import type {
  Chop,
  PadMode,
  SavedSessionMetaV1,
  SessionState,
  SourceType,
  Track,
} from "./types";
import { createTrackId } from "./trackIds";

const META_KEY = "mpc-session";
const DB_NAME = "mpc";
const DB_VERSION = 1;
const AUDIO_STORE = "audio";
const LEGACY_AUDIO_KEY = "session";

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

type RawSessionMeta = Partial<SessionState | SavedSessionMetaV1> & {
  version?: number;
  chops?: Partial<Chop>[];
};

export function normalizeSavedChops(
  chops: Partial<Chop>[],
  paletteMode: PaletteMode,
): Chop[] {
  return chops.map((chop, index) => ({
    id: chop.id ?? `chop-${index}`,
    start: chop.start ?? 0,
    end: chop.end ?? 0,
    key: chop.key ?? null,
    color: chop.color ?? getColorForIndex(paletteMode, index),
    volume: typeof chop.volume === "number" ? chop.volume : 1,
  }));
}

function migrateV1ToV2(v1: SavedSessionMetaV1): SessionState {
  const trackId = createTrackId();
  return {
    version: 2,
    tracks: [
      {
        id: trackId,
        sourceType: v1.sourceType,
        sourceName: v1.sourceName,
        sourceUrl: v1.sourceUrl,
        chops: v1.chops,
      },
    ],
    activeTrackId: trackId,
    paletteMode: v1.paletteMode,
    padMode: v1.padMode,
    volume: v1.volume,
  };
}

function parseV1(parsed: RawSessionMeta): SavedSessionMetaV1 | null {
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
}

function parseV2(parsed: RawSessionMeta): SessionState | null {
  if (parsed.version !== 2) return null;
  if (!Array.isArray(parsed.tracks)) return null;

  const paletteMode = parsed.paletteMode === "acidic" ? "acidic" : "pastel";
  const padMode: PadMode =
    parsed.padMode === "clear" ||
    parsed.padMode === "loop" ||
    parsed.padMode === "layer"
      ? parsed.padMode
      : "layer";

  const tracks: Track[] = parsed.tracks.map((track, index) => ({
    id: track.id ?? `track-${index}`,
    sourceType:
      track.sourceType === "youtube" || track.sourceType === "file"
        ? track.sourceType
        : "file",
    sourceName: track.sourceName ?? "unknown",
    sourceUrl: track.sourceUrl,
    chops: normalizeSavedChops(track.chops ?? [], paletteMode),
  }));

  const activeTrackId =
    typeof parsed.activeTrackId === "string" &&
    tracks.some((t) => t.id === parsed.activeTrackId)
      ? parsed.activeTrackId
      : (tracks[0]?.id ?? null);

  return {
    version: 2,
    tracks,
    activeTrackId,
    paletteMode,
    padMode,
    volume: typeof parsed.volume === "number" ? parsed.volume : 1,
  };
}

/** v1 used a single blob key; v2 stores one blob per track id. */
export function loadSessionState(): SessionState | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RawSessionMeta;

    const v2 = parseV2(parsed);
    if (v2) return v2;

    const v1 = parseV1(parsed);
    if (v1) return migrateV1ToV2(v1);

    return null;
  } catch {
    return null;
  }
}

export function saveSessionState(state: SessionState): void {
  localStorage.setItem(META_KEY, JSON.stringify(state));
}

export async function saveTrackAudio(
  trackId: string,
  blob: Blob,
): Promise<void> {
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
    tx.objectStore(AUDIO_STORE).put(blob, trackId);
  });
}

export async function loadTrackAudio(trackId: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const request = tx.objectStore(AUDIO_STORE).get(trackId);
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

export async function loadLegacyAudioBlob(): Promise<Blob | null> {
  return loadTrackAudio(LEGACY_AUDIO_KEY);
}

export async function migrateLegacyBlobToTrack(
  trackId: string,
): Promise<void> {
  const legacy = await loadLegacyAudioBlob();
  if (!legacy) return;
  await saveTrackAudio(trackId, legacy);
  await deleteTrackAudio(LEGACY_AUDIO_KEY);
}

export async function deleteTrackAudio(trackId: string): Promise<void> {
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
    tx.objectStore(AUDIO_STORE).delete(trackId);
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
      tx.objectStore(AUDIO_STORE).clear();
    });
  } catch {
    // indexedDB may be unavailable
  }
}
