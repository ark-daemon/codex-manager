import { memo } from "react";
import { buildStats } from "../ui-utils";
import { copyForLanguage } from "../i18n";
import { clampPercent, getBarColor } from "../ui-utils";

type UiCopy = ReturnType<typeof copyForLanguage>;

interface StatsBarProps {
  stats: ReturnType<typeof buildStats>;
  copy: UiCopy;
  filterStatus?: "all" | "ready" | "limited";
  onFilterChange?: (status: "all" | "ready" | "limited") => void;
}

export const StatsBar = memo(function StatsBar({ stats, copy, filterStatus = "all", onFilterChange }: StatsBarProps) {
  const percent = stats.lowestRemainingPercent ?? stats.globalQuotaPercent ?? 0;

  return (
    <div className="stats-bar">
      <div
        className={`stat-box clickable ${filterStatus === "all" ? "active" : ""}`}
        onClick={() => onFilterChange?.("all")}
        title="Show all accounts"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onFilterChange?.("all"); }}
      >
        <strong>{stats.total}</strong>
        <span>{copy.stats.total}</span>
      </div>
      <div
        className={`stat-box clickable ${filterStatus === "ready" ? "active" : ""}`}
        onClick={() => onFilterChange?.("ready")}
        title="Filter ready accounts"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onFilterChange?.("ready"); }}
      >
        <strong className="ready-stat-text">{stats.ready}</strong>
        <span>{copy.stats.ready}</span>
      </div>
      <div
        className={`stat-box clickable ${filterStatus === "limited" ? "active" : ""}`}
        onClick={() => onFilterChange?.("limited")}
        title="Filter rate-limited accounts"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onFilterChange?.("limited"); }}
      >
        <strong className={stats.rateLimited > 0 ? "warning-text" : ""}>
          {stats.rateLimited}
        </strong>
        <span>{copy.stats.rateLimited}</span>
      </div>
      <div className="stat-box wide global-quota-stat">
        <div className="stat-header">
          <strong>{stats.lowestRemainingPercent !== undefined ? `${Math.round(stats.lowestRemainingPercent)}%` : "—"}</strong>
          <span>{copy.stats.lowestRemaining}</span>
        </div>
        <div className="global-quota-bar-track">
          <div
            className="global-quota-bar"
            style={{
              width: `${clampPercent(percent)}%`,
              backgroundColor: getBarColor(percent, false)
            }}
          />
        </div>
      </div>
    </div>
  );
});
