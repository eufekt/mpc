import { useCallback, useEffect, useRef, useState } from "react";
import {
  bindingFromEntry,
  bindingKeyFromBinding,
  entryMatchesBinding,
  isLearnableEntry,
  parseMidiMessage,
  type MidiBinding,
  type MidiInputInfo,
  type MidiLogEntry,
  type MidiPortInfo,
} from "../lib/midi";
import {
  clearMidiBindings,
  loadMidiBindings,
  saveMidiBindings,
} from "../lib/midiMappings";

const MAX_LOG = 80;

type Options = {
  projectId: string;
  onPadTrigger?: (padKey: string) => void;
};

function collectPorts(access: MIDIAccess): {
  inputs: MidiInputInfo[];
  outputs: MidiPortInfo[];
} {
  const inputs: MidiInputInfo[] = Array.from(access.inputs.values()).map(
    (port) => ({
      id: port.id,
      name: port.name || "unnamed",
      manufacturer: port.manufacturer || "",
      state: port.state,
      direction: "input" as const,
    }),
  );

  const outputs: MidiPortInfo[] = Array.from(access.outputs.values()).map(
    (port) => ({
      id: port.id,
      name: port.name || "unnamed",
      manufacturer: port.manufacturer || "",
      state: port.state,
      direction: "output" as const,
    }),
  );

  return { inputs, outputs };
}

