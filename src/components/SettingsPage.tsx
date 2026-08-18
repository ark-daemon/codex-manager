import { useEffect, useState, useRef, useCallback } from "react";
import { Moon, Sun } from "lucide-react";
import { AppState, SettingsUpdateInput } from "../shared/types";
import { copyForLanguage } from "../i18n";
import { clampNumber, clampPercent, getApi, prefersDarkMode } from "../ui-utils";

type UiCopy = ReturnType<typeof copyForLanguage>;
type SettingsTab = "general" | "auto-switch" | "proxy";

interface SettingsPageProps {
  state: AppState;
  copy: UiCopy;
  pseudoLocaleEnabled: boolean;
  onSave: (input: SettingsUpdateInput) => Promise<void>;
  onOpenLogDirectory: () => Promise<void>;
}

export function SettingsPage({
  state,
  copy,
  pseudoLocaleEnabled,
  onSave,
  onOpenLogDirectory
}: SettingsPageProps) {
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [generalForm, setGeneralForm] = useState({
    executablePath: state.settings.executablePath ?? state.defaultExecutablePath,
    language: state.settings.language,
    lowQuotaThresholdPercent: state.settings.lowQuotaThresholdPercent,
    syncIntervalMinutes: state.settings.syncIntervalMinutes,
    proxyUrl: state.settings.proxyUrl ?? "",
    autoSwitchThresholdPercent: state.settings.autoSwitchThresholdPercent,
    pollingIntervalMinutes: state.settings.pollingIntervalMinutes
  });

  useEffect(() => {
    setGeneralForm({
      executablePath: state.settings.executablePath ?? state.defaultExecutablePath,
      language: state.settings.language,
      lowQuotaThresholdPercent: state.settings.lowQuotaThresholdPercent,
      syncIntervalMinutes: state.settings.syncIntervalMinutes,
      proxyUrl: state.settings.proxyUrl ?? "",
      autoSwitchThresholdPercent: state.settings.autoSwitchThresholdPercent,
      pollingIntervalMinutes: state.settings.pollingIntervalMinutes
    });
  }, [state.settings]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<SettingsUpdateInput>({});

  const debouncedSave = useCallback((input: SettingsUpdateInput) => {
    pendingRef.current = { ...pendingRef.current, ...input };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const payload = pendingRef.current;
      pendingRef.current = {};
      void onSave(payload);
    }, 600);
  }, [onSave]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  return (
    <section className="panel settings-panel-wrap">
      <header className="page-header">
        <div>
          <h2>{copy.settings.title}</h2>
          <p>{copy.settings.description}</p>
        </div>
      </header>

      <nav className="settings-tabs" aria-label="Settings sections">
        <button className={settingsTab === "general" ? "active" : ""} onClick={() => setSettingsTab("general")}>{copy.settings.general}</button>
        <button className={settingsTab === "auto-switch" ? "active" : ""} onClick={() => setSettingsTab("auto-switch")}>{copy.settings.autoSwitch}</button>
        <button className={settingsTab === "proxy" ? "active" : ""} onClick={() => setSettingsTab("proxy")}>{copy.settings.proxy}</button>
      </nav>

      {settingsTab === "general" && (
        <div className="settings-grid">
          <section className="settings-panel">
            <h3>{copy.settings.appearance}</h3>
            <label className="toggle wide">
              <input
                type="checkbox"
                checked={state.settings.theme === "dark" || (state.settings.theme === "system" && prefersDarkMode())}
                onChange={(event) => void onSave({ theme: event.target.checked ? "dark" : "light" })}
              />
              <span>{state.settings.theme === "dark" ? <Moon size={15} /> : <Sun size={15} />} {copy.settings.darkMode}</span>
            </label>
            <button className="follow-system-link" onClick={() => void onSave({ theme: "system" })}>{copy.settings.followSystem}</button>
            <label className="path-field">
              <span>{copy.settings.language}</span>
              <select
                value={generalForm.language}
                onChange={(event) => {
                  const language = event.target.value;
                  setGeneralForm((current) => ({ ...current, language }));
                  void onSave({ language });
                }}
              >
                <option value="en">English</option>
                <option value="zh">Chinese</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                {(pseudoLocaleEnabled || generalForm.language === "pseudo") && (
                  <option value="pseudo">Pseudo-locale</option>
                )}
              </select>
            </label>
          </section>

          <section className="settings-panel">
            <h3>{copy.settings.accountSettings}</h3>
            <label className="toggle wide">
              <input
                type="checkbox"
                checked={state.settings.autoRefreshQuota}
                onChange={(event) => void onSave({ autoRefreshQuota: event.target.checked })}
              />
              <span>{copy.settings.autoRefreshQuota}</span>
            </label>
            <label className="toggle wide">
              <input
                type="checkbox"
                checked={state.settings.autoSyncCurrentAccount}
                onChange={(event) => void onSave({ autoSyncCurrentAccount: event.target.checked })}
              />
              <span>{copy.settings.autoSyncCurrentAccount}</span>
            </label>
            <div className="path-field threshold-field">
              <span>{copy.settings.syncInterval}</span>
              <div className="number-stepper">
                <button
                  type="button"
                  aria-label="Decrease sync interval"
                  onClick={() => {
                    const next = clampNumber(generalForm.syncIntervalMinutes - 1, 1, 30);
                    setGeneralForm((current) => ({ ...current, syncIntervalMinutes: next }));
                    debouncedSave({ syncIntervalMinutes: next });
                  }}
                >
                  -
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Sync interval in minutes"
                  value={generalForm.syncIntervalMinutes}
                  onChange={(event) => setGeneralForm((current) => ({ ...current, syncIntervalMinutes: clampNumber(Number(event.target.value), 1, 30) }))}
                  onBlur={() => void onSave({ syncIntervalMinutes: generalForm.syncIntervalMinutes })}
                />
                <small className="number-stepper-unit">min</small>
                <button
                  type="button"
                  aria-label="Increase sync interval"
                  onClick={() => {
                    const next = clampNumber(generalForm.syncIntervalMinutes + 1, 1, 30);
                    setGeneralForm((current) => ({ ...current, syncIntervalMinutes: next }));
                    debouncedSave({ syncIntervalMinutes: next });
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </section>

          <section className="settings-panel">
            <h3>{copy.settings.codex}</h3>
            <label className="path-field">
              <span>{copy.settings.executable}</span>
              <input
                value={generalForm.executablePath}
                onChange={(event) => setGeneralForm((current) => ({ ...current, executablePath: event.target.value }))}
                onBlur={() => void onSave({ executablePath: generalForm.executablePath })}
              />
              <div className="path-field-actions">
                <button
                  type="button"
                  className="browse-button"
                  onClick={async () => {
                    const path = await getApi()?.browseExecutable();
                    if (!path) return;
                    setGeneralForm((current) => ({ ...current, executablePath: path }));
                    void onSave({ executablePath: path });
                  }}
                >
                  {copy.actions.browse}
                </button>
              </div>
            </label>
          </section>

          <section className="settings-panel">
            <h3>{copy.settings.startup}</h3>
            <label className="toggle wide">
              <input
                type="checkbox"
                checked={state.settings.startWithSystem}
                onChange={(event) => void onSave({ startWithSystem: event.target.checked })}
              />
              <span>{copy.settings.startWithSystem}</span>
            </label>
          </section>

          <section className="settings-panel">
            <h3>{copy.settings.notifications}</h3>
            <label className="toggle wide">
              <input
                type="checkbox"
                checked={state.settings.lowQuotaAlerts}
                onChange={(event) => void onSave({ lowQuotaAlerts: event.target.checked })}
              />
              <span>{copy.settings.lowQuotaAlerts}</span>
            </label>
            <label className="toggle wide">
              <input
                type="checkbox"
                checked={state.settings.notifyWhenAvailable}
                onChange={(event) => void onSave({ notifyWhenAvailable: event.target.checked })}
              />
              <span>{copy.settings.notifyWhenAvailable}</span>
            </label>
            <div className="path-field threshold-field">
              <span>{copy.settings.alertThreshold}</span>
              <div className="number-stepper">
                <button
                  type="button"
                  aria-label="Decrease alert threshold"
                  onClick={() => {
                    const next = clampPercent(generalForm.lowQuotaThresholdPercent - 1);
                    setGeneralForm((current) => ({ ...current, lowQuotaThresholdPercent: next }));
                    debouncedSave({ lowQuotaThresholdPercent: next });
                  }}
                >
                  -
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Alert threshold in percent"
                  value={generalForm.lowQuotaThresholdPercent}
                  onChange={(event) => setGeneralForm((current) => ({ ...current, lowQuotaThresholdPercent: clampPercent(Number(event.target.value)) }))}
                  onBlur={() => void onSave({ lowQuotaThresholdPercent: generalForm.lowQuotaThresholdPercent })}
                />
                <small className="number-stepper-unit">%</small>
                <button
                  type="button"
                  aria-label="Increase alert threshold"
                  onClick={() => {
                    const next = clampPercent(generalForm.lowQuotaThresholdPercent + 1);
                    setGeneralForm((current) => ({ ...current, lowQuotaThresholdPercent: next }));
                    debouncedSave({ lowQuotaThresholdPercent: next });
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </section>

          <section className="settings-panel">
            <h3>{copy.settings.security}</h3>
            {state.appInfo.storageEncrypted ? (
              <p className="security-status encrypted">
                <span className="security-dot" aria-hidden="true" />
                {copy.settings.securityEncrypted}
              </p>
            ) : (
              <p className="security-status plaintext">
                <span className="security-dot" aria-hidden="true" />
                {copy.settings.securityPlaintext}
              </p>
            )}
          </section>

          <section className="settings-panel settings-about-panel">
            <h3>{copy.settings.about}</h3>
            <p>{copy.settings.version}: {state.appInfo.version}</p>
            <p>{copy.settings.platform}: {state.appInfo.platform}</p>
            <p>{copy.settings.license}: {state.appInfo.license}</p>
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button onClick={() => void onOpenLogDirectory()}>{copy.settings.openLogDirectory}</button>
              <button 
                disabled={isCheckingUpdates}
                onClick={async () => {
                  const api = getApi();
                  if (!api) return;
                  setIsCheckingUpdates(true);
                  try {
                    await api.checkForUpdates();
                  } finally {
                    setIsCheckingUpdates(false);
                  }
                }}
              >
                {isCheckingUpdates ? "Checking..." : "Check for Updates"}
              </button>
            </div>
          </section>
        </div>
      )}

      {settingsTab === "auto-switch" && (
        <div className="settings-grid">
          <div className="settings-description-card">
            Auto-Switch monitors all accounts every {generalForm.pollingIntervalMinutes} minutes. When the active account's quota drops below the threshold, it automatically switches to the next available account and sends a desktop notification.
          </div>
          <section className="settings-panel">
            <h3>{copy.settings.autoSwitch}</h3>
            <label className="toggle wide">
              <input
                type="checkbox"
                checked={state.settings.autoSwitchEnabled}
                onChange={(event) => void onSave({ autoSwitchEnabled: event.target.checked })}
              />
              <span>{copy.settings.enableAutoSwitch}</span>
            </label>
            <div className="range-field range-field-context">
              <span>{copy.settings.threshold}</span>
              <div className="range-context-body">
                <div className="range-context-row">
                  <small className="range-context-min">0%</small>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={generalForm.autoSwitchThresholdPercent}
                    onChange={(event) => setGeneralForm((current) => ({ ...current, autoSwitchThresholdPercent: Number(event.target.value) }))}
                    onPointerUp={() => void onSave({ autoSwitchThresholdPercent: generalForm.autoSwitchThresholdPercent })}
                  />
                  <strong>{generalForm.autoSwitchThresholdPercent}%</strong>
                </div>
                <p className="range-context-help">Switch accounts when quota exceeds this threshold</p>
              </div>
            </div>
            <div className="range-field range-field-context">
              <span>{copy.settings.pollingInterval}</span>
              <div className="range-context-body">
                <div className="range-context-row">
                  <small className="range-context-min">1 min</small>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={generalForm.pollingIntervalMinutes}
                    onChange={(event) => setGeneralForm((current) => ({ ...current, pollingIntervalMinutes: Number(event.target.value) }))}
                    onPointerUp={() => void onSave({ pollingIntervalMinutes: generalForm.pollingIntervalMinutes })}
                  />
                  <strong>{generalForm.pollingIntervalMinutes} min</strong>
                </div>
                <p className="range-context-help">How often to check account quota status</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {settingsTab === "proxy" && (
        <div className="settings-grid">
          <div className="settings-description-card">
            Upstream Proxy routes Relay network requests through your proxy server. Use this when your network requires a proxy for outbound access, or when you want traffic to follow an existing proxy policy.
          </div>
          <section className="settings-panel">
            <h3>{copy.settings.proxy}</h3>
            <label className="toggle wide">
              <input
                type="checkbox"
                checked={state.settings.proxyEnabled}
                onChange={(event) => void onSave({ proxyEnabled: event.target.checked })}
              />
              <span>{copy.settings.enableProxy}</span>
            </label>
            <label className="path-field">
              <span>{copy.settings.proxyUrl}</span>
              <input
                value={generalForm.proxyUrl}
                onChange={(event) => setGeneralForm((current) => ({ ...current, proxyUrl: event.target.value }))}
                onBlur={() => void onSave({ proxyUrl: generalForm.proxyUrl })}
                placeholder="http://127.0.0.1:7890"
              />
            </label>
          </section>
        </div>
      )}
    </section>
  );
}
