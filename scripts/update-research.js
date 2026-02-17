#!/usr/bin/env node
/**
 * Continuum Intelligence — Automated Research Update
 *
 * Mechanical daily recalculation of research metrics from data/stocks/*.json:
 *
 *   1. Recalculate survival scores based on price movements and evidence decay
 *   2. Detect narrative flips (dominant hypothesis changes)
 *   3. Update freshness timestamps and urgency scores
 *   4. Update the "Updated" date for each stock
 *   5. Write changes back to stock JSONs and inject into index.html
 *
 * No LLM calls. Pure rule-based computation.
 *
 * Usage:
 *   node scripts/update-research.js
 *   node scripts/update-research.js --dry-run
 *   node scripts/update-research.js --ticker WOW
 */

const fs = require('fs');
const path = require('path');
const { findLatestPrices } = require('./find-latest-prices');

const STOCKS_DIR = path.join(__dirname, '..', 'data', 'stocks');
const INDEX_PATH = path.join(__dirname, '..', 'index.html');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TICKER_FILTER = args.includes('--ticker') ? args[args.indexOf('--ticker') + 1] : null;

// ══════════════════════════════════════════════════════════════════════
// SURVIVAL SCORE ENGINE
// ══════════════════════════════════════════════════════════════════════

/**
 * Recalculate survival scores for each hypothesis based on:
 * - Price movement vs hypothesis prediction direction
 * - Evidence decay (time-weighted evidence freshness)
 * - Price dislocation (large moves shift probability mass)
 *
 * Returns new scores as { T1: score, T2: score, ... } where scores sum to ~1.0
 */