export function useMidiInput({ projectId, onPadTrigger }: Options) {
  const [supported] = useState(() => "requestMIDIAccess" in navigator);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<MidiInputInfo[]>([]);
  const [outputs, setOutputs] = useState<MidiPortInfo[]>([]);
  const [sysexEnabled, setSysexEnabled] = useState(false);
  const [permissionState, setPermissionState] = useState<string | null>(null);
  const [messages, setMessages] = useState<MidiLogEntry[]>([]);
  const [bindings, setBindings] = useState<MidiBinding[]>([]);
  const [learnPad, setLearnPad] = useState<string | null>(null);
  const [lastTrigger, setLastTrigger] = useState<string | null>(null);

  const accessRef = useRef<MIDIAccess | null>(null);
  const inputCleanupsRef = useRef<Map<string, () => void>>(new Map());
  const accessCleanupRef = useRef<(() => void) | null>(null);
  const bindingsRef = useRef(bindings);
  const learnPadRef = useRef(learnPad);
  const onPadTriggerRef = useRef(onPadTrigger);

  bindingsRef.current = bindings;
  learnPadRef.current = learnPad;
  onPadTriggerRef.current = onPadTrigger;

  const queryPermission = useCallback(async (sysex: boolean) => {
    try {
      const result = await navigator.permissions.query({
        name: "midi",
        sysex,
      } as PermissionDescriptor);
      setPermissionState(result.state);
    } catch {
      setPermissionState(null);
    }
  }, []);

  const pushMessage = useCallback((entry: MidiLogEntry) => {
    setMessages((prev) => [entry, ...prev].slice(0, MAX_LOG));
  }, []);

  const upsertBinding = useCallback((binding: MidiBinding) => {
    const key = bindingKeyFromBinding(binding);
    setBindings((prev) => {
      const next = [
        ...prev.filter((b) => bindingKeyFromBinding(b) !== key),
        binding,
      ];
      saveMidiBindings(projectId, next);
      return next;
    });
  }, [projectId]);

  const removeBinding = useCallback((key: string) => {
    setBindings((prev) => {
      const next = prev.filter((b) => bindingKeyFromBinding(b) !== key);
      saveMidiBindings(projectId, next);
      return next;
    });
  }, [projectId]);

  const clearBindings = useCallback(() => {
    setBindings([]);
    clearMidiBindings(projectId);
  }, [projectId]);

  const handleEntry = useCallback(
    (entry: MidiLogEntry) => {
      pushMessage(entry);

      const armedPad = learnPadRef.current;
      if (armedPad && isLearnableEntry(entry)) {
        const partial = bindingFromEntry(entry);
        if (partial) {
          upsertBinding({ ...partial, padKey: armedPad });
          setLearnPad(null);
        }
        return;
      }

      if (!isLearnableEntry(entry)) return;

      const match = bindingsRef.current.find((b) =>
        entryMatchesBinding(entry, b),
      );
      if (!match) return;

      setLastTrigger(match.padKey);
      window.setTimeout(() => setLastTrigger(null), 100);
      onPadTriggerRef.current?.(match.padKey);
    },
    [pushMessage, upsertBinding],
  );

  const refreshPorts = useCallback((access: MIDIAccess) => {
    const ports = collectPorts(access);
    setInputs(ports.inputs);
    setOutputs(ports.outputs);
    setSysexEnabled(access.sysexEnabled);
    return ports;
  }, []);

  const detachInput = useCallback((id: string) => {
    inputCleanupsRef.current.get(id)?.();
    inputCleanupsRef.current.delete(id);
  }, []);

  const attachInput = useCallback(
    (input: MIDIInput) => {
      if (inputCleanupsRef.current.has(input.id)) return;

      const handler = (event: MIDIMessageEvent) => {
        try {
          if (!event.data || event.data.length === 0) return;
          const entry = parseMidiMessage(
            input.name || input.id || "MIDI",
            event.data,
          );
          if (entry) handleEntry(entry);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "failed to parse MIDI message",
          );
        }
      };

      input.addEventListener("midimessage", handler);

      inputCleanupsRef.current.set(input.id, () => {
        input.removeEventListener("midimessage", handler);
      });
    },
    [handleEntry],
  );

  const syncInputs = useCallback(
    (access: MIDIAccess) => {
      const activeIds = new Set<string>();

      for (const input of access.inputs.values()) {
        activeIds.add(input.id);
        if (input.state === "connected") {
          attachInput(input);
        } else {
          detachInput(input.id);
        }
      }

      for (const id of inputCleanupsRef.current.keys()) {
        if (!activeIds.has(id)) detachInput(id);
      }

      return refreshPorts(access);
    },
    [attachInput, detachInput, refreshPorts],
  );

  const connect = useCallback(
    async (options?: { sysex?: boolean }) => {
      if (!supported) {
        setError("Web MIDI is not supported in this browser");
        return;
      }

      const sysex = options?.sysex ?? false;
      setError(null);

      try {
        const access = await navigator.requestMIDIAccess({ sysex });
        accessRef.current = access;

        accessCleanupRef.current?.();
        for (const cleanup of inputCleanupsRef.current.values()) cleanup();
        inputCleanupsRef.current.clear();

        const ports = syncInputs(access);
        void queryPermission(sysex);

        const onStateChange = () => {
          if (accessRef.current) syncInputs(accessRef.current);
        };

        access.addEventListener("statechange", onStateChange);
        accessCleanupRef.current = () => {
          access.removeEventListener("statechange", onStateChange);
        };

        setConnected(true);

        if (ports.inputs.length === 0 && ports.outputs.length === 0) {
          setError(
            "MIDI access granted but Chrome sees 0 devices. Check USB, Audio MIDI Setup, and site permissions.",
          );
        }
      } catch (err) {
        setConnected(false);
        setInputs([]);
        setOutputs([]);
        setError(err instanceof Error ? err.message : "failed to connect MIDI");
      }
    },
    [supported, syncInputs, queryPermission],
  );

  const rescan = useCallback(() => {
    if (accessRef.current) syncInputs(accessRef.current);
  }, [syncInputs]);

  const disconnect = useCallback(() => {
    accessCleanupRef.current?.();
    accessCleanupRef.current = null;
    for (const cleanup of inputCleanupsRef.current.values()) cleanup();
    inputCleanupsRef.current.clear();
    accessRef.current = null;
    setConnected(false);
    setInputs([]);
    setOutputs([]);
    setSysexEnabled(false);
    setPermissionState(null);
  }, []);

  const armLearn = useCallback((padKey: string) => {
    setLearnPad((prev) => (prev === padKey ? null : padKey));
  }, []);

  const cancelLearn = useCallback(() => {
    setLearnPad(null);
  }, []);

  const clearLog = useCallback(() => {
    setMessages([]);
  }, []);

  const mapEntryToPad = useCallback(
    (entry: MidiLogEntry, padKey: string) => {
      const partial = bindingFromEntry(entry);
      if (!partial) return;
      upsertBinding({ ...partial, padKey });
    },
    [upsertBinding],
  );

  useEffect(() => {
    setBindings(loadMidiBindings(projectId));
    setLearnPad(null);
  }, [projectId]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    supported,
    connected,
    error,
    inputs,
    outputs,
    sysexEnabled,
    permissionState,
    messages,
    bindings,
    learnPad,
    lastTrigger,
    connect,
    rescan,
    disconnect,
    armLearn,
    cancelLearn,
    clearLog,
    removeBinding,
    clearBindings,
    mapEntryToPad,
  };
}
