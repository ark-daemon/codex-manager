import { useState } from "react";
import { Download, Import, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { AppState, ProfileSummary } from "../shared/types";
import { copyForLanguage } from "../i18n";
import { buildStats } from "../ui-utils";
import { StatsBar } from "./StatsBar";
import { AccountCard } from "./AccountCard";

type UiCopy = ReturnType<typeof copyForLanguage>;

interface AccountsPageProps {
  state: AppState;
  copy: UiCopy;
  selectedProfile?: ProfileSummary;
  stats: ReturnType<typeof buildStats>;
  onCreateProfile: () => Promise<void>;
  onSyncFromApp: () => Promise<void>;
  onExportProfiles: () => Promise<void>;
  onImportProfiles: () => Promise<void>;
  onRefreshAll: () => Promise<void>;
  refreshingAll: boolean;
  selectedAccountIds: Set<string>;
  onToggleAccountSelection: (profileId: string) => void;
  onToggleAllAccounts: () => void;
  onDeleteSelectedProfiles: () => Promise<void>;
  onSelectProfile: (profileId: string) => void;
  onSwitchProfile: (profile: ProfileSummary) => Promise<void>;
  onRefreshUsage: (profile: ProfileSummary) => Promise<void>;
  onRenameProfile: (profile: ProfileSummary, name: string) => Promise<void>;
  onDeleteProfile: (profile: ProfileSummary) => Promise<void>;
  onBackupProfile: (profile: ProfileSummary) => Promise<void>;
  onOpenProfileFolder: (profile: ProfileSummary) => void;
}

export function AccountsPage({
  state,
  copy,
  selectedProfile,
  stats,
  onCreateProfile,
  onSyncFromApp,
  onExportProfiles,
  onImportProfiles,
  onRefreshAll,
  refreshingAll,
  selectedAccountIds,
  onToggleAccountSelection,
  onToggleAllAccounts,
  onDeleteSelectedProfiles,
  onSelectProfile,
  onSwitchProfile,
  onRefreshUsage,
  onRenameProfile,
  onDeleteProfile,
  onBackupProfile,
  onOpenProfileFolder
}: AccountsPageProps) {
  const selectedCount = selectedAccountIds.size;
  const allSelected = state.profiles.length > 0 && selectedCount === state.profiles.length;
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  function handleDeleteSelected() {
    if (selectedCount === 0) return;
    const confirmed = window.confirm(
      selectedCount === 1
        ? "Delete 1 account? This cannot be undone."
        : `Delete ${selectedCount} accounts? This cannot be undone.`
    );
    if (confirmed) {
      void onDeleteSelectedProfiles();
    }
  }

  return (
    <section className="panel accounts-panel">
      <header className="page-header">
        <div className="page-header-title">
          <div className="page-title-row">
            <h2>{copy.accounts.title}</h2>
          </div>
          <p>{copy.accounts.description}</p>
        </div>

        <StatsBar stats={stats} copy={copy} />

        <button
          className="icon-button"
          onClick={() => void onRefreshAll()}
          title="Refresh all quotas"
          disabled={refreshingAll}
          aria-busy={refreshingAll}
        >
          <RefreshCw className={refreshingAll ? "spin-icon" : undefined} size={18} />
        </button>
      </header>

      <div className="toolbar">
        <div className="toolbar-actions">
          <button aria-label="Add Account" title="Add account" onClick={() => void onCreateProfile()}>
            <Plus size={16} /> {copy.actions.add}
          </button>
          
          <button aria-label="Sync from App" title="Sync from app" onClick={() => void onSyncFromApp()}>
            <Download size={16} /> {copy.actions.sync}
          </button>

          <button aria-label="Export Profiles" title="Export profiles" onClick={() => void onExportProfiles()}>
            <Upload size={16} /> {copy.actions.export}
          </button>

          <button aria-label="Import Profiles" title="Import profiles" onClick={() => void onImportProfiles()}>
            <Import size={16} /> {copy.actions.import}
          </button>
          
          {state.profiles.length > 0 && (
            <button 
              aria-label={allSelected ? "Clear selection" : "Select all"}
              onClick={onToggleAllAccounts}
            >
              {allSelected ? copy.actions.clear : copy.actions.selectAll}
            </button>
          )}

          {selectedCount > 0 && (
            <button 
              className="bulk-delete-button danger-action"
              aria-label="Delete selected" 
              onClick={handleDeleteSelected}
            >
              <Trash2 size={16} /> {copy.actions.delete} ({selectedCount})
            </button>
          )}
        </div>
      </div>

      {state.profiles.length === 0 ? (
        <div className="empty-state">
          <svg
            className="empty-state-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
            <path d="M4.14 15.08c2.62-1.57 5.24-1.57 7.86 0 2.62 1.57 5.24 1.57 7.86 0" />
          </svg>
          <p className="empty-state-title">{copy.accounts.empty}</p>
          <p className="empty-state-description">
            Add your first Codex account to start switching between profiles.
          </p>
          <button
            className="empty-state-cta"
            onClick={() => void onCreateProfile()}
          >
            <Plus size={16} /> {copy.actions.add} Account
          </button>
        </div>
      ) : (
        <div className="account-grid">
          {state.profiles.map((profile) => (
            <AccountCard
              key={profile.id}
              profile={profile}
              selected={selectedProfile?.id === profile.id}
              bulkSelected={selectedAccountIds.has(profile.id)}
              copy={copy}
              isCompact={false}
              menuOpen={openMenuId === profile.id}
              onMenuOpenChange={(open) => setOpenMenuId(open ? profile.id : null)}
              onToggleSelected={() => onToggleAccountSelection(profile.id)}
              onSelect={() => onSelectProfile(profile.id)}
              onSwitch={() => void onSwitchProfile(profile)}
              onRefresh={() => void onRefreshUsage(profile)}
              onRename={(name) => void onRenameProfile(profile, name)}
              onDelete={() => void onDeleteProfile(profile)}
              onBackup={() => void onBackupProfile(profile)}
              onOpenFolder={() => onOpenProfileFolder(profile)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
