import { useEffect, useState, type ReactNode } from "react";
import {
  patchMasterEffects,
  type MasterEffects,
} from "../lib/masterEffects";

type Props = {
  effects: MasterEffects;
  onChange: (effects: MasterEffects) => void;
  title?: string;
  className?: string;
};

function formatDelaySummary(delay: MasterEffects["delay"]): string {
  return `${Math.round(delay.mix * 100)}% · ${delay.timeMs} MS`;
}

function formatFilterSummary(filter: MasterEffects["filter"]): string {
  const type = filter.type === "lowpass" ? "LOW" : "HIGH";
  return `${type} · ${Math.round(filter.cutoffHz)} HZ`;
}

function formatReverbSummary(reverb: MasterEffects["reverb"]): string {
  const decay =
    reverb.decaySeconds >= 10
      ? `${reverb.decaySeconds.toFixed(0)}`
      : reverb.decaySeconds.toFixed(1);
  return `${Math.round(reverb.mix * 100)}% · ${decay} S`;
}

type EffectBlockProps = {
  label: string;
  enabled: boolean;
  summary: string;
  expanded: boolean;
  onToggleEnabled: () => void;
  onToggleExpanded: () => void;
  children: ReactNode;
};

function EffectBlock({
  label,
  enabled,
  summary,
  expanded,
  onToggleEnabled,
  onToggleExpanded,
  children,
}: EffectBlockProps) {
  return (
    <div
      className={`settings-effect-block${enabled ? "" : " settings-effect-block--disabled"}${expanded && enabled ? " settings-effect-block--expanded" : ""}`}
    >
      <div className="settings-effect-header">
        <button
          type="button"
          className="settings-effect-header-main"
          disabled={!enabled}
          onClick={onToggleExpanded}
          aria-expanded={enabled && expanded}
        >
          <span className="settings-effect-label">{label}</span>
          {enabled && !expanded && (
            <span className="settings-effect-summary">{summary}</span>
          )}
        </button>
        <button
          type="button"
          className={`settings-effect-toggle${enabled ? " active" : ""}`}
          onClick={onToggleEnabled}
          aria-pressed={enabled}
        >
          {enabled ? "ON" : "OFF"}
        </button>
      </div>
      {enabled && expanded && (
        <div className="settings-effect-panel">{children}</div>
      )}
    </div>
  );
}

