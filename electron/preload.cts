import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  AppState,
  ImportProfileEntry,
  ProfileActionInput,
  ProfileExportResult,
  ProfileCreateInput,
  ProfileImportPreview,
  ProfileLoginCapture,
  ProfileLoginSession,
  ProfileSwitcherApi,
  ServiceStateInput,
  SettingsUpdateInput,
  SwitchResult,
  UsageSnapshot
} from "../src/shared/types.js";

const api: ProfileSwitcherApi = {
  getState: () => ipcRenderer.invoke("profiles:get-state") as Promise<AppState>,
  beginLoginCapture: () => ipcRenderer.invoke("profiles:begin-login-capture") as Promise<ProfileLoginCapture>,
  startLoginCapture: () => ipcRenderer.invoke("profiles:start-login-capture") as Promise<ProfileLoginSession>,
  openLoginCapture: (input: { captureId: string }) => ipcRenderer.invoke("profiles:open-login-capture", input) as Promise<void>,
  waitLoginCapture: (input: { captureId: string }) => ipcRenderer.invoke("profiles:wait-login-capture", input) as Promise<ProfileLoginCapture>,
  cancelLoginCapture: (input: { captureId: string }) => ipcRenderer.invoke("profiles:cancel-login-capture", input) as Promise<void>,
  createProfile: (input: ProfileCreateInput) => ipcRenderer.invoke("profiles:create", input) as Promise<AppState>,
  syncCurrentProfile: (input: { name: string }) => ipcRenderer.invoke("profiles:sync-current", input) as Promise<AppState>,
  switchProfile: (input: ProfileActionInput) => ipcRenderer.invoke("profiles:switch", input) as Promise<SwitchResult>,
  backupProfile: (input: ProfileActionInput) => ipcRenderer.invoke("profiles:backup", input) as Promise<AppState>,
  deleteProfile: (input: ProfileActionInput) => ipcRenderer.invoke("profiles:delete", input) as Promise<AppState>,
  renameProfile: (input: ProfileActionInput & { name: string }) => ipcRenderer.invoke("profiles:rename", input) as Promise<AppState>,
  refreshUsage: (input: ProfileActionInput) => ipcRenderer.invoke("usage:refresh", input) as Promise<UsageSnapshot>,
  updateSettings: (input: SettingsUpdateInput) => ipcRenderer.invoke("settings:update", input) as Promise<AppState>,
  updateServiceState: (input: ServiceStateInput) => ipcRenderer.invoke("service:update-state", input) as Promise<AppState>,
  exportProfiles: (input?: { passphrase?: string }) => ipcRenderer.invoke("profiles:export", input) as Promise<ProfileExportResult>,
  previewImport: (input?: { passphrase?: string }) => ipcRenderer.invoke("profiles:preview-import", input) as Promise<ProfileImportPreview | null>,
  confirmImport: (input: { path: string; passphrase?: string }) => ipcRenderer.invoke("profiles:confirm-import", input) as Promise<ProfileExportResult>,
  openProfileFolder: (input: ProfileActionInput) => ipcRenderer.invoke("profiles:open-folder", input) as Promise<void>,
  openLogDirectory: () => ipcRenderer.invoke("system:open-log-directory") as Promise<void>,
  browseExecutable: () => ipcRenderer.invoke("system:browse-executable") as Promise<string | null>,
  checkForUpdates: () => ipcRenderer.invoke("system:check-updates") as Promise<string>,
  needsPassphrase: () => ipcRenderer.invoke("security:needs-passphrase") as Promise<boolean>,
  unlock: (input: { passphrase: string }) => ipcRenderer.invoke("security:unlock", input) as Promise<boolean>,
  focusProfile: (listener) => {
    const handler = (_event: IpcRendererEvent, input: ProfileActionInput) => listener(input);
    ipcRenderer.on("profile:focus", handler);
    return () => ipcRenderer.off("profile:focus", handler);
  },
  stateChanged: (listener) => {
    const handler = () => listener();
    ipcRenderer.on("state:changed", handler);
    return () => ipcRenderer.off("state:changed", handler);
  },
  setTheme: (theme: "light" | "dark") => {
    ipcRenderer.send("system:set-theme", { theme });
  }
};

contextBridge.exposeInMainWorld("profileSwitcher", api);