function recalculateSurvivalScores(stock, currentPrice) {
  const hyps = stock.hypotheses;
  if (!hyps || Object.keys(hyps).length === 0) return null;

  const now = new Date();
  const scores = {};
  let totalRawScore = 0;

  for (const [key, hyp] of Object.entries(hyps)) {
    let rawScore = hyp.survival_score || 0.25;

    // ── 1. Evidence decay ────────────────────────────────────────
    // If hypothesis hasn't been updated recently, its confidence decays
    if (hyp.last_updated) {
      const lastUpdated = new Date(hyp.last_updated);
      const daysSinceUpdate = Math.max(0, (now - lastUpdated) / (1000 * 60 * 60 * 24));

      // Gentle decay: lose ~5% confidence per week after 14 days
      if (daysSinceUpdate > 14) {
        const weeksStale = (daysSinceUpdate - 14) / 7;
        const decayFactor = Math.max(0.5, 1 - (weeksStale * 0.05));
        rawScore *= decayFactor;
      }
    }

    // ── 2. Evidence item decay ───────────────────────────────────
    // Decay individual evidence items and adjust hypothesis score
    if (stock.evidence_items && stock.evidence_items.length > 0) {
      let evidenceBoost = 0;
      for (const ev of stock.evidence_items) {
        if (!ev.active || !ev.hypothesis_impact) continue;

        const impact = ev.hypothesis_impact[key];
        if (!impact) continue;

        // Calculate evidence weight based on age
        const evDate = new Date(ev.date);
        const evAgeDays = Math.max(0, (now - evDate) / (1000 * 60 * 60 * 24));
        const fullWeightDays = (ev.decay && ev.decay.full_weight_days) || 90;
        const halfLifeDays = (ev.decay && ev.decay.half_life_days) || 120;

        let weight = 1.0;
        if (evAgeDays > fullWeightDays) {
          const decayDays = evAgeDays - fullWeightDays;
          weight = Math.pow(0.5, decayDays / halfLifeDays);
        }

        // Apply diagnosticity multiplier
        const diagMult = ev.diagnosticity === 'HIGH' ? 1.5 :
                         ev.diagnosticity === 'MEDIUM' ? 1.0 : 0.5;

        // Impact on this hypothesis
        if (impact === 'CONSISTENT') evidenceBoost += 0.02 * weight * diagMult;
        else if (impact === 'INCONSISTENT') evidenceBoost -= 0.02 * weight * diagMult;
        // NEUTRAL has no effect
      }
      rawScore = Math.max(0.05, Math.min(0.95, rawScore + evidenceBoost));
    }

    // ── 3. Price dislocation impact ──────────────────────────────
    // Large price moves shift probability toward risk/downside hypotheses
    if (currentPrice && stock.current_price) {
      const reviewPrice = stock.freshness && stock.freshness.priceAtReview
        ? stock.freshness.priceAtReview
        : stock.current_price;
      const pctMove = ((currentPrice - reviewPrice) / reviewPrice) * 100;

      // Labels that suggest upside/recovery
      const label = (hyp.label || '').toLowerCase();
      const isUpsideHyp = label.includes('growth') || label.includes('recovery') ||
                           label.includes('turnaround') || label.includes('expansion');
      const isDownsideHyp = label.includes('risk') || label.includes('downside') ||
                              label.includes('compression') || label.includes('erosion') ||
                              label.includes('decline') || label.includes('squeeze');
      const isDisruptionHyp = label.includes('disruption') || label.includes('disrupt');

      if (pctMove < -10) {
        // Major drawdown: boost downside/disruption, penalise upside
        if (isUpsideHyp) rawScore *= 0.85;
        if (isDownsideHyp) rawScore *= 1.15;
        if (isDisruptionHyp) rawScore *= 1.10;
      } else if (pctMove < -5) {
        if (isUpsideHyp) rawScore *= 0.92;
        if (isDownsideHyp) rawScore *= 1.08;
      } else if (pctMove > 10) {
        // Strong rally: boost upside, penalise downside
        if (isUpsideHyp) rawScore *= 1.15;
        if (isDownsideHyp) rawScore *= 0.85;
      } else if (pctMove > 5) {
        if (isUpsideHyp) rawScore *= 1.08;
        if (isDownsideHyp) rawScore *= 0.92;
      }
    }

    rawScore = Math.max(0.05, Math.min(0.95, rawScore));
    scores[key] = rawScore;
    totalRawScore += rawScore;
  }

  // Normalise so all scores sum to 1.0
  if (totalRawScore > 0) {
    for (const key of Object.keys(scores)) {
      scores[key] = Math.round(scores[key] / totalRawScore * 100) / 100;
    }
  }

  return scores;
}

/**
 * Determine the dominant hypothesis (highest survival score).
 * Returns { dominant, confidence, flipped, oldDominant }
 */
function determineDominant(scores, currentDominant) {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const newDominant = sorted[0][0];
  const topScore = sorted[0][1];
  const secondScore = sorted.length > 1 ? sorted[1][1] : 0;
  const gap = topScore - secondScore;

  const confidence = gap >= 0.15 ? 'HIGH' :
                     gap >= 0.08 ? 'MODERATE' : 'LOW';

  const flipped = currentDominant && newDominant !== currentDominant;

  return { dominant: newDominant, confidence, flipped, oldDominant: currentDominant };
}

/**
 * Determine status label from survival score
 */
function scoreToStatus(score) {
  if (score >= 0.6) return 'HIGH';
  if (score >= 0.4) return 'MODERATE';
  if (score >= 0.2) return 'LOW';
  return 'VERY_LOW';
}

// ══════════════════════════════════════════════════════════════════════
// FRESHNESS UPDATE
// ══════════════════════════════════════════════════════════════════════

