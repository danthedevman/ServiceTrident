import React from 'react';

/** Keep related metrics on one responsive surface without changing their drill-down actions. */
export function ScoreGroup({ children }) {
  return (
    <div
      className="dashboard-scores panel"
      aria-label="Dashboard metrics"
      style={{ '--score-columns': Math.min(React.Children.count(children), 5) }}
    >
      {children}
    </div>
  );
}
