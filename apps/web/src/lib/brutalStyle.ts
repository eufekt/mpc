export type BrutalStyle = {
  enabled: boolean;
  /** Shadow offset magnitude in px (1–12). */
  offsetHeight: number;
  /** Shadow direction in degrees — 0° = right, 90° = down. */
  angle: number;
  backgroundColor1: string;
  /** When set, the 3D offset border uses a gradient between the two colors. */
  backgroundColor2: string | null;
};

export const BRUTAL_STYLE_STORAGE_KEY = "mpc-brutal-style";

export const MIN_BRUTAL_OFFSET = 1;
export const MAX_BRUTAL_OFFSET = 12;
export const DEFAULT_BRUTAL_OFFSET = 4;
export const DEFAULT_BRUTAL_ANGLE = 135;

export const DEFAULT_BRUTAL_STYLE: BrutalStyle = {
  enabled: false,
  offsetHeight: DEFAULT_BRUTAL_OFFSET,
  angle: DEFAULT_BRUTAL_ANGLE,
  backgroundColor1: "#e8e8e8",
  backgroundColor2: "#ffffff",
};

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BRUTAL_OFFSET;
  return Math.round(Math.max(MIN_BRUTAL_OFFSET, Math.min(MAX_BRUTAL_OFFSET, value)));
}

function normalizeAngle(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BRUTAL_ANGLE;
  const wrapped = ((value % 360) + 360) % 360;
  return Math.round(wrapped);
}

export function normalizeBrutalStyle(partial: Partial<BrutalStyle>): BrutalStyle {
  const backgroundColor1 =
    typeof partial.backgroundColor1 === "string" &&
    isHexColor(partial.backgroundColor1)
      ? partial.backgroundColor1
      : DEFAULT_BRUTAL_STYLE.backgroundColor1;

  const rawColor2 = partial.backgroundColor2;
  const backgroundColor2 =
    typeof rawColor2 === "string" && isHexColor(rawColor2) ? rawColor2 : null;

  return {
    enabled: partial.enabled === true,
    offsetHeight: clampOffset(partial.offsetHeight ?? DEFAULT_BRUTAL_OFFSET),
    angle: normalizeAngle(partial.angle ?? DEFAULT_BRUTAL_ANGLE),
    backgroundColor1,
    backgroundColor2,
  };
}