function updateFreshness(stock, currentPrice) {
  const now = new Date();
  const freshness = stock.freshness || {};

  // Update days since review
  if (freshness.reviewDate) {
    // reviewDate could be "10 February 2026" or ISO format
    let reviewDate;
    if (freshness.reviewDate.includes('T') || freshness.reviewDate.includes('-')) {
      reviewDate = new Date(freshness.reviewDate);
    } else {
      reviewDate = new Date(freshness.reviewDate + ' GMT+1100');
    }

    if (!isNaN(reviewDate.getTime())) {
      freshness.daysSinceReview = Math.floor((now - reviewDate) / (1000 * 60 * 60 * 24));
    }
  }

  // Update price change since review
  if (currentPrice && freshness.priceAtReview) {
    freshness.pricePctChange = Math.round(
      ((currentPrice - freshness.priceAtReview) / freshness.priceAtReview) * 1000
    ) / 10;
  }

  // Recalculate urgency
  const daysSince = freshness.daysSinceReview || 0;
  const absPctChange = Math.abs(freshness.pricePctChange || 0);
  let urgency = 0;

  if (absPctChange > 15) urgency += 40;
  else if (absPctChange > 10) urgency += 30;
  else if (absPctChange > 5) urgency += 20;
  else if (absPctChange > 3) urgency += 10;

  if (daysSince > 30) urgency += 30;
  else if (daysSince > 14) urgency += 20;
  else if (daysSince > 7) urgency += 10;

  if (freshness.nearestCatalystDays !== null && freshness.nearestCatalystDays !== undefined) {
    if (freshness.nearestCatalystDays <= 0) urgency += 25;
    else if (freshness.nearestCatalystDays <= 3) urgency += 20;
    else if (freshness.nearestCatalystDays <= 7) urgency += 10;
  }

  freshness.urgency = Math.min(urgency, 100);
  freshness.status = urgency >= 50 ? 'CRITICAL' :
                      urgency >= 35 ? 'HIGH' :
                      urgency >= 20 ? 'MODERATE' : 'OK';
  freshness.badge = freshness.status.toLowerCase();

  return freshness;
}

// ══════════════════════════════════════════════════════════════════════
// INDEX.HTML INJECTION
// ══════════════════════════════════════════════════════════════════════

/**
 * Update the FRESHNESS_DATA block in index.html with current values
 * from all stock JSONs.
 */
function updateFreshnessInHtml(html, allFreshness) {
  // Find and replace the FRESHNESS_DATA block
  const startRegex = /const FRESHNESS_DATA\s*=\s*\{/;
  const startMatch = html.match(startRegex);
  if (!startMatch) {
    console.log('  ⚠ Could not find FRESHNESS_DATA in index.html');
    return html;
  }

  const startIdx = startMatch.index;
  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx + startMatch[0].length - 1; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) { endIdx = i + 1; break; }
    }
  }
  if (endIdx === -1) return html;

  // Build replacement
  const replacement = 'const FRESHNESS_DATA = ' + JSON.stringify(allFreshness, null, 2);
  return html.substring(0, startIdx) + replacement + html.substring(endIdx);
}

/**
 * Update the verdict scores in a STOCK_DATA block in index.html.
 * Updates the score percentage values to match recalculated survival scores.
 */
function updateVerdictScoresInHtml(html, ticker, newScores) {
  // Find the STOCK_DATA.TICKER block
  const blockRegex = new RegExp(`STOCK_DATA\\.${ticker}\\s*=\\s*\\{`);
  const blockMatch = html.match(blockRegex);
  if (!blockMatch) return html;

  // Find the verdict.scores section within this block
  // Look for "score: 'XX%'" patterns within the ticker block
  const blockStart = blockMatch.index;

  // Find end of this STOCK_DATA block
  let depth = 0;
  let blockEnd = blockStart;
  for (let i = blockStart + blockMatch[0].length - 1; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) { blockEnd = i + 1; break; }
    }
  }

  let block = html.substring(blockStart, blockEnd);

  // Update scores in verdict section
  const scoreKeys = Object.keys(newScores);
  scoreKeys.forEach((key, idx) => {
    const pct = Math.round(newScores[key] * 100);
    // Match patterns like: score: '50%'  or  scoreWidth: '50%'
    // Only update within the verdict.scores array entries (index-based)
    const scorePattern = new RegExp(
      `(\\{[^}]*tier:\\s*'t${idx + 1}'[^}]*score:\\s*')\\d+(%')`,
    );
    block = block.replace(scorePattern, `$1${pct}$2`);

    // Also update scoreWidth
    const widthPattern = new RegExp(
      `(\\{[^}]*tier:\\s*'t${idx + 1}'[^}]*scoreWidth:\\s*')\\d+(%')`,
    );
    block = block.replace(widthPattern, `$1${pct}$2`);
  });

  return html.substring(0, blockStart) + block + html.substring(blockEnd);
}

