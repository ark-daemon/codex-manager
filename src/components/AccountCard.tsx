import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, Pencil, RefreshCw, Trash2, MoreVertical, Archive } from "lucide-react";
import { ProfileSummary } from "../shared/types";
import { copyForLanguage, formatMessage } from "../i18n";
import { displayPrimaryLabel, statusForProfile, availablePools, getBarColor, formatResetCountdown, formatRelativeTime, getAccountPlan } from "../ui-utils";

type UiCopy = ReturnType<typeof copyForLanguage>;

interface AccountCardProps {
  profile: ProfileSummary;
  selected: boolean;
  bulkSelected: boolean;
  copy: UiCopy;
  isCompact: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onToggleSelected: () => void;
  onSelect: () => void;
  onSwitch: () => void;
  onRefresh: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onBackup: () => void;
  onOpenFolder: () => void;
}

export const AccountCard = memo(function AccountCard({
  profile,
  selected,
  bulkSelected,
  copy,
  menuOpen,
  onMenuOpenChange,
  onToggleSelected,
  onSelect,
  onSwitch,
  onRefresh,
  onRename,
  onDelete,
  onBackup,
  onOpenFolder
}: AccountCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(profile.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [, setTick] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Re-render relative reset countdowns every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      setConfirmDelete(false);
      return;
    }
    function handleOutsideClick(e: MouseEvent) {
      if (!(e.target instanceof Node)) return;
      const target = e.target;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        menuButtonRef.current && !menuButtonRef.current.contains(target)
      ) {
        onMenuOpenChange(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuOpen, onMenuOpenChange]);

  const status = statusForProfile(profile);
  const pools = availablePools(profile.usage);
  const primaryPool = pools.find(p => p.id.includes("five"))
    || pools.find(p => p.id.includes("weekly"))
    || pools[0];
  const hasMultiplePools = pools.length > 1;
  const percent = primaryPool && primaryPool.remaining !== undefined && primaryPool.limit !== undefined && primaryPool.limit > 0
    ? (primaryPool.remaining / primaryPool.limit) * 100
    : 0;
  const isRateLimited = status === "limited"
    || (primaryPool && (primaryPool.status === "exhausted" || (Number.isFinite(primaryPool.remaining) && (primaryPool.remaining ?? 0) <= 0)));
  const barColor = primaryPool ? getBarColor(percent, isRateLimited) : undefined;
  const isCriticalBar = isRateLimited || (primaryPool && percent <= 5);
  const visiblePercent = percent <= 0 ? 0 : isCriticalBar ? Math.max(percent, 3) : percent;

  const criticalTrackStyle = isCriticalBar
    ? { background: "rgba(245, 158, 11, 0.16)", borderColor: "rgba(245, 158, 11, 0.4)" }
    : undefined;

  const badgeStatus = profile.isActive
    ? "active"
    : isRateLimited
    ? "limited"
    : status === "ready" || status === "unknown" || !profile.usage
    ? "ready"
    : status;

  function handleSwitch(e: React.MouseEvent) {
    e.stopPropagation();
    onSwitch();
  }

  function handleCardClick() {
    onSelect();
    onToggleSelected();
  }

  function handleMenuToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!menuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      const MENU_WIDTH = 180;
      const MENU_HEIGHT = 102;
      const GAP = 4;
      const spaceBelow = window.innerHeight - rect.bottom;
      const opensAbove = spaceBelow < MENU_HEIGHT + GAP;
      const top = opensAbove
        ? Math.max(GAP, rect.top - MENU_HEIGHT - GAP)
        : rect.bottom + GAP;
      const left = rect.left + MENU_WIDTH + GAP > window.innerWidth
        ? Math.max(GAP, rect.right - MENU_WIDTH)
        : rect.left;
      setMenuPos({ top, left });
    } else {
      setMenuPos(null);
    }
    onMenuOpenChange(!menuOpen);
  }

  function toggleRename(e: React.MouseEvent) {
    e.stopPropagation();
    if (renaming) {
      setRenaming(false);
    } else {
      setNewName(profile.name);
      setRenaming(true);
      onMenuOpenChange(false);
    }
  }

  function confirmRename(e: React.SyntheticEvent) {
    e.stopPropagation();
    if (newName.trim() && newName.trim() !== profile.name) {
      onRename(newName.trim());
    }
    setRenaming(false);
  }

  function cancelRename(e: React.SyntheticEvent) {
    e.stopPropagation();
    setRenaming(false);
  }

  const menuPortal = menuOpen && menuPos && globalThis.document !== undefined
    ? createPortal(
      <div
        ref={menuRef}
        className="card-menu"
        style={{
          position: "fixed",
          top: `${menuPos.top}px`,
          left: `${menuPos.left}px`,
          zIndex: 9999
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <button onClick={() => { onMenuOpenChange(false); onRefresh(); }}>
          <RefreshCw size={13} /> {copy.actions.refresh}
        </button>
        <button onClick={toggleRename}>
          <Pencil size={13} /> {copy.actions.rename}
        </button>
        <button onClick={() => { onMenuOpenChange(false); onBackup(); }}>
          <Archive size={13} /> {copy.actions.backup}
        </button>
        <button onClick={() => { onMenuOpenChange(false); onOpenFolder(); }}>
          <FolderOpen size={13} /> {copy.actions.openFolder}
        </button>
        {!confirmDelete ? (
          <button
            className="danger menu-delete-row"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={13} /> {copy.actions.delete}
          </button>
        ) : (
          <div className="card-menu-delete-confirm">
            <span>{copy.accounts.deleteConfirm}</span>
            <div className="card-menu-delete-confirm-actions">
              <button className="danger" onClick={() => { onMenuOpenChange(false); onDelete(); }}>{copy.actions.yes}</button>
              <button onClick={() => setConfirmDelete(false)}>{copy.actions.no}</button>
            </div>
          </div>
        )}
      </div>,
      document.body
    )
    : null;

  return (
    <div
      className={`card account-card ${profile.isActive ? "is-active-account" : ""} ${selected ? "selected-profile" : ""} ${bulkSelected ? "bulk-selected" : ""}`}
      onClick={handleCardClick}
    >
      <div className="card-header">
        <div className="card-selection">
          <input
            type="checkbox"
            checked={bulkSelected}
            onChange={onToggleSelected}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${profile.name}`}
          />
        </div>

        <div className="card-identity">
          {renaming ? (
            <div className="card-rename-field" onClick={(e) => e.stopPropagation()}>
              <label htmlFor={`rename-input-${profile.id}`} style={{ display: "none" }}>{copy.login.profileName}</label>
              <input
                id={`rename-input-${profile.id}`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmRename(e);
                  if (e.key === "Escape") cancelRename(e);
                }}
              />
              <button className="confirm" onClick={confirmRename}>✓</button>
              <button className="cancel" onClick={cancelRename}>✗</button>
            </div>
          ) : (
            <h4
              className="profile-display-name clickable-title"
              onClick={toggleRename}
              title="Click to rename"
            >
              {displayPrimaryLabel(profile)}
            </h4>
          )}
          {profile.email && <span className="profile-email">{profile.email}</span>}
        </div>

        <div className="card-header-badges">
          {getAccountPlan(profile) !== "Free" && (
            <span className="plan-badge">{getAccountPlan(profile)}</span>
          )}
          <span className={`status-badge ${badgeStatus}`}>
            <span className="status-badge-dot" />
            <span>{profile.isActive ? copy.status.active : copy.status[badgeStatus]}</span>
          </span>
        </div>
      </div>

      <div className="card-body">
        {profile.usage ? (
          profile.usage.status === "available" ? (
            primaryPool ? (
              <div className="quota-minimal-row">
                <div className="quota-info">
                  <span className="quota-pool-label">
                    {primaryPool.label}
                    {hasMultiplePools && (
                      <span className="quota-multiple-indicator">
                        {" "}
                        ({formatMessage(copy.accounts.otherLimits, { count: pools.length - 1 })})
                      </span>
                    )}
                  </span>
                  <span
                    className="quota-pool-numbers quota-value"
                    style={barColor ? { color: barColor } : undefined}
                  >
                    {primaryPool.remaining !== undefined && primaryPool.limit !== undefined
                      ? `${Math.round(percent)}%`
                      : copy.quota.unavailable}
                  </span>
                </div>
                {primaryPool.remaining !== undefined && primaryPool.limit !== undefined && (
                  <div className="quota-progress-track bar" style={criticalTrackStyle}>
                    <span
                      className="quota-progress-fill"
                      style={{
                        width: `${visiblePercent}%`,
                        background: barColor
                      }}
                    />
                  </div>
                )}
                <div className="quota-meta-row">
                  {primaryPool.resetAt ? (
                    <span className="quota-reset-text">
                      {formatResetCountdown(primaryPool.resetAt)}
                    </span>
                  ) : <span />}
                  {profile.isActive ? (
                    <span className="quota-last-used active-now">Active now</span>
                  ) : profile.lastUsedAt ? (
                    <span className="quota-last-used">
                      Used {formatRelativeTime(profile.lastUsedAt)}
                    </span>
                  ) : profile.updatedAt ? (
                    <span className="quota-last-used">
                      Updated {formatRelativeTime(profile.updatedAt)}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="quota-status-text muted">{copy.stats.activeQuota}: {copy.stats.none}</div>
            )
          ) : (
            <div className="quota-status-text error">
              {profile.usage.message === "Token expired"
                ? copy.status.expired
                : copy.quota.unavailable}
            </div>
          )
        ) : (
          <div className="quota-status-text muted">{copy.quota.unavailable}</div>
        )}
      </div>

      <div className="card-footer-row">
        {profile.isActive ? (
          <div className="card-active-strip">
            <span className="card-active-dot" />
            <span className="card-active-label">ACTIVE SESSION</span>
          </div>
        ) : (
          <button className="card-use-button primary-use-btn" onClick={handleSwitch}>
            USE
          </button>
        )}
        <div className="card-icon-actions">
          <div className="card-actions-menu">
            <button
              ref={menuButtonRef}
              className="icon-action-btn"
              onClick={handleMenuToggle}
              aria-label={`More actions for ${displayPrimaryLabel(profile)}`}
              title="More actions"
            >
              <MoreVertical size={15} />
            </button>
            {menuPortal}
          </div>
        </div>
      </div>
    </div>
  );
});