/** Convert polar angle + height to box-shadow x/y offsets (px). */
export function shadowOffsetFromAngle(
  angleDeg: number,
  height: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round(height * Math.cos(rad) * 100) / 100,
    y: Math.round(height * Math.sin(rad) * 100) / 100,
  };
}

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb | null {
  if (!isHexColor(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (value: number) =>
    Math.round(Math.max(0, Math.min(255, value)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHex(a: string, b: string, amount: number): string {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return a;
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex({
    r: rgbA.r + (rgbB.r - rgbA.r) * t,
    g: rgbA.g + (rgbB.g - rgbA.g) * t,
    b: rgbA.b + (rgbB.b - rgbA.b) * t,
  });
}

function lightenHex(hex: string, amount: number): string {
  return mixHex(hex, "#ffffff", amount);
}

function darkenHex(hex: string, amount: number): string {
  return mixHex(hex, "#000000", amount);
}

/** Light direction unit vector (opposite of shadow cast direction). */
export function lightVectorFromAngle(angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round(-Math.cos(rad) * 1000) / 1000,
    y: Math.round(-Math.sin(rad) * 1000) / 1000,
  };
}

/** 0–100: how strongly a face edge catches light (100 = fully lit). */
function edgeLitPercent(
  normalX: number,
  normalY: number,
  lightX: number,
  lightY: number,
): number {
  const dot = lightX * normalX + lightY * normalY;
  return Math.round(((dot + 1) / 2) * 100);
}

export type BrutalLighting = {
  lightAngleDeg: number;
  litTop: number;
  litRight: number;
  litBottom: number;
  litLeft: number;
  insetHighlightX: number;
  insetHighlightY: number;
  insetShadowX: number;
  insetShadowY: number;
};

export function lightingFromAngle(angleDeg: number): BrutalLighting {
  const { x: lightX, y: lightY } = lightVectorFromAngle(angleDeg);
  const inset = 1;

  return {
    lightAngleDeg: normalizeAngle(angleDeg + 180),
    litTop: edgeLitPercent(0, -1, lightX, lightY),
    litRight: edgeLitPercent(1, 0, lightX, lightY),
    litBottom: edgeLitPercent(0, 1, lightX, lightY),
    litLeft: edgeLitPercent(-1, 0, lightX, lightY),
    insetHighlightX: Math.round(lightX * inset * 100) / 100,
    insetHighlightY: Math.round(lightY * inset * 100) / 100,
    insetShadowX: Math.round(-lightX * inset * 100) / 100,
    insetShadowY: Math.round(-lightY * inset * 100) / 100,
  };
}

function brutalShadowBackground(
  style: BrutalStyle,
  lightAngleDeg: number,
): string {
  const litSide = style.backgroundColor2
    ? style.backgroundColor1
    : lightenHex(style.backgroundColor1, 0.1);
  const shadowSide =
    style.backgroundColor2 ?? darkenHex(style.backgroundColor1, 0.22);
  return `linear-gradient(${lightAngleDeg}deg, ${litSide}, ${shadowSide})`;
}

function brutalFaceOverlay(lightAngleDeg: number): string {
  return `linear-gradient(${lightAngleDeg}deg, rgba(255,255,255,0.09) 0%, transparent 45%, rgba(0,0,0,0.055) 100%)`;
}

function depthBorderColor(base: string, litPercent: number): string {
  const amount = ((litPercent - 50) / 50) * 0.22;
  if (amount >= 0) return lightenHex(base, amount);
  return darkenHex(base, -amount);
}

const BRUTAL_CSS_VARS = [
  "--brutal-border-width",
  "--brutal-shadow-x",
  "--brutal-shadow-y",
  "--brutal-shadow-x-pressed",
  "--brutal-shadow-y-pressed",
  "--brutal-shadow-bg",
  "--brutal-shadow-solid",
  "--brutal-light-angle",
  "--brutal-face-overlay",
  "--brutal-lit-top",
  "--brutal-lit-right",
  "--brutal-lit-bottom",
  "--brutal-lit-left",
  "--brutal-inset-hl-x",
  "--brutal-inset-hl-y",
  "--brutal-inset-sh-x",
  "--brutal-inset-sh-y",
  "--brutal-inset-highlight",
  "--brutal-inset-shadow",
  "--brutal-pressed-highlight",
  "--brutal-pressed-shadow",
  "--brutal-depth-border-top",
  "--brutal-depth-border-right",
  "--brutal-depth-border-bottom",
  "--brutal-depth-border-left",
] as const;

export function applyBrutalStyle(style: BrutalStyle): void {
  const root = document.documentElement;
  const normalized = normalizeBrutalStyle(style);

  root.classList.toggle("brutal", normalized.enabled);

  if (!normalized.enabled) {
    for (const name of BRUTAL_CSS_VARS) {
      root.style.removeProperty(name);
    }
    return;
  }

  const { x, y } = shadowOffsetFromAngle(
    normalized.angle,
    normalized.offsetHeight,
  );
  const pressedHeight = Math.max(1, Math.round(normalized.offsetHeight * 0.25));
  const pressed = shadowOffsetFromAngle(normalized.angle, pressedHeight);
  const lighting = lightingFromAngle(normalized.angle);
  const depthBase = normalized.backgroundColor1;

  root.style.setProperty("--brutal-border-width", "2px");
  root.style.setProperty("--brutal-shadow-x", `${x}px`);
  root.style.setProperty("--brutal-shadow-y", `${y}px`);
  root.style.setProperty("--brutal-shadow-x-pressed", `${pressed.x}px`);
  root.style.setProperty("--brutal-shadow-y-pressed", `${pressed.y}px`);
  root.style.setProperty(
    "--brutal-shadow-bg",
    brutalShadowBackground(normalized, lighting.lightAngleDeg),
  );
  root.style.setProperty("--brutal-shadow-solid", normalized.backgroundColor1);
  root.style.setProperty("--brutal-light-angle", `${lighting.lightAngleDeg}`);
  root.style.setProperty(
    "--brutal-face-overlay",
    brutalFaceOverlay(lighting.lightAngleDeg),
  );
  root.style.setProperty("--brutal-lit-top", `${lighting.litTop}`);
  root.style.setProperty("--brutal-lit-right", `${lighting.litRight}`);
  root.style.setProperty("--brutal-lit-bottom", `${lighting.litBottom}`);
  root.style.setProperty("--brutal-lit-left", `${lighting.litLeft}`);
  root.style.setProperty("--brutal-inset-hl-x", `${lighting.insetHighlightX}px`);
  root.style.setProperty("--brutal-inset-hl-y", `${lighting.insetHighlightY}px`);
  root.style.setProperty("--brutal-inset-sh-x", `${lighting.insetShadowX}px`);
  root.style.setProperty("--brutal-inset-sh-y", `${lighting.insetShadowY}px`);
  root.style.setProperty("--brutal-inset-highlight", "rgba(255,255,255,0.45)");
  root.style.setProperty("--brutal-inset-shadow", "rgba(0,0,0,0.14)");
  root.style.setProperty("--brutal-pressed-highlight", "rgba(0,0,0,0.12)");
  root.style.setProperty("--brutal-pressed-shadow", "rgba(255,255,255,0.2)");
  root.style.setProperty(
    "--brutal-depth-border-top",
    depthBorderColor(depthBase, lighting.litTop),
  );
  root.style.setProperty(
    "--brutal-depth-border-right",
    depthBorderColor(depthBase, lighting.litRight),
  );
  root.style.setProperty(
    "--brutal-depth-border-bottom",
    depthBorderColor(depthBase, lighting.litBottom),
  );
  root.style.setProperty(
    "--brutal-depth-border-left",
    depthBorderColor(depthBase, lighting.litLeft),
  );
}

export function resolveInitialBrutalStyle(): BrutalStyle {
  try {
    const stored = localStorage.getItem(BRUTAL_STYLE_STORAGE_KEY);
    if (stored) {
      return normalizeBrutalStyle(JSON.parse(stored) as Partial<BrutalStyle>);
    }
  } catch {
    /* private browsing or corrupt data */
  }
  return DEFAULT_BRUTAL_STYLE;
}

export function persistBrutalStyle(style: BrutalStyle): void {
  try {
    localStorage.setItem(
      BRUTAL_STYLE_STORAGE_KEY,
      JSON.stringify(normalizeBrutalStyle(style)),
    );
  } catch {
    /* private browsing */
  }
}
