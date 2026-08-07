import { useMemo, useState } from "react";
import { Download, Import, Plus, RefreshCw, Search, Trash2, Upload, BarChart2, ChevronDown, ChevronUp, Filter } from "lucide-react";
import { AppState, ProfileSummary } from "../shared/types";
import { copyForLanguage, formatMessage } from "../i18n";
import { availablePools, buildStats, displayPrimaryLabel, formatResetCountdown, getBarColor, statusForProfile } from "../ui-utils";
import { StatsBar } from "./StatsBar";
import { AccountCard } from "./AccountCard";
import { quotaPercent } from "../shared/utils";

type UiCopy = ReturnType<typeof copyForLanguage>;
type SortOption = "remaining" | "name" | "lastUsed" | "resetTime" | "readyFirst";
type FilterOption = "all" | "ready" | "limited" | "active";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("remaining");
  const [filterStatus, setFilterStatus] = useState<FilterOption>("all");
  const [showTimeline, setShowTimeline] = useState(false);

  function handleDeleteSelected() {
    if (selectedCount === 0) return;
    const confirmed = window.confirm(
      selectedCount === 1
        ? copy.accounts.deleteOneConfirm
        : formatMessage(copy.accounts.deleteManyConfirm, { count: selectedCount })
    );
    if (confirmed) {
      void onDeleteSelectedProfiles();
    }
  }

  const processedProfiles = useMemo(() => {
    let list = [...state.profiles];

    // 1. Search Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter((p) =>
        displayPrimaryLabel(p).toLowerCase().includes(query) ||
        (p.email && p.email.toLowerCase().includes(query))
      );
    }

    // 2. Status Filter
    if (filterStatus !== "all") {
      list = list.filter((p) => {
        const st = statusForProfile(p);
        if (filterStatus === "active") return p.isActive;
        if (filterStatus === "ready") return st === "ready";
        if (filterStatus === "limited") return st === "limited";
        return true;
      });
    }

    // 3. Sorting (Pin Active Account first by default)
    list.sort((a, b) => {
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }
      if (sortBy === "remaining") {
        const qA = quotaPercent(a.usage) ?? -1;
        const qB = quotaPercent(b.usage) ?? -1;
        return qB - qA;
      }
      if (sortBy === "name") {
        return displayPrimaryLabel(a).localeCompare(displayPrimaryLabel(b));
      }
      if (sortBy === "lastUsed") {
        const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tB - tA;
      }
      if (sortBy === "readyFirst") {
        const stA = statusForProfile(a);
        const stB = statusForProfile(b);
        if (stA === "ready" && stB !== "ready") return -1;
        if (stB === "ready" && stA !== "ready") return 1;
      }
      return 0;
    });

    return list;
  }, [state.profiles, searchQuery, filterStatus, sortBy]);

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
          title={copy.accounts.refreshAllQuotas}
          disabled={refreshingAll}
          aria-busy={refreshingAll}
        >
          <RefreshCw className={refreshingAll ? "spin-icon" : undefined} size={18} />
        </button>
      </header>

      {/* Main Controls Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left-actions">
          <button className="primary-action-btn" aria-label={copy.actions.addAccount} title={copy.actions.addAccount} onClick={() => void onCreateProfile()}>
            <Plus size={15} /> {copy.actions.add}
          </button>
          
          <button aria-label={copy.messages.syncFromApp} title={copy.messages.syncFromApp} onClick={() => void onSyncFromApp()}>
            <Download size={15} /> {copy.actions.sync}
          </button>

          <button aria-label={copy.messages.exportProfiles} title={copy.messages.exportProfiles} onClick={() => void onExportProfiles()}>
            <Upload size={15} /> {copy.actions.export}
          </button>

          <button aria-label={copy.messages.importProfiles} title={copy.messages.importProfiles} onClick={() => void onImportProfiles()}>
            <Import size={15} /> {copy.actions.import}
          </button>
        </div>

        {/* Search Bar */}
        <div className="toolbar-search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Search accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search accounts"
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery("")}>×</button>
          )}
        </div>

        {/* Filters & Sort */}
        <div className="toolbar-filters">
          <div className="filter-pill-group">
            <button
              className={`filter-pill ${filterStatus === "all" ? "active" : ""}`}
              onClick={() => setFilterStatus("all")}
            >
              All
            </button>
            <button
              className={`filter-pill ${filterStatus === "ready" ? "active" : ""}`}
              onClick={() => setFilterStatus("ready")}
            >
              Ready
            </button>
            <button
              className={`filter-pill ${filterStatus === "limited" ? "active" : ""}`}
              onClick={() => setFilterStatus("limited")}
            >
              Rate Limited
            </button>
            <button
              className={`filter-pill ${filterStatus === "active" ? "active" : ""}`}
              onClick={() => setFilterStatus("active")}
            >
              Active
            </button>
          </div>

          <div className="sort-dropdown-container">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="sort-select"
              aria-label="Sort accounts"
            >
              <option value="remaining">Sort: Remaining Quota</option>
              <option value="name">Sort: Name</option>
              <option value="readyFirst">Sort: Ready First</option>
              <option value="lastUsed">Sort: Last Used</option>
            </select>
          </div>
        </div>

        {/* Contextual Multi-Select Controls */}
        <div className="toolbar-right-actions">
          {selectedCount > 0 && (
            <button 
              className="bulk-delete-button danger-action"
              aria-label={copy.messages.deleteSelected}
              onClick={handleDeleteSelected}
            >
              <Trash2 size={14} /> {copy.actions.delete} ({selectedCount})
            </button>
          )}
          
          {state.profiles.length > 0 && (
            <button 
              className="select-all-btn"
              aria-label={allSelected ? copy.actions.clearSelection : copy.actions.selectAll}
              onClick={onToggleAllAccounts}
            >
              {allSelected ? copy.actions.clear : copy.actions.selectAll}
            </button>
          )}
        </div>
      </div>

      {/* Account Cards Grid */}
      {processedProfiles.length === 0 ? (
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
          <p className="empty-state-title">
            {searchQuery || filterStatus !== "all"
              ? "No accounts match your search/filter criteria."
              : copy.accounts.empty}
          </p>
          <p className="empty-state-description">
            {searchQuery || filterStatus !== "all"
              ? "Try clearing filters or changing your search terms."
              : copy.accounts.emptyHint}
          </p>
          <button
            className="empty-state-cta"
            onClick={() => {
              if (searchQuery || filterStatus !== "all") {
                setSearchQuery("");
                setFilterStatus("all");
              } else {
                void onCreateProfile();
              }
            }}
          >
            <Plus size={16} /> {searchQuery || filterStatus !== "all" ? "Clear Filters" : copy.actions.addAccount}
          </button>
        </div>
      ) : (
        <div className="account-grid">
          {processedProfiles.map((profile) => (
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
