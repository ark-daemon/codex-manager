import { AppState } from "../shared/types";
import { copyForLanguage } from "../i18n";

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

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-title">
          <svg
            className="brand-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4.519 20.008l16.481 -.008v-3.5a2 2 0 1 1 0 -4v-3.5h-16.722" />
            <path d="M21 9l-9.385 -4.992c-2.512 .12 -4.758 1.42 -6.327 3.425c-1.423 1.82 -2.288 4.221 -2.288 6.854c0 2.117 .56 4.085 1.519 5.721" />
            <path d="M15 13v.01" />
            <path d="M8 13v.01" />
            <path d="M11 16v.01" />
          </svg>
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
        <div className="service-status-row">
          <span className={`service-dot ${state.settings.serviceRunning ? "running" : "stopped"}`} />
          <div className="service-primary">
            <strong title={copy.sidebar.serviceTooltip}>
              {state.settings.serviceRunning ? copy.sidebar.serviceActive : copy.sidebar.servicePaused}
            </strong>
          </div>
        </div>
        {!state.profiles.some((profile) => profile.isActive) && (
          <div className="service-no-account-row">
            <span className="service-dot no-account" />
            <strong>{copy.sidebar.noAccountActive}</strong>
          </div>
        )}
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
