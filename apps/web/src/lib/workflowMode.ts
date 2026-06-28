export type WorkflowMode = "sample" | "arrange" | "play" | "keyboard";

export const WORKFLOW_MODES: WorkflowMode[] = [
  "sample",
  "arrange",
  "play",
  "keyboard",
];

export function workflowModeLabel(mode: WorkflowMode): string {
  switch (mode) {
    case "sample":
      return "SAMPLE";
    case "arrange":
      return "ARRANGE";
    case "play":
      return "PLAY";
    case "keyboard":
      return "KEYBOARD";
  }
}

export function workflowModeDigit(mode: WorkflowMode): string {
  switch (mode) {
    case "sample":
      return "1";
    case "arrange":
      return "2";
    case "play":
      return "3";
    case "keyboard":
      return "4";
  }
}

export function workflowModeFromDigit(key: string): WorkflowMode | null {
  if (key === "1") return "sample";
  if (key === "2") return "arrange";
  if (key === "3") return "play";
  if (key === "4") return "keyboard";
  return null;
}
