import { useState, type ReactNode } from "react";

export type ConfigTab = "midi" | "settings";

export function useConfigMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ConfigTab | null>(null);

  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      setActiveTab(null);
      return;
    }
    setMenuOpen(true);
  };

  const selectTab = (tab: ConfigTab) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  };

  return { menuOpen, activeTab, toggleMenu, selectTab };
}

type TriggerProps = {
  menuOpen: boolean;
  onToggle: () => void;
};

export function ConfigMenuTrigger({ menuOpen, onToggle }: TriggerProps) {
  return (
    <button
      type="button"
      className={`config-menu-trigger${menuOpen ? " active" : ""}`}
      aria-expanded={menuOpen}
      aria-haspopup="true"
      onClick={onToggle}
    >
      MENU
    </button>
  );
}

type BodyProps = {
  menuOpen: boolean;
  activeTab: ConfigTab | null;
  onSelectTab: (tab: ConfigTab) => void;
  midiPanel: ReactNode;
  settingsPanel: ReactNode;
};

export function ConfigMenuBody({
  menuOpen,
  activeTab,
  onSelectTab,
  midiPanel,
  settingsPanel,
}: BodyProps) {
  if (!menuOpen) return null;

  return (
    <div className="config-menu-body">
      <nav className="config-menu-tabs" aria-label="Configuration">
        <button
          type="button"
          className={activeTab === "midi" ? "active" : undefined}
          aria-pressed={activeTab === "midi"}
          onClick={() => onSelectTab("midi")}
        >
          MIDI
        </button>
        <button
          type="button"
          className={activeTab === "settings" ? "active" : undefined}
          aria-pressed={activeTab === "settings"}
          onClick={() => onSelectTab("settings")}
        >
          SETTINGS
        </button>
      </nav>
      {activeTab === "midi" && midiPanel}
      {activeTab === "settings" && settingsPanel}
    </div>
  );
}