/**
 * Update the report date in a STOCK_DATA block.
 */
function updateDateInHtml(html, ticker, newDate) {
  const pattern = new RegExp(
    `(STOCK_DATA\\.${ticker}\\s*=\\s*\\{[\\s\\S]*?date:\\s*')([^']+)(')`
  );
  return html.replace(pattern, `$1${newDate}$3`);
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════

function main() {
  console.log('=== Continuum Intelligence — Automated Research Update ===\n');
  if (DRY_RUN) console.log('  🏃 DRY RUN — no files will be written\n');

  // ── Load prices ────────────────────────────────────────────────
  const priceResult = findLatestPrices('newest');
  if (priceResult) {
    console.log(`  Prices: ${priceResult.source} (${priceResult.file}), updated ${priceResult.updated}`);
  } else {
    console.log('  ⚠ No price data available — using existing prices');
  }

  // ── Load stock JSONs ───────────────────────────────────────────
  if (!fs.existsSync(STOCKS_DIR)) {
    console.error(`  ✗ ${STOCKS_DIR} does not exist. Run extract-stock-data.js first.`);
    process.exit(1);
  }

  const jsonFiles = fs.readdirSync(STOCKS_DIR).filter(f => f.endsWith('.json'));
  console.log(`  Stock JSONs: ${jsonFiles.length}\n`);

  // ── Load index.html ────────────────────────────────────────────
  let html = fs.readFileSync(INDEX_PATH, 'utf8');

  const allFreshness = {};
  let updatedCount = 0;
  let flippedCount = 0;
  const flips = [];
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Australia/Sydney'
  });

  for (const file of jsonFiles) {
    const ticker = file.replace('.json', '');
    if (TICKER_FILTER && ticker !== TICKER_FILTER) continue;

    const filePath = path.join(STOCKS_DIR, file);
    let stock;
    try {
      stock = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`  ✗ ${ticker}: failed to read JSON — ${err.message}`);
      continue;
    }

    // Get current price
    const priceData = priceResult && priceResult.prices[ticker];
    const currentPrice = priceData ? priceData.price : stock.current_price;

    // ── 1. Recalculate survival scores ────────────────────────
    const newScores = recalculateSurvivalScores(stock, currentPrice);
    let scoreChanged = false;

    if (newScores) {
      for (const [key, score] of Object.entries(newScores)) {
        if (stock.hypotheses[key]) {
          const oldScore = stock.hypotheses[key].survival_score;
          const delta = Math.abs(score - oldScore);
          if (delta > 0.005) { // Only update if meaningful change
            stock.hypotheses[key].survival_score = score;
            stock.hypotheses[key].status = scoreToStatus(score);
            stock.hypotheses[key].last_updated = now.toISOString();
            scoreChanged = true;
          }
        }
      }
    }

    // ── 2. Detect narrative flips ─────────────────────────────
    if (newScores) {
      const result = determineDominant(newScores, stock.dominant);

      if (result.flipped) {
        const oldLabel = stock.hypotheses[result.oldDominant]
          ? stock.hypotheses[result.oldDominant].label : result.oldDominant;
        const newLabel = stock.hypotheses[result.dominant]
          ? stock.hypotheses[result.dominant].label : result.dominant;

        // Record the flip
        const flipRecord = {
          date: now.toISOString().split('T')[0],
          from: result.oldDominant,
          to: result.dominant,
          trigger: `Automated: survival score shift (${oldLabel} → ${newLabel})`,
          price_at_flip: currentPrice,
          from_survival: stock.hypotheses[result.oldDominant]
            ? stock.hypotheses[result.oldDominant].survival_score : null,
          to_survival: newScores[result.dominant],
        };

        // Move current last_flip to narrative_history
        if (stock.last_flip) {
          if (!stock.narrative_history) stock.narrative_history = [];
          stock.narrative_history.push(stock.last_flip);
        }

        stock.last_flip = flipRecord;
        stock.dominant = result.dominant;
        stock.confidence = result.confidence;

        flips.push({ ticker, from: result.oldDominant, to: result.dominant, oldLabel, newLabel });
        flippedCount++;

        console.log(`  🔄 ${ticker}: NARRATIVE FLIP — ${result.oldDominant} (${oldLabel}) → ${result.dominant} (${newLabel})`);
      } else {
        stock.dominant = result.dominant;
        stock.confidence = result.confidence;
      }
    }

    // ── 3. Update freshness ───────────────────────────────────
    stock.freshness = updateFreshness(stock, currentPrice);
    allFreshness[ticker] = stock.freshness;

    // ── 4. Update price in JSON ───────────────────────────────
    if (currentPrice) {
      stock.current_price = currentPrice;
    }

    // ── 5. Update last_updated ────────────────────────────────
    stock.last_research_update = now.toISOString();

    // ── 6. Write updated JSON ─────────────────────────────────
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, JSON.stringify(stock, null, 2));
    }

    // ── 7. Update index.html ──────────────────────────────────
    if (newScores) {
      html = updateVerdictScoresInHtml(html, ticker, newScores);
    }
    html = updateDateInHtml(html, ticker, dateStr);

    // Log
    const scoresStr = newScores
      ? Object.entries(newScores).map(([k, v]) => `${k}:${Math.round(v * 100)}%`).join(' ')
      : 'no scores';
    const freshStr = stock.freshness.status !== 'OK' ? ` [${stock.freshness.status}]` : '';
    console.log(`  ✓ ${ticker}: ${scoresStr}${freshStr}`);

    updatedCount++;
  }

  // ── Update FRESHNESS_DATA in index.html ────────────────────────
  html = updateFreshnessInHtml(html, allFreshness);

  // ── Write index.html ───────────────────────────────────────────
  if (!DRY_RUN) {
    fs.writeFileSync(INDEX_PATH, html);
    console.log(`\n  ✓ Updated index.html with new dates and scores`);
  }

  // ── Summary ────────────────────────────────────────────────────
  console.log(`\n=== Summary ===`);
  console.log(`  Stocks updated: ${updatedCount}`);
  console.log(`  Narrative flips: ${flippedCount}`);
  if (flips.length > 0) {
    for (const f of flips) {
      console.log(`    🔄 ${f.ticker}: ${f.from} (${f.oldLabel}) → ${f.to} (${f.newLabel})`);
    }
  }
  console.log(`  Updated date: ${dateStr}`);
  if (DRY_RUN) console.log(`  (Dry run — no files written)`);
  console.log('');

  // GitHub Actions summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    let summary = `## 📊 Research Update — ${dateStr}\n\n`;
    summary += `| Metric | Value |\n|--------|-------|\n`;
    summary += `| Stocks updated | ${updatedCount} |\n`;
    summary += `| Narrative flips | ${flippedCount} |\n`;
    if (flips.length > 0) {
      summary += `\n### 🔄 Narrative Flips\n\n`;
      for (const f of flips) {
        summary += `- **${f.ticker}**: ${f.from} (${f.oldLabel}) → ${f.to} (${f.newLabel})\n`;
      }
    }
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}

main();
