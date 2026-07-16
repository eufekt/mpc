import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import HoverPlugin from "wavesurfer.js/dist/plugins/hover.esm.js";
import ZoomPlugin from "wavesurfer.js/dist/plugins/zoom.esm.js";
import type { Region } from "wavesurfer.js/dist/plugins/regions";
import {
  getColorForIndex,
  regionFillColor,
  type PaletteMode,
} from "../lib/chopColors";
import {
  applyChopStackSlot,
  computeChopStackLayout,
} from "../lib/chopOverlapLayout";
import type { Chop } from "../lib/types";
import { DEFAULT_MASTER_EFFECTS } from "../lib/masterEffects";
import { formatTimePrecise } from "../lib/timeFormat";
import type { Theme } from "../lib/theme";
import { getThemeColors } from "../lib/theme";
import { audioBufferToWav } from "../lib/audioBufferToWav";

const REGION_TIME_START = "region-time-start";
const REGION_TIME_END = "region-time-end";
type PlaybackDirection = "forward" | "reverse";

export type WaveformSnapDivision = 4 | 8 | 16;

/** Source material is treated as 4/4 for waveform bar lines. */
const WAVEFORM_BEATS_PER_BAR = 4;

type BeatGridConfig = {
  sourceBpm: number | undefined;
  beatOffset: number;
  snapEnabled: boolean;
  snapDivision: WaveformSnapDivision;
};

function waveformSnapStep(config: BeatGridConfig): number {
  if (!config.sourceBpm || config.sourceBpm <= 0) return 0;
  return (60 / config.sourceBpm) * (4 / config.snapDivision);
}

/** Snap a waveform time to the source-tempo grid (anchored at beatOffset). */
function snapWaveformTime(
  time: number,
  config: BeatGridConfig,
  duration: number,
): number {
  const step = waveformSnapStep(config);
  if (!config.snapEnabled || step <= 0) return time;
  const snapped =
    config.beatOffset + Math.round((time - config.beatOffset) / step) * step;
  return Math.max(0, Math.min(duration, snapped));
}

/** Snapped region bounds, kept at least one grid step long. */
function snapRegionBounds(
  start: number,
  end: number,
  config: BeatGridConfig,
  duration: number,
): { start: number; end: number } | null {
  const step = waveformSnapStep(config);
  if (!config.snapEnabled || step <= 0) return null;
  let snappedStart = snapWaveformTime(start, config, duration);
  let snappedEnd = snapWaveformTime(end, config, duration);
  if (snappedEnd - snappedStart < step / 2) {
    snappedEnd = Math.min(duration, snappedStart + step);
    if (snappedEnd - snappedStart < step / 2) {
      snappedStart = Math.max(0, snappedEnd - step);
    }
  }
  return { start: snappedStart, end: snappedEnd };
}

function createBeatGridLayer(): HTMLDivElement {
  const layer = document.createElement("div");
  layer.className = "waveform-beat-grid";
  Object.assign(layer.style, {
    position: "absolute",
    top: "0",
    left: "0",
    height: "100%",
    pointerEvents: "none",
    zIndex: "2",
  });
  return layer;
}

function updateBeatGridLayer(
  ws: WaveSurfer,
  layer: HTMLElement,
  config: BeatGridConfig,
): void {
  const duration = ws.getDuration();
  if (!config.sourceBpm || config.sourceBpm <= 0 || duration <= 0) {
    layer.style.display = "none";
    return;
  }

  const wrapper = ws.getWrapper();
  const width = wrapper.scrollWidth || wrapper.clientWidth;
  if (width <= 0) {
    layer.style.display = "none";
    return;
  }

  const pxPerSecond = width / duration;
  const beatPx = (60 / config.sourceBpm) * pxPerSecond;
  const barPx = beatPx * WAVEFORM_BEATS_PER_BAR;
  const divisionPx = beatPx * (4 / config.snapDivision);
  // Each repeating layer wraps at its own period, so the full offset works for all.
  const offsetPx = config.beatOffset * pxPerSecond;

  // Hide the grid when lines get too dense to read.
  if (beatPx < 4) {
    layer.style.display = "none";
    return;
  }

  const layers = [
    `repeating-linear-gradient(to right, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${barPx}px)`,
    `repeating-linear-gradient(to right, var(--border-faint) 0, var(--border-faint) 1px, transparent 1px, transparent ${beatPx}px)`,
  ];
  if (config.snapEnabled && divisionPx >= 4 && divisionPx < beatPx) {
    layers.push(
      `repeating-linear-gradient(to right, var(--border-faint) 0, var(--border-faint) 1px, transparent 1px, transparent ${divisionPx}px)`,
    );
  }

  layer.style.display = "";
  layer.style.width = `${width}px`;
  layer.style.opacity = "0.6";
  layer.style.backgroundImage = layers.join(", ");
  layer.style.backgroundPositionX = `${offsetPx}px`;
}

