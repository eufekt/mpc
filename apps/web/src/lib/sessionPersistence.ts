import type { PaletteMode } from "./chopColors";
import { clearMidiBindings } from "./midiMappings";
import { getColorForIndex } from "./chopColors";
import { normalizeTimeStretch } from "./chopPlayback";
import {
  loadProjectsIndex,
  sessionMetaKey,
} from "./projectPersistence";
import type {
  ArrangementClip,
  ArrangementLane,
  ArrangementLoopRegion,
  Chop,
  PadMode,
  SavedSessionMetaV1,
  SavedSessionMetaV2,
  SessionState,
  SourceType,
  Track,
} from "./types";
import { createTrackId } from "./trackIds";
import { deriveDefaultTrackName } from "./trackNames";
import { DEFAULT_ACCENT_COLOR } from "./transport";
import {
  DEFAULT_MASTER_EFFECTS,
  normalizeMasterEffects,
  type MasterEffects,
} from "./masterEffects";
import {
  clampLaneRowHeight,
  computeArrangementDuration,
  DEFAULT_LANE_ROW_HEIGHT,
  normalizeLoopRegion,
} from "./arrangement";
import { defaultMusicalTime, normalizeMusicalTime } from "./musicalTime";

const DB_NAME = "mpc";
const DB_VERSION = 1;
const AUDIO_STORE = "audio";
const LEGACY_AUDIO_KEY = "session";
const LEGACY_META_KEY = "mpc-session";

function audioKey(projectId: string, trackId: string): string {
  return `${projectId}/${trackId}`;
}

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

type RawSessionMeta = Partial<SessionState | SavedSessionMetaV1 | SavedSessionMetaV2> & {
  version?: number;
  chops?: Partial<Chop>[];
  tracks?: Partial<Track>[];
  arrangement?: {
    lanes?: Partial<ArrangementLane>[];
    laneRowHeight?: number;
    loopRegion?: Partial<ArrangementLoopRegion>;
    musicalTime?: Partial<SessionState["arrangement"]["musicalTime"]>;
  };
  activeTrackId?: string | null;
  accentColor?: string;
  masterEffects?: Partial<MasterEffects>;
};

function demigratePadKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const lower = key.toLowerCase();
  const match = lower.match(/^([a-h])(0[1-9]|1[0-6])$/);
  if (!match) return lower;
  const bankIndex = match[1].charCodeAt(0) - "a".charCodeAt(0);
  const padIndex = Number(match[2]);
  const offset = bankIndex * 16 + padIndex - 1;
  if (offset >= 0 && offset < 26) {
    return String.fromCharCode("a".charCodeAt(0) + offset);
  }
  return lower;
}

function normalizeSavedChops(
  chops: Partial<Chop>[],
  paletteMode: PaletteMode,
): Chop[] {
  return chops.map((chop, index) => {
    const name =
      typeof chop.name === "string" && chop.name.trim()
        ? chop.name.trim()
        : undefined;
    return {
      id: chop.id ?? `chop-${index}`,
      start: chop.start ?? 0,
      end: chop.end ?? 0,
      key: demigratePadKey(chop.key ?? null),
      ...(name ? { name } : {}),
      color: chop.color ?? getColorForIndex(paletteMode, index),
      volume: typeof chop.volume === "number" ? chop.volume : 1,
      timeStretch:
        typeof chop.timeStretch === "number"
          ? normalizeTimeStretch(chop.timeStretch)
          : 1,
      reverse: chop.reverse === true,
    };
  });
}

function emptyArrangement(): SessionState["arrangement"] {
  return {
    lanes: [],
    laneRowHeight: DEFAULT_LANE_ROW_HEIGHT,
    musicalTime: defaultMusicalTime(),
  };
}

function migrateV2ToV3(v2: SavedSessionMetaV2): SessionState {
  return {
    ...v2,
    version: 3,
    arrangement: emptyArrangement(),
    accentColor: DEFAULT_ACCENT_COLOR,
    masterEffects: DEFAULT_MASTER_EFFECTS,
  };
}