export function EffectsControls({
  effects,
  onChange,
  title = "EFFECTS",
  className = "settings-effects",
}: Props) {
  const { delay, filter, reverb } = effects;
  const [delayExpanded, setDelayExpanded] = useState(false);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [reverbExpanded, setReverbExpanded] = useState(false);

  useEffect(() => {
    if (!delay.enabled) setDelayExpanded(false);
  }, [delay.enabled]);

  useEffect(() => {
    if (!filter.enabled) setFilterExpanded(false);
  }, [filter.enabled]);

  useEffect(() => {
    if (!reverb.enabled) setReverbExpanded(false);
  }, [reverb.enabled]);

  const toggleDelay = () => {
    if (delay.enabled) {
      setDelayExpanded(false);
      onChange(patchMasterEffects(effects, { delay: { enabled: false } }));
    } else {
      setDelayExpanded(true);
      onChange(patchMasterEffects(effects, { delay: { enabled: true } }));
    }
  };

  const toggleFilter = () => {
    if (filter.enabled) {
      setFilterExpanded(false);
      onChange(patchMasterEffects(effects, { filter: { enabled: false } }));
    } else {
      setFilterExpanded(true);
      onChange(patchMasterEffects(effects, { filter: { enabled: true } }));
    }
  };

  const toggleReverb = () => {
    if (reverb.enabled) {
      setReverbExpanded(false);
      onChange(patchMasterEffects(effects, { reverb: { enabled: false } }));
    } else {
      setReverbExpanded(true);
      onChange(patchMasterEffects(effects, { reverb: { enabled: true } }));
    }
  };

  return (
    <div className={className}>
      <h3>{title}</h3>

      <EffectBlock
        label="DELAY / ECHO"
        enabled={delay.enabled}
        summary={formatDelaySummary(delay)}
        expanded={delayExpanded}
        onToggleEnabled={toggleDelay}
        onToggleExpanded={() => setDelayExpanded((open) => !open)}
      >
        <label className="settings-slider-field">
          <span>Time {delay.timeMs} ms</span>
          <input
            type="range"
            min={10}
            max={2000}
            step={10}
            value={delay.timeMs}
            onChange={(e) =>
              onChange(
                patchMasterEffects(effects, {
                  delay: { timeMs: Number(e.target.value) },
                }),
              )
            }
          />
        </label>
        <label className="settings-slider-field">
          <span>Feedback {Math.round(delay.feedback * 100)}%</span>
          <input
            type="range"
            min={0}
            max={95}
            step={1}
            value={Math.round(delay.feedback * 100)}
            onChange={(e) =>
              onChange(
                patchMasterEffects(effects, {
                  delay: { feedback: Number(e.target.value) / 100 },
                }),
              )
            }
          />
        </label>
        <label className="settings-slider-field">
          <span>Mix {Math.round(delay.mix * 100)}%</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(delay.mix * 100)}
            onChange={(e) =>
              onChange(
                patchMasterEffects(effects, {
                  delay: { mix: Number(e.target.value) / 100 },
                }),
              )
            }
          />
        </label>
      </EffectBlock>

      <EffectBlock
        label="FILTER"
        enabled={filter.enabled}
        summary={formatFilterSummary(filter)}
        expanded={filterExpanded}
        onToggleEnabled={toggleFilter}
        onToggleExpanded={() => setFilterExpanded((open) => !open)}
      >
        <div className="settings-palette-toggle">
          <span>TYPE</span>
          <button
            type="button"
            className={filter.type === "lowpass" ? "active" : undefined}
            onClick={() =>
              onChange(
                patchMasterEffects(effects, {
                  filter: { type: "lowpass" },
                }),
              )
            }
          >
            LOW
          </button>
          <button
            type="button"
            className={filter.type === "highpass" ? "active" : undefined}
            onClick={() =>
              onChange(
                patchMasterEffects(effects, {
                  filter: { type: "highpass" },
                }),
              )
            }
          >
            HIGH
          </button>
        </div>
        <label className="settings-slider-field">
          <span>Cutoff {Math.round(filter.cutoffHz)} Hz</span>
          <input
            type="range"
            min={20}
            max={20000}
            step={1}
            value={filter.cutoffHz}
            onChange={(e) =>
              onChange(
                patchMasterEffects(effects, {
                  filter: { cutoffHz: Number(e.target.value) },
                }),
              )
            }
          />
        </label>
        <label className="settings-slider-field">
          <span>Resonance {filter.resonance.toFixed(1)}</span>
          <input
            type="range"
            min={0.1}
            max={18}
            step={0.1}
            value={filter.resonance}
            onChange={(e) =>
              onChange(
                patchMasterEffects(effects, {
                  filter: { resonance: Number(e.target.value) },
                }),
              )
            }
          />
        </label>
      </EffectBlock>

      <EffectBlock
        label="REVERB"
        enabled={reverb.enabled}
        summary={formatReverbSummary(reverb)}
        expanded={reverbExpanded}
        onToggleEnabled={toggleReverb}
        onToggleExpanded={() => setReverbExpanded((open) => !open)}
      >
        <label className="settings-slider-field">
          <span>Mix {Math.round(reverb.mix * 100)}%</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(reverb.mix * 100)}
            onChange={(e) =>
              onChange(
                patchMasterEffects(effects, {
                  reverb: { mix: Number(e.target.value) / 100 },
                }),
              )
            }
          />
        </label>
        <label className="settings-slider-field">
          <span>Decay {reverb.decaySeconds.toFixed(1)} s</span>
          <input
            type="range"
            min={0.1}
            max={8}
            step={0.1}
            value={reverb.decaySeconds}
            onChange={(e) =>
              onChange(
                patchMasterEffects(effects, {
                  reverb: { decaySeconds: Number(e.target.value) },
                }),
              )
            }
          />
        </label>
        <label className="settings-slider-field">
          <span>Pre-delay {reverb.preDelayMs} ms</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={reverb.preDelayMs}
            onChange={(e) =>
              onChange(
                patchMasterEffects(effects, {
                  reverb: { preDelayMs: Number(e.target.value) },
                }),
              )
            }
          />
        </label>
      </EffectBlock>
    </div>
  );
}
