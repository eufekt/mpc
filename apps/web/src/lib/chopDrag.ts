export const CHOP_DRAG_MIME = "application/x-mpc-chop";

export function encodeChopDragKey(trackId: string, chopId: string): string {
  return `${trackId}:${chopId}`;
}

export function parseChopDragKey(
  data: string,
): { trackId: string; chopId: string } | null {
  const colon = data.indexOf(":");
  if (colon <= 0) return null;
  const trackId = data.slice(0, colon);
  const chopId = data.slice(colon + 1);
  if (!trackId || !chopId) return null;
  return { trackId, chopId };
}

export function isChopDragEvent(event: {
  dataTransfer: DataTransfer;
}): boolean {
  return event.dataTransfer.types.includes(CHOP_DRAG_MIME);
}
