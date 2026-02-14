  const NFI_STYLES = `
  /* Narrative Framework v2.0 Styles - Fixed for Dark Theme */

  /* Dislocation Alert Banner */
  .nfi-alert-banner {
    margin: 16px 0;
    padding: 16px 20px;
    border-radius: 8px;
    font-family: var(--font-ui, system-ui);
    animation: nfi-slide-down 0.3s ease;
    color: #ffffff !important;
  }

  .nfi-alert-critical {
    background: linear-gradient(135deg, #991b1b, #7f1d1d);
    border: 1px solid #dc2626;
  }

  .nfi-alert-high {
    background: linear-gradient(135deg, #92400e, #78350f);
    border: 1px solid #d97706;
  }

  .nfi-alert-moderate {
    background: linear-gradient(135deg, #1e40af, #1e3a8a);
    border: 1px solid #3b82f6;
  }

  @keyframes nfi-slide-down {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .nfi-alert-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }

  .nfi-alert-icon {
    font-size: 1.4rem;
  }

  .nfi-alert-title {
    font-weight: 700;
    font-size: 0.9rem;
    letter-spacing: 0.02em;
    color: #ffffff !important;
  }

  .nfi-alert-metrics {
    font-size: 0.8rem;
    color: rgba(255,255,255,0.85) !important;
    font-family: var(--font-data, monospace);
    margin: 4px 0;
  }

  .nfi-alert-action {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(255,255,255,0.2);
    font-size: 0.8rem;
    color: rgba(255,255,255,0.9) !important;
  }

  .nfi-alert-button {
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    color: #ffffff !important;
    padding: 6px 14px;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    margin-right: 8px;
    margin-top: 8px;
    transition: all 0.2s;
  }

  .nfi-alert-button:hover {
    background: rgba(255,255,255,0.25);
  }

  /* Hypothesis Weight Breakdown */
  .nfi-weight-container {
    margin: 12px 0;
    padding: 12px;
    background: var(--bg-surface-alt, #1a1a2e);
    border-radius: 6px;
    border: 1px solid var(--border, #333);
  }

  .nfi-weight-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .nfi-weight-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted, #888);
    font-weight: 600;
  }

  .nfi-weight-bar-container {
    height: 10px;
    background: var(--bg-surface, #111);
    border-radius: 5px;
    overflow: hidden;
    display: flex;
  }

  .nfi-weight-lt {
    background: var(--accent-teal, #14b8a6);
    transition: width 0.5s ease;
  }

  .nfi-weight-st {
    background: var(--accent-gold, #f59e0b);
    transition: width 0.5s ease;
  }

  .nfi-weight-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-size: 0.7rem;
    color: var(--text-muted, #888);
  }

  /* Divergence Badge */
  .nfi-divergence-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 600;
    margin-left: 8px;
  }

  .nfi-divergence-moderate {
    background: rgba(217, 119, 6, 0.2);
    color: #fbbf24;
    border: 1px solid rgba(217, 119, 6, 0.4);
  }

  .nfi-divergence-major {
    background: rgba(220, 38, 38, 0.2);
    color: #f87171;
    border: 1px solid rgba(220, 38, 38, 0.4);
  }

  .nfi-divergence-critical {
    background: rgba(220, 38, 38, 0.3);
    color: #ef4444;
    border: 1px solid rgba(220, 38, 38, 0.5);
    animation: nfi-pulse 2s infinite;
  }

  @keyframes nfi-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  /* Confidence Indicator */
  .nfi-confidence {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
  }

  .nfi-confidence-high { color: var(--signal-green, #22c55e); }
  .nfi-confidence-medium { color: var(--signal-amber, #f59e0b); }
  .nfi-confidence-low { color: var(--signal-red, #ef4444); }

  /* Market Commentary Box */
  .nfi-commentary-box {
    margin: 16px 0;
    padding: 16px;
    background: var(--bg-surface, #111827);
    border: 1px solid var(--border, #374151);
    border-radius: 8px;
    font-family: var(--font-narrative, Georgia, serif);
    font-size: 0.85rem;
    line-height: 1.7;
    color: var(--text-secondary, #9ca3af);
  }

  .nfi-commentary-box strong {
    color: var(--text-primary, #f3f4f6);
    font-weight: 600;
  }

  /* Price Metrics Mini */
  .nfi-price-mini {
    display: flex;
    gap: 16px;
    padding: 12px 16px;
    background: var(--bg-surface-alt, #1f2937);
    border-radius: 6px;
    margin: 12px 0;
    font-family: var(--font-data, monospace);
    font-size: 0.75rem;
  }

  .nfi-price-metric-label {
    color: var(--text-muted, #6b7280);
    font-size: 0.65rem;
    text-transform: uppercase;
  }

  .nfi-price-metric-value {
    color: var(--text-primary, #f3f4f6);
    font-weight: 600;
  }

  .nfi-price-metric-value.negative {
    color: var(--signal-red, #ef4444);
  }

  .nfi-price-metric-value.positive {
    color: var(--signal-green, #22c55e);
  }
  `;
