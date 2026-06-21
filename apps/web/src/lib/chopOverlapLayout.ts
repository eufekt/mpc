export type ChopInterval = {
  id: string;
  start: number;
  end: number;
};

export type ChopStackSlot = {
  lane: number;
  laneCount: number;
};

/** True when two chops share any time (exclusive endpoints do not overlap). */
export function chopsOverlap(a: ChopInterval, b: ChopInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

function maxConcurrent(chops: ChopInterval[]): number {
  const events: { time: number; delta: number }[] = [];
  for (const chop of chops) {
    events.push({ time: chop.start, delta: 1 });
    events.push({ time: chop.end, delta: -1 });
  }
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);

  let current = 0;
  let max = 0;
  for (const event of events) {
    current += event.delta;
    max = Math.max(max, current);
  }
  return max;
}

/** Greedy lane assignment — overlapping chops never share a lane. */
function assignLanes(chops: ChopInterval[]): Map<string, number> {
  const sorted = [...chops].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();

  for (const chop of sorted) {
    let lane = laneEnds.findIndex((end) => end <= chop.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(chop.end);
    } else {
      laneEnds[lane] = chop.end;
    }
    lanes.set(chop.id, lane);
  }

  return lanes;
}

function overlapClusters(chops: ChopInterval[]): ChopInterval[][] {
  const clusters: ChopInterval[][] = [];
  const visited = new Set<string>();

  for (const chop of chops) {
    if (visited.has(chop.id)) continue;

    const cluster: ChopInterval[] = [];
    const stack = [chop];
    visited.add(chop.id);

    while (stack.length > 0) {
      const current = stack.pop()!;
      cluster.push(current);
      for (const other of chops) {
        if (visited.has(other.id)) continue;
        if (chopsOverlap(current, other)) {
          visited.add(other.id);
          stack.push(other);
        }
      }
    }

    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

/** Vertical stack layout for overlapping waveform chops (full height when alone). */
export function computeChopStackLayout(
  chops: ChopInterval[],
): Map<string, ChopStackSlot> {
  const layout = new Map<string, ChopStackSlot>();
  for (const chop of chops) {
    layout.set(chop.id, { lane: 0, laneCount: 1 });
  }

  for (const cluster of overlapClusters(chops)) {
    const laneCount = maxConcurrent(cluster);
    const lanes = assignLanes(cluster);
    for (const chop of cluster) {
      layout.set(chop.id, {
        lane: lanes.get(chop.id) ?? 0,
        laneCount,
      });
    }
  }

  return layout;
}

export function applyChopStackSlot(
  element: HTMLElement,
  slot: ChopStackSlot,
): void {
  if (slot.laneCount <= 1) {
    element.style.top = "0%";
    element.style.height = "100%";
    return;
  }

  const fraction = 100 / slot.laneCount;
  element.style.top = `${slot.lane * fraction}%`;
  element.style.height = `${fraction}%`;
}
