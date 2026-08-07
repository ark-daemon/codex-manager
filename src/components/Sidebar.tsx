import { AppState } from "../shared/types";
import { copyForLanguage } from "../i18n";
import { displayPrimaryLabel } from "../ui-utils";
import brandLogo from "../../assets/icon.png";

type UiCopy = ReturnType<typeof copyForLanguage>;
type View = "accounts" | "settings";

interface SidebarProps {
  state: AppState;
  copy: UiCopy;
  view: View;
  setView: (view: View) => void;
  autoSwitchSessionCount: number;
  onUpdateSettings: (input: { autoSwitchEnabled: boolean }) => void;
  onSetServiceRunning: (running: boolean) => void;
}

export function Sidebar({
  state,
  copy,
  view,
  setView,
  autoSwitchSessionCount,
  onUpdateSettings,
  onSetServiceRunning
}: SidebarProps) {
  const autoSwitchBadgeLabel = `${autoSwitchSessionCount} auto-switch${autoSwitchSessionCount === 1 ? "" : "es"} performed this session`;
  const activeProfile = state.profiles.find((p) => p.isActive);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-title">
          <img src={brandLogo} className="brand-icon" alt="Relay" />
          <h1>Relay</h1>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        <button className={view === "accounts" ? "active" : ""} onClick={() => setView("accounts")}>
          {copy.sidebar.accounts}
        </button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
          {copy.sidebar.settings}
        </button>
      </nav>

      <div className="service-card">
        <div className="sidebar-status-header">
          <span className={`status-badge-dot ${state.settings.serviceRunning ? "connected" : "paused"}`} />
          <span className="sidebar-status-title">
            {state.settings.serviceRunning ? "CODEX IS ACTIVE" : "CODEX IS PAUSED"}
          </span>
        </div>

        <div className="service-auto-switch-group">
          <label className="toggle service-toggle" title={copy.actions.autoSwitch}>
            <input
              type="checkbox"
              checked={state.settings.autoSwitchEnabled}
              onChange={(event) => onUpdateSettings({ autoSwitchEnabled: event.target.checked })}
            />
            <span style={{ whiteSpace: "nowrap" }}>{copy.actions.autoSwitch}</span>
          </label>
          <span
            className="service-auto-switch-badge"
            title={autoSwitchBadgeLabel}
            aria-label={autoSwitchBadgeLabel}
          >
            {autoSwitchSessionCount}
          </span>
        </div>

        <div className="service-footer-row">
          <small className="service-interval">
            {state.settings.pollingIntervalMinutes} {copy.sidebar.minuteInterval}
          </small>
          <button onClick={() => onSetServiceRunning(!state.settings.serviceRunning)}>
            {state.settings.serviceRunning ? copy.actions.stop : copy.actions.start}
          </button>
        </div>
      </div>
    </aside>
  );
}
