import { memo } from "react";
import { buildStats } from "../ui-utils";
import { copyForLanguage } from "../i18n";
import { clampPercent, getBarColor } from "../ui-utils";

type UiCopy = ReturnType<typeof copyForLanguage>;

interface StatsBarProps {
  stats: ReturnType<typeof buildStats>;
  copy: UiCopy;
}

export const StatsBar = memo(function StatsBar({ stats, copy }: StatsBarProps) {
  const percent = stats.globalQuotaPercent ?? 0;

  return (
    <div className="stats-bar">
      <div className="stat-box">
        <span>{copy.stats.active}</span>
        <strong>{stats.active}</strong>
      </div>
      <div className="stat-box">
        <span>{copy.stats.total}</span>
        <strong>{stats.total}</strong>
      </div>
      <div className="stat-box">
        <span>{copy.stats.rateLimited}</span>
        <strong className={stats.rateLimited > 0 ? "warning-text" : ""}>
          {stats.rateLimited}
        </strong>
      </div>
      <div className="stat-box wide global-quota-stat">
        <span>{copy.stats.globalQuota}</span>
        {stats.globalQuotaPercent !== undefined ? (
          <strong>{Math.round(stats.globalQuotaPercent)}%</strong>
        ) : (
          <strong>—</strong>
        )}
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