function regionTimeLabelStyle(): Partial<CSSStyleDeclaration> {
  const { fg, bg } = getThemeColors();
  return {
    flexShrink: "0",
    fontFamily: "inherit",
    fontSize: "10px",
    lineHeight: "1",
    background: bg,
    color: fg,
    border: `1px solid ${fg}`,
    padding: "1px 3px",
  };
}

function createRegionTimeContent(start: number, end: number): HTMLElement {
  const root = document.createElement("div");
  root.className = "region-time-labels";
  Object.assign(root.style, {
    position: "absolute",
    inset: "0",
    display: "flex",
    alignItems: "flex-start",
    pointerEvents: "none",
    zIndex: "3",
  });

  const startEl = document.createElement("span");
  startEl.className = `region-time-label ${REGION_TIME_START}`;
  Object.assign(startEl.style, regionTimeLabelStyle());
  startEl.textContent = formatTimePrecise(start);

  const gapEl = document.createElement("span");
  gapEl.className = "region-time-gap";
  gapEl.setAttribute("aria-hidden", "true");
  Object.assign(gapEl.style, { flex: "1", minWidth: "8px" });

  const endEl = document.createElement("span");
  endEl.className = `region-time-label ${REGION_TIME_END}`;
  Object.assign(endEl.style, regionTimeLabelStyle());
  endEl.textContent = formatTimePrecise(end);

  root.append(startEl, gapEl, endEl);
  return root;
}

function createPlaybackCursor(): HTMLDivElement {
  const line = document.createElement("div");
  const head = document.createElement("span");
  line.className = "playback-cursor";
  head.className = "playback-cursor-head";
  line.setAttribute("part", "playback-cursor");
  Object.assign(line.style, {
    position: "absolute",
    zIndex: "11",
    left: "0",
    top: "0",
    height: "100%",
    pointerEvents: "none",
    // Inline border: WaveSurfer v7 renders inside shadow DOM, so global CSS won't apply.
    borderLeft: "2px solid var(--accent-color, #000)",
    opacity: "0",
  });
  Object.assign(head.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "0",
    height: "0",
    borderTop: "5px solid transparent",
    borderBottom: "5px solid transparent",
    borderLeft: "7px solid var(--accent-color, #000)",
    transform: "translate(1px, -1px)",
  });
  line.append(head);
  return line;
}

function setPlaybackCursorDirection(
  line: HTMLElement,
  direction: PlaybackDirection,
): void {
  const head = line.firstElementChild as HTMLElement | null;
  if (!head) return;

  if (direction === "reverse") {
    head.style.left = "auto";
    head.style.right = "0";
    head.style.borderLeft = "0";
    head.style.borderRight = "7px solid var(--accent-color, #000)";
    head.style.transform = "translate(-1px, -1px)";
    return;
  }

  head.style.left = "0";
  head.style.right = "auto";
  head.style.borderLeft = "7px solid var(--accent-color, #000)";
  head.style.borderRight = "0";
  head.style.transform = "translate(1px, -1px)";
}

function updateRegionTimeLabels(region: Region): void {
  const content = region.getContent(true) as HTMLElement | undefined;
  if (content?.classList.contains("region-time-labels")) {
    const startEl = content.querySelector(`.${REGION_TIME_START}`);
    const endEl = content.querySelector(`.${REGION_TIME_END}`);
    if (startEl) startEl.textContent = formatTimePrecise(region.start);
    if (endEl) endEl.textContent = formatTimePrecise(region.end);
    return;
  }
  region.setContent(createRegionTimeContent(region.start, region.end));
}

