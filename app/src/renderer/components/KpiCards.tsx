import type { DashboardSummary } from '../../shared/types';
import { ago, fmt } from './ui';

interface Props {
  summary: DashboardSummary | null;
  windowLabel: string;
}

export default function KpiCards({ summary, windowLabel }: Props) {
  if (!summary) return null;

  const delta = summary.deltaPct;
  const deltaText =
    delta === null ? 'no prior data' : `${delta > 0 ? '+' : ''}${delta}% vs previous ${windowLabel.toLowerCase()}`;
  const deltaClass = delta === null || delta === 0 ? 'stat-sub' : delta > 0 ? 'stat-sub pos' : 'stat-sub neg';

  return (
    <div className="stats">
      <div className="stat">
        <div className="label">Commits · {windowLabel}</div>
        <div className="stat-value">{fmt(summary.windowTotal)}</div>
        <div className={deltaClass}>{deltaText}</div>
      </div>

      <div className="stat">
        <div className="label">This year</div>
        <div className="stat-value">{fmt(summary.yearTotal)}</div>
        <div className="stat-sub">{new Date().getFullYear()} to date</div>
      </div>

      <div className="stat">
        <div className="label">All time</div>
        <div className="stat-value">{fmt(summary.lifetimeTotal)}</div>
        <div className="stat-sub">total contributions recorded</div>
      </div>

      <div className="stat">
        <div className="label">Avg / student</div>
        <div className="stat-value">{fmt(summary.avgPerStudent)}</div>
        <div className="stat-sub">median {fmt(summary.medianPerStudent)}</div>
      </div>

      <div className="stat">
        <div className="label">Inactive</div>
        <div className="stat-value">{fmt(summary.inactiveInWindow)}</div>
        <div className="stat-sub">
          of {summary.studentCount} · zero commits in {windowLabel.toLowerCase()}
        </div>
      </div>

      <div className="stat">
        <div className="label">Last refresh</div>
        <div className="stat-value" style={{ fontSize: 'var(--fs-lg)' }}>
          {ago(summary.lastRefreshAt)}
        </div>
        <div className="stat-sub">{summary.studentCount} students tracked</div>
      </div>
    </div>
  );
}
