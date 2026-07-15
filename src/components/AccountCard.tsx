import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, Pencil, RefreshCw, Trash2, Upload, MoreVertical, X, Archive } from "lucide-react";
import { ProfileSummary } from "../shared/types";
import { copyForLanguage } from "../i18n";
import { displayPrimaryLabel, statusForProfile, availablePools, getBarColor, formatResetCountdown } from "../ui-utils";
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
 const menuRef = useRef<HTMLDivElement>(null);
 const menuButtonRef = useRef<HTMLButtonElement>(null);
 useEffect(() => {
 if (!menuOpen) {
 setConfirmDelete(false);
 return;
 }
 function handleOutsideClick(e: MouseEvent) {
 const target = e.target as Node;
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
 // Find the primary pool to display as the single progress bar
 const primaryPool = pools.find(p => p.id.includes("five"))
 || pools.find(p => p.id.includes("weekly"))
 || pools[0];
 const hasMultiplePools = pools.length > 1;
 const percent = primaryPool && primaryPool.remaining !== undefined && primaryPool.limit !== undefined && primaryPool.limit > 0
 ? (primaryPool.remaining / primaryPool.limit) * 100
 : 0;
 const isRateLimited = status === "limited"
  || (primaryPool && (primaryPool.status === "exhausted" || (typeof primaryPool.remaining === "number" && primaryPool.remaining <= 0)));
 const barColor = primaryPool ? getBarColor(percent, isRateLimited) : undefined;
 const isCriticalBar = isRateLimited || (primaryPool && percent <= 5);
 const visiblePercent = isCriticalBar ? Math.max(percent, 3) : percent;
 // Rate-limited / low quota is a normal cycling state, not a failure, so the
 // empty-bar track is tinted amber (matching the bar) rather than alarm-red.
 const criticalTrackStyle = isCriticalBar
 ? { background: "rgba(245, 158, 11, 0.16)", borderColor: "rgba(245, 158, 11, 0.4)" }
 : undefined;
 // Active profiles normally hide the status badge (footer says "Active Session"),
 // but when quota is exhausted we still show Rate Limited so the card state is obvious.
 const badgeStatus = isRateLimited ? "limited" : status;
 const showStatusBadge = !profile.isActive || isRateLimited;
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
 function confirmRename(e: React.MouseEvent) {
 e.stopPropagation();
 if (newName.trim() && newName.trim() !== profile.name) {
 onRename(newName.trim());
 }
 setRenaming(false);
 }
 function cancelRename(e: React.MouseEvent) {
 e.stopPropagation();
 setRenaming(false);
 }
 const menuPortal = menuOpen && menuPos && typeof document !== "undefined"
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
 <button onClick={() => { onMenuOpenChange(false); onBackup(); }}>
 <Archive size={12} /> {copy.actions.backup}
 </button>
 <button onClick={() => { onMenuOpenChange(false); onOpenFolder(); }}>
 <FolderOpen size={12} /> {copy.actions.openFolder}
 </button>
 {!confirmDelete ? (
 <button
 className="danger menu-delete-row"
 onClick={() => setConfirmDelete(true)}
 >
 <Trash2 size={12} /> {copy.actions.delete}
 </button>
 ) : (
 <div className="card-menu-delete-confirm">
 <span>Really delete?</span>
 <div className="card-menu-delete-confirm-actions">
 <button className="danger" onClick={() => { onMenuOpenChange(false); onDelete(); }}>Yes</button>
 <button onClick={() => setConfirmDelete(false)}>No</button>
 </div>
 </div>
 )}
 </div>,
 document.body
 )
 : null;
 return (
 <div
 className={`card account-card ${selected ? "active-profile" : ""} ${bulkSelected ? "bulk-selected" : ""}`}
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
 <span className={`status-dot ${status}`} />
 </div>
 <div className="card-identity">
 {renaming ? (
 <div className="card-rename-field" onClick={(e) => e.stopPropagation()}>
 <label htmlFor={`rename-input-${profile.id}`} style={{ display: "none" }}>Display name</label>
 <input
 id={`rename-input-${profile.id}`}
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 autoFocus
 onKeyDown={(e) => {
 if (e.key === "Enter") confirmRename(e as any);
 if (e.key === "Escape") cancelRename(e as any);
 }}
 />
 <button className="confirm" onClick={confirmRename}>✓</button>
 <button className="cancel" onClick={cancelRename}>✗</button>
 </div>
 ) : (
 <h4 className="profile-display-name">{displayPrimaryLabel(profile)}</h4>
 )}
 {profile.email && <span className="profile-email">{profile.email}</span>}
 </div>
 {showStatusBadge && (
 <span className={`status-badge ${badgeStatus}`}>
 <span>{copy.status[badgeStatus]}</span>
 </span>
 )}
 </div>
 <div className="card-body">
 {profile.usage ? (
 profile.usage.status === "available" ? (
 primaryPool ? (
 <div className="quota-minimal-row">
 <div className="quota-info">
 <span className="quota-pool-label">
 {primaryPool.label}
 {hasMultiplePools && <span className="quota-multiple-indicator"> (+{pools.length - 1} other limits)</span>}
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
 {primaryPool.resetAt && (
 <div className="quota-reset-text">
 {formatResetCountdown(primaryPool.resetAt)}
 </div>
 )}
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
 <div className="card-footer">
 {profile.isActive ? (
 <div className="card-active-strip">
 <span className="card-active-dot" />
 <span className="card-active-label">Active Session</span>
 </div>
 ) : (
 <button className="card-use-button" onClick={handleSwitch}>
 {copy.actions.use}
 </button>
 )}
 <div className="card-footer-actions">
 <button
 className="card-action-icon-btn"
 onClick={(e) => { e.stopPropagation(); onRefresh(); }}
 title={copy.actions.refresh}
 aria-label={`Refresh ${displayPrimaryLabel(profile)}`}
 >
 <RefreshCw size={14} />
 </button>
 <button
 className="card-action-icon-btn"
 onClick={toggleRename}
 title={copy.actions.rename}
 aria-label={`Rename ${displayPrimaryLabel(profile)}`}
 >
 <Pencil size={14} />
 </button>
 <div className="card-actions-menu">
 <button
 ref={menuButtonRef}
 className="card-menu-trigger"
 onClick={handleMenuToggle}
 aria-label={`More actions for ${displayPrimaryLabel(profile)}`}
 >
 <MoreVertical size={16} />
 </button>
 {menuPortal}
 </div>
 </div>
 </div>
 </div>
 );
});