type Props = {
  buffer: AudioBuffer;
  chops: Chop[];
  paletteMode: PaletteMode;
  theme: Theme;
  onChopsChange: (chops: Chop[]) => void;
  seekTime: number;
  onSeek: (time: number) => void;
  getPlaybackTime: () => number | null;
  getPlaybackDirection: () => PlaybackDirection | null;
  /** Source tempo — enables the beat grid overlay and snapping. */
  sourceBpm?: number;
  /** Seconds from buffer start to the first beat. */
  beatOffset?: number;
  snapEnabled?: boolean;
  snapDivision?: WaveformSnapDivision;
};

function positionPlaybackLine(
  ws: WaveSurfer,
  line: HTMLElement,
  time: number,
  direction: PlaybackDirection,
): void {
  const duration = ws.getDuration();
  if (duration <= 0) return;
  const wrapper = ws.getWrapper();
  const width = wrapper.scrollWidth || wrapper.clientWidth;
  if (width <= 0) return;
  const x = Math.min(width - 1, (time / duration) * width);
  setPlaybackCursorDirection(line, direction);
  line.style.transform = `translateX(${x}px)`;
  line.style.opacity = "1";
}

function hidePlaybackLine(line: HTMLElement): void {
  line.style.opacity = "0";
  line.style.transform = "";
}

function chopsWithLiveRegionBounds(
  chops: Chop[],
  regions: Region[],
): Pick<Chop, "id" | "start" | "end">[] {
  const regionById = new Map(regions.map((region) => [region.id, region]));
  return chops.map((chop) => {
    const region = regionById.get(chop.id);
    return region
      ? { id: chop.id, start: region.start, end: region.end }
      : { id: chop.id, start: chop.start, end: chop.end };
  });
}

function applyChopStackLayout(
  chops: Chop[],
  regions: Region[],
): void {
  const chopIds = new Set(chops.map((chop) => chop.id));
  const intervals = chopsWithLiveRegionBounds(chops, regions);
  for (const region of regions) {
    if (!chopIds.has(region.id)) {
      intervals.push({
        id: region.id,
        start: region.start,
        end: region.end,
      });
    }
  }

  const layout = computeChopStackLayout(intervals);
  for (const region of regions) {
    const slot = layout.get(region.id);
    if (slot && region.element) {
      applyChopStackSlot(region.element, slot);
    }
  }
}

/** Pixels/sec when the waveform fits the container — also the minimum zoom level. */
function fitPxPerSec(containerWidth: number, duration: number): number {
  if (containerWidth <= 0 || duration <= 0) return 0;
  return containerWidth / duration;
}

/**
 * ZoomPlugin uses maxZoom as the exponential zoom ceiling. It must be >= the
 * fit-to-width level or short clips invert zoom direction and snap min/max.
 */
function waveformMaxZoom(
  containerWidth: number,
  duration: number,
  sampleRate: number,
): number {
  const fit = fitPxPerSec(containerWidth, duration);
  return Math.max(fit, sampleRate);
}

function syncZoomPluginBounds(
  zoom: InstanceType<typeof ZoomPlugin>,
  maxZoom: number,
): void {
  const plugin = zoom as unknown as {
    options: { maxZoom: number };
    endZoom: number;
    startZoom: number;
  };
  plugin.options.maxZoom = maxZoom;
  plugin.endZoom = maxZoom;
  plugin.startZoom = 0;
}