function migrateV1ToV2(v1: SavedSessionMetaV1): SavedSessionMetaV2 {
  const trackId = createTrackId();
  return {
    version: 2,
    tracks: [
      {
        id: trackId,
        name: deriveDefaultTrackName(
          {
            sourceType: v1.sourceType,
            sourceName: v1.sourceName,
            name: "",
          },
          0,
        ),
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

function normalizeLoopRegionField(
  loopRegion: Partial<ArrangementLoopRegion> | undefined,
  arrangementDuration: number,
): ArrangementLoopRegion | undefined {
  if (
    !loopRegion ||
    typeof loopRegion.start !== "number" ||
    typeof loopRegion.end !== "number"
  ) {
    return undefined;
  }
  return normalizeLoopRegion(
    { start: loopRegion.start, end: loopRegion.end },
    arrangementDuration,
  );
}

function normalizeArrangementClip(
  clip: Partial<ArrangementClip>,
  index: number,
): ArrangementClip | null {
  if (!clip.sourceTrackId || !clip.chopId) return null;
  return {
    id: clip.id ?? `clip-${index}`,
    sourceTrackId: clip.sourceTrackId,
    chopId: clip.chopId,
    startTime: typeof clip.startTime === "number" ? clip.startTime : 0,
    stackMode: clip.stackMode === "clamp" ? "clamp" : "overflow",
  };
}

function normalizeArrangementLanes(
  lanes: Partial<ArrangementLane>[] | undefined,
): ArrangementLane[] {
  if (!Array.isArray(lanes)) return [];
  return lanes.map((lane, laneIndex) => ({
    id: lane.id ?? `lane-${laneIndex}`,
    name: lane.name ?? `Lane ${laneIndex + 1}`,
    mute: lane.mute === true,
    volume: typeof lane.volume === "number" ? lane.volume : 1,
    mode: lane.mode === "free" ? "free" : "clamped",
    clips: (lane.clips ?? [])
      .map((clip, clipIndex) => normalizeArrangementClip(clip, clipIndex))
      .filter((clip): clip is ArrangementClip => clip !== null),
  }));
}

function parseCommonSessionFields(parsed: RawSessionMeta): {
  paletteMode: PaletteMode;
  padMode: PadMode;
  volume: number;
  accentColor: string;
} {
  const paletteMode: PaletteMode =
    parsed.paletteMode === "acidic" ? "acidic" : "pastel";
  const padMode: PadMode =
    parsed.padMode === "clear" ||
    parsed.padMode === "loop" ||
    parsed.padMode === "layer"
      ? parsed.padMode
      : "layer";
  const volume = typeof parsed.volume === "number" ? parsed.volume : 1;
  const accentColor =
    typeof parsed.accentColor === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(parsed.accentColor)
      ? parsed.accentColor
      : DEFAULT_ACCENT_COLOR;
  return { paletteMode, padMode, volume, accentColor };
}

function resolveActiveTrackId(
  parsed: RawSessionMeta,
  tracks: Track[],
): string | null {
  return typeof parsed.activeTrackId === "string" &&
    tracks.some((t) => t.id === parsed.activeTrackId)
    ? parsed.activeTrackId
    : (tracks[0]?.id ?? null);
}

function parseV1(parsed: RawSessionMeta): SavedSessionMetaV1 | null {
  if (parsed.version !== 1) return null;
  if (!parsed.sourceType || !parsed.sourceName || !Array.isArray(parsed.chops)) {
    return null;
  }

  const { paletteMode, padMode, volume } = parseCommonSessionFields(parsed);

  return {
    version: 1,
    sourceType: parsed.sourceType as SourceType,
    sourceName: parsed.sourceName,
    sourceUrl: parsed.sourceUrl,
    paletteMode,
    padMode,
    volume,
    chops: normalizeSavedChops(parsed.chops, paletteMode),
  };
}

function parseTracks(
  parsed: RawSessionMeta,
  paletteMode: PaletteMode,
): Track[] | null {
  if (!Array.isArray(parsed.tracks)) return null;
  return parsed.tracks.map((track, index) => ({
    id: track.id ?? `track-${index}`,
    name: deriveDefaultTrackName(
      {
        sourceType:
          track.sourceType === "youtube" || track.sourceType === "file"
            ? track.sourceType
            : "file",
        sourceName: track.sourceName ?? "unknown",
        name: track.name ?? "",
      },
      index,
    ),
    sourceType:
      track.sourceType === "youtube" || track.sourceType === "file"
        ? track.sourceType
        : "file",
    sourceName: track.sourceName ?? "unknown",
    sourceUrl: track.sourceUrl,
    chops: normalizeSavedChops(track.chops ?? [], paletteMode),
  }));
}

function parseV2(parsed: RawSessionMeta): SavedSessionMetaV2 | null {
  if (parsed.version !== 2) return null;

  const { paletteMode, padMode, volume } = parseCommonSessionFields(parsed);

  const tracks = parseTracks(parsed, paletteMode);
  if (!tracks) return null;

  return {
    version: 2,
    tracks,
    activeTrackId: resolveActiveTrackId(parsed, tracks),
    paletteMode,
    padMode,
    volume,
  };
}

function parseV3(parsed: RawSessionMeta): SessionState | null {
  if (parsed.version !== 3) return null;

  const { paletteMode, padMode, volume, accentColor } =
    parseCommonSessionFields(parsed);

  const tracks = parseTracks(parsed, paletteMode);
  if (!tracks) return null;

  const lanes = normalizeArrangementLanes(parsed.arrangement?.lanes);
  const arrangementDuration = computeArrangementDuration(lanes, tracks);

  return {
    version: 3,
    tracks,
    arrangement: {
      lanes,
      laneRowHeight: clampLaneRowHeight(
        typeof parsed.arrangement?.laneRowHeight === "number"
          ? parsed.arrangement.laneRowHeight
          : DEFAULT_LANE_ROW_HEIGHT,
      ),
      loopRegion: normalizeLoopRegionField(
        parsed.arrangement?.loopRegion,
        arrangementDuration,
      ),
      musicalTime: normalizeMusicalTime(parsed.arrangement?.musicalTime),
    },
    activeTrackId: resolveActiveTrackId(parsed, tracks),
    paletteMode,
    padMode,
    volume,
    accentColor,
    masterEffects: normalizeMasterEffects(parsed.masterEffects),
  };
}

function parseSessionMeta(raw: string): SessionState | null {
  try {
    const parsed = JSON.parse(raw) as RawSessionMeta;

    const v3 = parseV3(parsed);
    if (v3) return v3;

    const v2 = parseV2(parsed);
    if (v2) return migrateV2ToV3(v2);

    const v1 = parseV1(parsed);
    if (v1) return migrateV2ToV3(migrateV1ToV2(v1));

    return null;
  } catch {
    return null;
  }
}

/** v1 used a single blob key; v2 stores one blob per track id. */
export function loadSessionState(projectId: string): SessionState | null {
  try {
    const raw = localStorage.getItem(sessionMetaKey(projectId));
    if (!raw) return null;
    return parseSessionMeta(raw);
  } catch {
    return null;
  }
}

export function saveSessionState(
  projectId: string,
  state: SessionState,
): void {
  localStorage.setItem(sessionMetaKey(projectId), JSON.stringify(state));
}

export async function saveTrackAudio(
  projectId: string,
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
    tx.objectStore(AUDIO_STORE).put(blob, audioKey(projectId, trackId));
  });
}

export async function loadTrackBlob(
  projectId: string,
  trackId: string,
): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const request = tx.objectStore(AUDIO_STORE).get(audioKey(projectId, trackId));
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
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const request = tx.objectStore(AUDIO_STORE).get(LEGACY_AUDIO_KEY);
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

export async function loadLegacyTrackBlob(trackId: string): Promise<Blob | null> {
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

export async function migrateLegacyBlobToTrack(
  projectId: string,
  trackId: string,
): Promise<void> {
  const legacy = await loadLegacyAudioBlob();
  if (!legacy) return;
  await saveTrackAudio(projectId, trackId, legacy);
  await deleteAudioKey(LEGACY_AUDIO_KEY);
}

export async function migrateLegacyTrackBlob(
  projectId: string,
  trackId: string,
): Promise<void> {
  const legacy = await loadLegacyTrackBlob(trackId);
  if (!legacy) return;
  await saveTrackAudio(projectId, trackId, legacy);
  await deleteAudioKey(trackId);
}

/** Moves legacy per-track audio blobs into the project namespace. */
export async function migrateLegacyAudioForProject(
  projectId: string,
  trackIds: string[],
): Promise<void> {
  const legacySessionBlob = await loadLegacyAudioBlob();
  if (legacySessionBlob && trackIds[0]) {
    await saveTrackAudio(projectId, trackIds[0], legacySessionBlob);
    await deleteAudioKey(LEGACY_AUDIO_KEY);
  }

  for (const trackId of trackIds) {
    const blob = await loadLegacyTrackBlob(trackId);
    if (!blob) continue;
    await saveTrackAudio(projectId, trackId, blob);
    await deleteAudioKey(trackId);
  }
}

async function deleteAudioKey(key: string): Promise<void> {
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
    tx.objectStore(AUDIO_STORE).delete(key);
  });
}

export async function deleteTrackAudio(
  projectId: string,
  trackId: string,
): Promise<void> {
  await deleteAudioKey(audioKey(projectId, trackId));
}

export async function deleteProjectAudio(projectId: string): Promise<void> {
  const prefix = `${projectId}/`;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readwrite");
    const store = tx.objectStore(AUDIO_STORE);
    const request = store.openCursor();
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const key = String(cursor.key);
      if (key.startsWith(prefix)) {
        cursor.delete();
      }
      cursor.continue();
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function clearProject(projectId: string): Promise<void> {
  localStorage.removeItem(sessionMetaKey(projectId));
  clearMidiBindings(projectId);
  try {
    await deleteProjectAudio(projectId);
  } catch {
    // indexedDB may be unavailable
  }
}

export async function deleteProjectStorage(projectId: string): Promise<void> {
  await clearProject(projectId);
}

export async function clearAllPersistedData(): Promise<void> {
  const index = loadProjectsIndex();
  for (const project of index.projects) {
    localStorage.removeItem(sessionMetaKey(project.id));
    clearMidiBindings(project.id);
  }
  localStorage.removeItem("mpc-projects");
  localStorage.removeItem(LEGACY_META_KEY);
  localStorage.removeItem("mpc-midi-bindings");

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
