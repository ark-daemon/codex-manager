import { memo } from "react";
import { buildStats, clampPercent, getBarColor } from "../ui-utils";
import { copyForLanguage } from "../i18n";

type UiCopy = ReturnType<typeof copyForLanguage>;

interface StatsBarProps {
  stats: ReturnType<typeof buildStats>;
  copy: UiCopy;
  activeFilter?: "all" | "ready" | "limited" | "active";
  onFilterChange?: (filter: "all" | "ready" | "limited" | "active") => void;
}

export const StatsBar = memo(function StatsBar({
  stats,
  copy,
  activeFilter = "all",
  onFilterChange
}: StatsBarProps) {
  const percent = stats.globalQuotaPercent ?? 0;

  function handleFilterClick(filter: "all" | "ready" | "limited") {
    if (!onFilterChange) return;
    // Clicking active filter resets back to all
    onFilterChange(activeFilter === filter && filter !== "all" ? "all" : filter);
  }

  return (
    <div className="stats-bar" role="toolbar" aria-label="Account status filters">
      <button
        type="button"
        className={`stat-box filter-pill ${activeFilter === "all" ? "active" : ""}`}
        onClick={() => handleFilterClick("all")}
        aria-pressed={activeFilter === "all"}
        title="Show all accounts"
      >
        <strong>{stats.total}</strong>
        <span>{copy.stats.total}</span>
      </button>

      <button
        type="button"
        className={`stat-box filter-pill ${activeFilter === "ready" ? "active" : ""}`}
        onClick={() => handleFilterClick("ready")}
        aria-pressed={activeFilter === "ready"}
        title="Filter ready accounts"
      >
        <strong className="ready-stat-text">{stats.ready}</strong>
        <span>{copy.stats.ready}</span>
      </button>

      <button
        type="button"
        className={`stat-box filter-pill ${activeFilter === "limited" ? "active" : ""}`}
        onClick={() => handleFilterClick("limited")}
        aria-pressed={activeFilter === "limited"}
        title="Filter rate-limited accounts"
      >
        <strong className={stats.rateLimited > 0 ? "warning-text" : ""}>
          {stats.rateLimited}
        </strong>
        <span>{copy.stats.rateLimited}</span>
      </button>

      <div className="stat-box wide global-quota-stat">
        <div className="stat-header">
          <strong>{stats.globalQuotaPercent !== undefined ? `${Math.round(stats.globalQuotaPercent)}%` : "—"}</strong>
          <span>{copy.stats.globalQuota}</span>
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