export function WaveformEditor({
  buffer,
  chops,
  paletteMode,
  theme,
  onChopsChange,
  seekTime,
  onSeek,
  getPlaybackTime,
  getPlaybackDirection,
  sourceBpm,
  beatOffset = 0,
  snapEnabled = false,
  snapDivision = 16,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const playbackLineRef = useRef<HTMLDivElement | null>(null);
  const beatGridLayerRef = useRef<HTMLDivElement | null>(null);
  const getPlaybackTimeRef = useRef(getPlaybackTime);
  const getPlaybackDirectionRef = useRef(getPlaybackDirection);
  const seekTimeRef = useRef(seekTime);
  const onSeekRef = useRef(onSeek);
  const onChopsChangeRef = useRef(onChopsChange);
  const chopsRef = useRef(chops);
  const paletteModeRef = useRef(paletteMode);
  const beatGridRef = useRef<BeatGridConfig>({
    sourceBpm,
    beatOffset,
    snapEnabled,
    snapDivision,
  });
  // Prevents region-created handler from echoing back into React state during sync.
  const syncingRef = useRef(false);
  getPlaybackTimeRef.current = getPlaybackTime;
  getPlaybackDirectionRef.current = getPlaybackDirection;
  seekTimeRef.current = seekTime;
  onSeekRef.current = onSeek;
  onChopsChangeRef.current = onChopsChange;
  chopsRef.current = chops;
  paletteModeRef.current = paletteMode;
  beatGridRef.current = { sourceBpm, beatOffset, snapEnabled, snapDivision };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const initialMaxZoom = waveformMaxZoom(
      container.clientWidth,
      buffer.duration,
      buffer.sampleRate,
    );

    const zoom = ZoomPlugin.create({
      maxZoom: initialMaxZoom,
      exponentialZooming: true,
      iterations: 30,
      deltaThreshold: 0,
    });

    const { fg, bg } = getThemeColors();

    const hover = HoverPlugin.create({
      lineColor: fg,
      lineWidth: 1,
      labelColor: fg,
      labelBackground: bg,
      labelSize: 8,
      formatTimeCallback: formatTimePrecise,
    });

    const ws = WaveSurfer.create({
      container,
      waveColor: fg,
      progressColor: fg,
      cursorColor: fg,
      height: 120,
      normalize: true,
      plugins: [regions, zoom, hover],
    });

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
    };
    container.addEventListener("wheel", onWheel, { passive: false });

    wavesurferRef.current = ws;

    const playbackLine = createPlaybackCursor();
    playbackLineRef.current = playbackLine;

    const beatGridLayer = createBeatGridLayer();
    beatGridLayerRef.current = beatGridLayer;

    const onInteraction = (time: number) => {
      onSeekRef.current(time);
      const duration = ws.getDuration();
      if (duration > 0) {
        ws.seekTo(time / duration);
      }
    };

    const unsubInteraction = ws.on("interaction", onInteraction);

    let raf = 0;
    const playbackLoop = () => {
      const playingTime = getPlaybackTimeRef.current();
      const time = playingTime ?? seekTimeRef.current;
      if (time !== null && ws.getDuration() > 0) {
        const direction = getPlaybackDirectionRef.current() ?? "forward";
        positionPlaybackLine(ws, playbackLine, time, direction);
      } else {
        hidePlaybackLine(playbackLine);
      }
      raf = requestAnimationFrame(playbackLoop);
    };

    regions.enableDragSelection({
      color: regionFillColor(
        getColorForIndex(paletteModeRef.current, chopsRef.current.length),
      ),
    });

    // Snap region edges to the source-tempo grid; write back so visuals match.
    const applyRegionSnap = (region: Region): { start: number; end: number } => {
      const snapped = snapRegionBounds(
        region.start,
        region.end,
        beatGridRef.current,
        ws.getDuration(),
      );
      if (!snapped) return { start: region.start, end: region.end };
      if (
        Math.abs(snapped.start - region.start) > 1e-6 ||
        Math.abs(snapped.end - region.end) > 1e-6
      ) {
        const wasSyncing = syncingRef.current;
        syncingRef.current = true;
        try {
          region.setOptions({ start: snapped.start, end: snapped.end });
        } finally {
          syncingRef.current = wasSyncing;
        }
        updateRegionTimeLabels(region);
      }
      return snapped;
    };

    const onRegionCreated = (region: Region) => {
      updateRegionTimeLabels(region);
      applyChopStackLayout(chopsRef.current, regions.getRegions());
      if (syncingRef.current) return;
      const { start, end } = applyRegionSnap(region);
      const color = getColorForIndex(
        paletteModeRef.current,
        chopsRef.current.length,
      );
      region.setOptions({ color: regionFillColor(color) });
      onChopsChangeRef.current([
        ...chopsRef.current,
        {
          id: region.id,
          start,
          end,
          key: null,
          color,
          volume: 1,
          timeStretch: 1,
          reverse: false,
          effects: DEFAULT_MASTER_EFFECTS,
        },
      ]);
    };

    const onRegionUpdate = (region: Region) => {
      updateRegionTimeLabels(region);
      applyChopStackLayout(chopsRef.current, regions.getRegions());
    };

    const onRegionUpdated = (region: Region) => {
      updateRegionTimeLabels(region);
      applyChopStackLayout(chopsRef.current, regions.getRegions());
      if (syncingRef.current) return;
      const { start, end } = applyRegionSnap(region);
      onChopsChangeRef.current(
        chopsRef.current.map((c) =>
          c.id === region.id ? { ...c, start, end } : c,
        ),
      );
    };

    regions.on("region-created", onRegionCreated);
    regions.on("region-update", onRegionUpdate);
    regions.on("region-updated", onRegionUpdated);

    const blob = audioBufferToWav(buffer);
    const url = URL.createObjectURL(blob);
    ws.load(url);

    const onReady = () => {
      const maxZoom = waveformMaxZoom(
        container.clientWidth,
        ws.getDuration(),
        buffer.sampleRate,
      );
      syncZoomPluginBounds(zoom, maxZoom);

      ws.getWrapper().appendChild(beatGridLayer);
      ws.getWrapper().appendChild(playbackLine);
      updateBeatGridLayer(ws, beatGridLayer, beatGridRef.current);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(playbackLoop);
    };
    if (ws.getDuration() > 0) {
      onReady();
    } else {
      ws.once("ready", onReady);
    }

    const onLayoutChange = () => {
      updateBeatGridLayer(ws, beatGridLayer, beatGridRef.current);
      const time = getPlaybackTimeRef.current() ?? seekTimeRef.current;
      if (time !== null && ws.getDuration() > 0) {
        const direction = getPlaybackDirectionRef.current() ?? "forward";
        positionPlaybackLine(ws, playbackLine, time, direction);
      }
    };

    const unsubZoom = ws.on("zoom", onLayoutChange);
    const unsubScroll = ws.on("scroll", onLayoutChange);
    const unsubResize = ws.on("resize", onLayoutChange);

    return () => {
      cancelAnimationFrame(raf);
      unsubInteraction();
      unsubZoom();
      unsubScroll();
      unsubResize();
      container.removeEventListener("wheel", onWheel);
      regions.un("region-created", onRegionCreated);
      regions.un("region-update", onRegionUpdate);
      regions.un("region-updated", onRegionUpdated);
      playbackLine.remove();
      playbackLineRef.current = null;
      beatGridLayer.remove();
      beatGridLayerRef.current = null;
      URL.revokeObjectURL(url);
      ws.destroy();
      wavesurferRef.current = null;
      regionsRef.current = null;
    };
  }, [buffer, theme]);

  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions) return;
    regions.enableDragSelection({
      color: regionFillColor(getColorForIndex(paletteMode, chops.length)),
    });
  }, [paletteMode, chops.length]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    const layer = beatGridLayerRef.current;
    if (!ws || !layer) return;
    const config: BeatGridConfig = {
      sourceBpm,
      beatOffset,
      snapEnabled,
      snapDivision,
    };
    if (ws.getDuration() > 0) {
      updateBeatGridLayer(ws, layer, config);
    }
  }, [sourceBpm, beatOffset, snapEnabled, snapDivision]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    const regions = regionsRef.current;
    if (!ws || !regions) return;

    let cancelled = false;
    let unsubReady: (() => void) | undefined;

    const syncRegions = () => {
      if (cancelled) return;
      const regionsPlugin = regionsRef.current;
      if (!regionsPlugin) return;

      syncingRef.current = true;
      try {
        const regionMap = new Map(
          regionsPlugin.getRegions().map((r) => [r.id, r]),
        );
        const chopIds = new Set(chops.map((c) => c.id));

        for (const region of regionsPlugin.getRegions()) {
          if (!chopIds.has(region.id)) {
            region.remove();
          }
        }

        for (const chop of chops) {
          const fill = regionFillColor(chop.color);
          const existing = regionMap.get(chop.id);
          if (existing) {
            existing.setOptions({
              start: chop.start,
              end: chop.end,
              color: fill,
            });
            updateRegionTimeLabels(existing);
          } else {
            regionsPlugin.addRegion({
              id: chop.id,
              start: chop.start,
              end: chop.end,
              color: fill,
              drag: true,
              resize: true,
              content: createRegionTimeContent(chop.start, chop.end),
            });
          }
        }

        applyChopStackLayout(chops, regionsPlugin.getRegions());
      } finally {
        syncingRef.current = false;
      }
    };

    // Regions clamp start/end to [0, duration]; before "ready" duration is 0.
    if (ws.getDuration() > 0) {
      syncRegions();
    } else {
      unsubReady = ws.once("ready", syncRegions);
    }

    return () => {
      cancelled = true;
      unsubReady?.();
    };
  }, [chops]);

  return <div ref={containerRef} className="waveform" />;
}
