#!/usr/bin/env node
/**
 * insights.js — Waste detection, efficiency scoring, ROI metrics,
 * model savings calculator, and anomaly detection.
 *
 * Features no other tool has:
 * 1. Efficiency Score (0-100) with waste breakdown
 * 2. Cost-per-line-of-code ROI
 * 3. Model routing savings calculator
 * 4. Anomaly detection (spike alerts)
 * 5. GitHub badge generator
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const { estimateCost, compareModels, loadPricing } = require('./pricing');

// ============================================================
// 1. WASTE DETECTION & EFFICIENCY SCORE
// ============================================================

function analyzeWaste(sessionId) {
  store.initDb();

  // Get all tool calls for this session
  const rawData = store.sql(
    `SELECT tool_name || '\t' || est_input_tokens || '\t' || est_output_tokens || '\t' || est_cost_usd || '\t' || input_chars || '\t' || output_chars FROM usage WHERE session_id = ? ORDER BY id`,
    sessionId
  );

  if (!rawData) return { score: 100, wastes: [], totalWaste: 0, totalCost: 0 };

  const calls = rawData.split('\n').filter(Boolean).map(line => {
    const [tool, inTok, outTok, cost, inChars, outChars] = line.split('\t');
    return { tool, inTok: +inTok, outTok: +outTok, cost: +cost, inChars: +inChars, outChars: +outChars };
  });

  const totalCost = calls.reduce((s, c) => s + c.cost, 0);
  if (totalCost === 0) return { score: 100, wastes: [], totalWaste: 0, totalCost: 0 };

  const wastes = [];
  let totalWaste = 0;

  // Detect redundant reads (same-size reads likely same file)
  const readSigs = {};
  for (const c of calls) {
    if (c.tool === 'Read') {
      const sig = `${c.outChars}`; // Same output size = likely same file
      readSigs[sig] = (readSigs[sig] || 0) + 1;
    }
  }
  let redundantReads = 0;
  let redundantReadCost = 0;
  for (const [sig, count] of Object.entries(readSigs)) {
    if (count > 2) {
      redundantReads += count - 1;
      // Estimate cost of redundant reads
      const matchingCalls = calls.filter(c => c.tool === 'Read' && `${c.outChars}` === sig);
      redundantReadCost += matchingCalls.slice(1).reduce((s, c) => s + c.cost, 0);
    }
  }
  if (redundantReads > 0) {
    wastes.push({ type: 'redundant_reads', count: redundantReads, cost: redundantReadCost, msg: `${redundantReads} redundant file reads` });
    totalWaste += redundantReadCost;
  }

  // Detect failed/empty bash commands (zero output)
  const failedBash = calls.filter(c => c.tool === 'Bash' && c.outChars < 5);
  if (failedBash.length > 0) {
    const failCost = failedBash.reduce((s, c) => s + c.cost, 0);
    wastes.push({ type: 'failed_commands', count: failedBash.length, cost: failCost, msg: `${failedBash.length} failed/empty bash commands` });
    totalWaste += failCost;
  }

  // Detect expensive agent calls (>3x average cost)
  const avgCost = totalCost / calls.length;
  const expensiveCalls = calls.filter(c => c.cost > avgCost * 3);
  if (expensiveCalls.length > 0) {
    const expCost = expensiveCalls.reduce((s, c) => s + c.cost, 0) - (avgCost * 3 * expensiveCalls.length);
    if (expCost > 0) {
      wastes.push({ type: 'expensive_outliers', count: expensiveCalls.length, cost: Math.max(0, expCost), msg: `${expensiveCalls.length} calls were 3x+ more expensive than average` });
      totalWaste += Math.max(0, expCost);
    }
  }

  // Detect rapid repeated tool calls (same tool <2s apart = likely retries)
  let retryCount = 0;
  let retryCost = 0;
  for (let i = 1; i < calls.length; i++) {
    if (calls[i].tool === calls[i - 1].tool && calls[i].tool === 'Bash' && calls[i].inChars === calls[i - 1].inChars) {
      retryCount++;
      retryCost += calls[i].cost;
    }
  }
  if (retryCount > 0) {
    wastes.push({ type: 'retries', count: retryCount, cost: retryCost, msg: `${retryCount} likely retry attempts` });
    totalWaste += retryCost;
  }

  // Calculate efficiency score (100 = no waste, 0 = all waste)
  const wastePercent = totalCost > 0 ? (totalWaste / totalCost) * 100 : 0;
  const score = Math.max(0, Math.round(100 - wastePercent));

  return { score, wastes, totalWaste, totalCost, callCount: calls.length };
}

// ============================================================
// 2. COST-PER-LINE ROI METRICS
// ============================================================

function calculateROI(sessionId) {
  const cost = store.getSessionCost(sessionId);

  // Get git diff stats for current branch
  let linesAdded = 0, linesRemoved = 0, filesChanged = 0;
  try {
    const diff = execSync('git diff --stat HEAD~1 2>/dev/null || git diff --stat 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    const lines = diff.split('\n');
    for (const line of lines) {
      const match = line.match(/(\d+) insertions?\(\+\)/);
      const match2 = line.match(/(\d+) deletions?\(-\)/);
      const match3 = line.match(/(\d+) files? changed/);
      if (match) linesAdded += parseInt(match[1]);
      if (match2) linesRemoved += parseInt(match2[1]);
      if (match3) filesChanged += parseInt(match3[1]);
    }
  } catch {}

  // Get commit count during this session (approximate)
  let commits = 0;
  try {
    const startTime = store.getSessionStart(sessionId);
    if (startTime) {
      const count = execSync(`git rev-list --count --since="${startTime}" HEAD 2>/dev/null`, { encoding: 'utf8', timeout: 3000 }).trim();
      commits = parseInt(count) || 0;
    }
  } catch {}

  const totalLines = linesAdded + linesRemoved;
  const costPerLine = totalLines > 0 ? cost / totalLines : 0;
  const costPerCommit = commits > 0 ? cost / commits : 0;

  return {
    cost,
    linesAdded,
    linesRemoved,
    totalLines,
    filesChanged,
    commits,
    costPerLine,
    costPerCommit,
  };
}

// ============================================================
// 3. MODEL SAVINGS CALCULATOR
// ============================================================

function calculateSavings(sessionId) {
  store.initDb();

  const totalTokensRaw = store.sql(
    `SELECT COALESCE(SUM(est_input_tokens), 0) || '\t' || COALESCE(SUM(est_output_tokens), 0) || '\t' || model FROM usage WHERE session_id = ? GROUP BY model`,
    sessionId
  );

  if (!totalTokensRaw) return { models: [], currentCost: 0, cheapestCost: 0, savings: 0, savingsPercent: 0 };

  let totalInput = 0, totalOutput = 0;
  const modelUsage = [];

  for (const line of totalTokensRaw.split('\n').filter(Boolean)) {
    const [inp, out, model] = line.split('\t');
    totalInput += parseInt(inp);
    totalOutput += parseInt(out);
    modelUsage.push({ model, inputTokens: parseInt(inp), outputTokens: parseInt(out) });
  }

  const allModels = compareModels(totalInput, totalOutput);
  const currentCost = store.getSessionCost(sessionId);
  const cheapest = allModels[0];
  const savings = currentCost - cheapest.totalCost;
  const savingsPercent = currentCost > 0 ? Math.round((savings / currentCost) * 100) : 0;

  return {
    models: allModels,
    currentCost,
    cheapestCost: cheapest.totalCost,
    cheapestModel: cheapest.name,
    savings,
    savingsPercent,
    totalInput,
    totalOutput
  };
}

// ============================================================
// 4. ANOMALY DETECTION
// ============================================================

function detectAnomalies(sessionId) {
  store.initDb();

  // Get current session cost
  const currentCost = store.getSessionCost(sessionId);
  if (currentCost === 0) return { isAnomaly: false };

  // Get rolling 7-day average session cost
  const avgResult = store.sql(
    `SELECT AVG(total) FROM (SELECT session_id, SUM(est_cost_usd) as total FROM usage WHERE timestamp >= datetime('now', '-7 days') AND session_id != ? GROUP BY session_id)`,
    sessionId
  );
  const avgCost = parseFloat(avgResult) || 0;

  if (avgCost === 0) return { isAnomaly: false, currentCost, avgCost: 0 };

  const ratio = currentCost / avgCost;
  const isAnomaly = ratio > 2.0;
  const severity = ratio > 5 ? 'critical' : ratio > 3 ? 'high' : ratio > 2 ? 'warning' : 'normal';

  // Find top cost driver
  const topTool = store.sql(
    `SELECT tool_name || '\t' || SUM(est_cost_usd) || '\t' || COUNT(*) FROM usage WHERE session_id = ? GROUP BY tool_name ORDER BY SUM(est_cost_usd) DESC LIMIT 1`,
    sessionId
  );
  let topDriver = { tool: 'unknown', cost: 0, count: 0 };
  if (topTool) {
    const [tool, cost, count] = topTool.split('\t');
    topDriver = { tool, cost: parseFloat(cost), count: parseInt(count) };
  }

  return {
    isAnomaly,
    severity,
    currentCost,
    avgCost,
    ratio: Math.round(ratio * 10) / 10,
    topDriver
  };
}

// ============================================================
// 5. GITHUB BADGE GENERATOR
// ============================================================

function generateBadge(scope) {
  let cost;
  let label;

  switch (scope) {
    case 'daily': cost = store.getDailyCost(); label = 'AI Cost (today)'; break;
    case 'weekly': cost = store.getWeeklyCost(); label = 'AI Cost (week)'; break;
    case 'monthly': cost = store.getMonthlyCost(); label = 'AI Cost (month)'; break;
    default: cost = store.getMonthlyCost(); label = 'AI Dev Cost'; break;
  }

  const costStr = cost < 1 ? `${(cost * 100).toFixed(0)}c` : `$${cost.toFixed(0)}`;
  const color = cost < 10 ? '2ea44f' : cost < 50 ? 'dfb317' : cost < 200 ? 'e05d44' : 'cc0000';
  const badge = `![${label}](https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(costStr)}-${color})`;
  const badgeUrl = `https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(costStr)}-${color}`;

  return { badge, badgeUrl, cost, label };
}

// ============================================================
// FORMAT REPORTS
// ============================================================

function formatInsightsReport(sessionId) {
  const waste = analyzeWaste(sessionId);
  const roi = calculateROI(sessionId);
  const savings = calculateSavings(sessionId);
  const anomaly = detectAnomalies(sessionId);

  const W = 56;
  const pad = (s, l) => s + ' '.repeat(Math.max(0, l - s.length));
  const line = (c) => `║  ${pad(c, W - 4)}  ║`;
  const sep = () => '╠' + '═'.repeat(W) + '╣';
  const hdr = (t) => '║' + `  ${t}`.padEnd(W) + '║';

  const out = [];
  out.push('');
  out.push('╔' + '═'.repeat(W) + '╗');
  out.push(hdr('COST GUARDIAN — Insights Report'));

  // Efficiency Score
  out.push(sep());
  out.push(line(`Efficiency Score: ${waste.score}/100`));
  const scoreBar = '█'.repeat(Math.round(waste.score / 5)) + '░'.repeat(20 - Math.round(waste.score / 5));
  out.push(line(`${scoreBar} ${waste.score >= 80 ? 'Great' : waste.score >= 60 ? 'Good' : waste.score >= 40 ? 'Needs Work' : 'Poor'}`));
  if (waste.totalWaste > 0) {
    out.push(line(`Wasted: $${waste.totalWaste.toFixed(2)} of $${waste.totalCost.toFixed(2)} (${Math.round(waste.totalWaste / waste.totalCost * 100)}%)`));
  }
  if (waste.wastes.length > 0) {
    out.push(sep());
    out.push(line('Waste Breakdown'));
    out.push(sep());
    for (const w of waste.wastes) {
      out.push(line(`  ${w.msg} ($${w.cost.toFixed(2)})`));
    }
  }

  // ROI
  if (roi.totalLines > 0 || roi.commits > 0) {
    out.push(sep());
    out.push(line('ROI Metrics'));
    out.push(sep());
    if (roi.totalLines > 0) out.push(line(`Cost per line:    $${roi.costPerLine.toFixed(4)}/line`));
    if (roi.linesAdded > 0) out.push(line(`Lines added:      +${roi.linesAdded}`));
    if (roi.linesRemoved > 0) out.push(line(`Lines removed:    -${roi.linesRemoved}`));
    if (roi.filesChanged > 0) out.push(line(`Files changed:    ${roi.filesChanged}`));
    if (roi.commits > 0) out.push(line(`Cost per commit:  $${roi.costPerCommit.toFixed(2)}/commit`));
  }

  // Model Savings
  if (savings.savings > 0) {
    out.push(sep());
    out.push(line('Model Savings Opportunity'));
    out.push(sep());
    out.push(line(`Current spend:    $${savings.currentCost.toFixed(2)}`));
    out.push(line(`Cheapest option:  $${savings.cheapestCost.toFixed(2)} (${savings.cheapestModel})`));
    out.push(line(`Potential saving: $${savings.savings.toFixed(2)} (${savings.savingsPercent}% cheaper)`));
  }

  // Anomaly
  if (anomaly.isAnomaly) {
    out.push(sep());
    const icon = anomaly.severity === 'critical' ? '🚨' : anomaly.severity === 'high' ? '⚠️' : '📊';
    out.push(line(`${icon} ANOMALY: ${anomaly.ratio}x your average session cost`));
    out.push(line(`This session: $${anomaly.currentCost.toFixed(2)} | Average: $${anomaly.avgCost.toFixed(2)}`));
    out.push(line(`Top driver: ${anomaly.topDriver.tool} ($${anomaly.topDriver.cost.toFixed(2)}, ${anomaly.topDriver.count}x)`));
  }

  out.push('╚' + '═'.repeat(W) + '╝');
  out.push('');
  return out.join('\n');
}

module.exports = {
  analyzeWaste, calculateROI, calculateSavings,
  detectAnomalies, generateBadge, formatInsightsReport
};

if (require.main === module) {
  const [,, cmd, ...args] = process.argv;
  const sessionId = args[0] || process.env.CLAUDE_SESSION_ID || 'unknown';

  switch (cmd) {
    case 'insights':
    case 'report':
      console.log(formatInsightsReport(sessionId));
      break;
    case 'waste':
      console.log(JSON.stringify(analyzeWaste(sessionId), null, 2));
      break;
    case 'roi':
      console.log(JSON.stringify(calculateROI(sessionId), null, 2));
      break;
    case 'savings':
      console.log(JSON.stringify(calculateSavings(sessionId), null, 2));
      break;
    case 'anomaly':
      console.log(JSON.stringify(detectAnomalies(sessionId), null, 2));
      break;
    case 'badge': {
      const scope = args[0] || 'monthly';
      const b = generateBadge(scope);
      console.log(`Badge markdown: ${b.badge}`);
      console.log(`Badge URL: ${b.badgeUrl}`);
      break;
    }
    default:
      console.log('Commands: insights <id>, waste <id>, roi <id>, savings <id>, anomaly <id>, badge [daily|weekly|monthly]');
  }
}
