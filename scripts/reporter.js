#!/usr/bin/env node
const store = require('./store');

const BAR_CHARS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];

function bar(value, maxValue, width = 30) {
  if (maxValue === 0) return '';
  const ratio = Math.min(value / maxValue, 1);
  const full = Math.floor(ratio * width);
  const frac = Math.floor((ratio * width - full) * 8);
  return '█'.repeat(full) + (frac > 0 ? BAR_CHARS[frac] : '') + ' '.repeat(Math.max(0, width - full - 1));
}

function formatCost(usd) {
  if (usd < 0.01) return `$${(usd * 100).toFixed(2)}c`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function sessionReport(sessionId) {
  const cost = store.getSessionCost(sessionId);
  const tokens = store.getSessionTokens(sessionId);
  const startTime = store.getSessionStart(sessionId);
  const config = store.loadConfig();
  const budget = config.budgets?.session;

  let elapsed = 0;
  if (startTime) {
    elapsed = (Date.now() - new Date(startTime + 'Z').getTime()) / 1000 / 60; // minutes
  }
  const burnRate = elapsed > 0 ? cost / elapsed : 0;

  const lines = [];
  lines.push('');
  lines.push('╔══════════════════════════════════════════════╗');
  lines.push('║          COST GUARDIAN — Session Report      ║');
  lines.push('╠══════════════════════════════════════════════╣');
  lines.push(`║  Total Cost:     ${formatCost(cost).padEnd(28)}║`);
  lines.push(`║  Total Tokens:   ${formatTokens(tokens).padEnd(28)}║`);
  lines.push(`║  Duration:       ${elapsed.toFixed(1).padEnd(24)} min ║`);
  lines.push(`║  Burn Rate:      ${formatCost(burnRate).padEnd(24)}/min ║`);

  if (budget) {
    const pct = budget.limit > 0 ? Math.min((cost / budget.limit) * 100, 100) : 0;
    lines.push('╠══════════════════════════════════════════════╣');
    lines.push(`║  Budget:         ${formatCost(budget.limit).padEnd(24)} (${budget.mode}) ║`);
    lines.push(`║  Used:           ${bar(cost, budget.limit, 20)} ${pct.toFixed(0).padStart(3)}%  ║`);
    lines.push(`║  Remaining:      ${formatCost(Math.max(0, budget.limit - cost)).padEnd(28)}║`);
    if (burnRate > 0) {
      const minsLeft = (budget.limit - cost) / burnRate;
      lines.push(`║  Time to limit:  ${minsLeft > 0 ? `~${minsLeft.toFixed(0)} min` : 'EXCEEDED'} ${''.padEnd(Math.max(0, 22 - (minsLeft > 0 ? `~${minsLeft.toFixed(0)} min`.length : 8)))}║`);
    }
  }

  // Tool breakdown
  const tools = store.getToolBreakdown(sessionId);
  if (tools.length > 0) {
    const maxCost = Math.max(...tools.map(t => t.cost));
    lines.push('╠══════════════════════════════════════════════╣');
    lines.push('║  Per-Tool Breakdown                          ║');
    lines.push('╠══════════════════════════════════════════════╣');
    for (const t of tools.slice(0, 8)) {
      const name = t.tool.padEnd(12).slice(0, 12);
      const b = bar(t.cost, maxCost, 15);
      lines.push(`║  ${name} ${b} ${formatCost(t.cost).padStart(7)} (${String(t.count).padStart(3)}x) ║`);
    }
  }

  lines.push('╚══════════════════════════════════════════════╝');
  lines.push('');
  return lines.join('\n');
}

function dailyReport(days = 7) {
  const breakdown = store.getDailyBreakdown(days);
  const dailyCost = store.getDailyCost();
  const weeklyCost = store.getWeeklyCost();
  const monthlyCost = store.getMonthlyCost();
  const config = store.loadConfig();

  const lines = [];
  lines.push('');
  lines.push('╔══════════════════════════════════════════════╗');
  lines.push('║         COST GUARDIAN — Usage Report         ║');
  lines.push('╠══════════════════════════════════════════════╣');
  lines.push(`║  Today:          ${formatCost(dailyCost).padEnd(28)}║`);
  lines.push(`║  This Week:      ${formatCost(weeklyCost).padEnd(28)}║`);
  lines.push(`║  This Month:     ${formatCost(monthlyCost).padEnd(28)}║`);

  // Budget status
  const budgets = config.budgets || {};
  lines.push('╠══════════════════════════════════════════════╣');
  lines.push('║  Budget Status                               ║');
  lines.push('╠══════════════════════════════════════════════╣');
  if (budgets.daily) {
    const pct = Math.min((dailyCost / budgets.daily.limit) * 100, 100);
    lines.push(`║  Daily:   ${bar(dailyCost, budgets.daily.limit, 20)} ${pct.toFixed(0).padStart(3)}% of ${formatCost(budgets.daily.limit)} ║`);
  }
  if (budgets.weekly) {
    const pct = Math.min((weeklyCost / budgets.weekly.limit) * 100, 100);
    lines.push(`║  Weekly:  ${bar(weeklyCost, budgets.weekly.limit, 20)} ${pct.toFixed(0).padStart(3)}% of ${formatCost(budgets.weekly.limit)} ║`);
  }
  if (budgets.monthly) {
    const pct = Math.min((monthlyCost / budgets.monthly.limit) * 100, 100);
    lines.push(`║  Monthly: ${bar(monthlyCost, budgets.monthly.limit, 20)} ${pct.toFixed(0).padStart(3)}% of ${formatCost(budgets.monthly.limit)} ║`);
  }

  // Daily chart
  if (breakdown.length > 0) {
    const maxCost = Math.max(...breakdown.map(d => d.cost));
    lines.push('╠══════════════════════════════════════════════╣');
    lines.push('║  Daily Spend (last ' + String(days).padEnd(2) + ' days)                 ║');
    lines.push('╠══════════════════════════════════════════════╣');
    for (const d of breakdown) {
      const dateShort = d.date.slice(5); // MM-DD
      const b = bar(d.cost, maxCost, 22);
      lines.push(`║  ${dateShort} ${b} ${formatCost(d.cost).padStart(7)} ║`);
    }
  }

  // Trend
  if (breakdown.length >= 2) {
    const recent = breakdown.slice(-3).reduce((s, d) => s + d.cost, 0) / Math.min(3, breakdown.length);
    const older = breakdown.slice(0, -3).reduce((s, d) => s + d.cost, 0) / Math.max(1, breakdown.length - 3);
    if (older > 0) {
      const change = ((recent - older) / older * 100).toFixed(0);
      const arrow = recent > older ? '↑' : '↓';
      lines.push('╠══════════════════════════════════════════════╣');
      lines.push(`║  Trend: ${arrow} ${Math.abs(change)}% vs prior period ${''.padEnd(Math.max(0, 20 - Math.abs(change).toString().length))}║`);
    }
  }

  lines.push('╚══════════════════════════════════════════════╝');
  lines.push('');
  return lines.join('\n');
}

function statusLine(sessionId) {
  const cost = store.getSessionCost(sessionId);
  const tokens = store.getSessionTokens(sessionId);
  const startTime = store.getSessionStart(sessionId);

  let burnRate = 0;
  if (startTime) {
    const elapsed = (Date.now() - new Date(startTime + 'Z').getTime()) / 1000 / 60;
    burnRate = elapsed > 0 ? cost / elapsed : 0;
  }

  return `${formatCost(cost)} | ${formatTokens(tokens)} tok | ~${formatCost(burnRate)}/min`;
}

module.exports = { sessionReport, dailyReport, statusLine, formatCost, formatTokens };

if (require.main === module) {
  const [,, cmd, ...args] = process.argv;
  switch (cmd) {
    case 'session': console.log(sessionReport(args[0] || 'unknown')); break;
    case 'daily': console.log(dailyReport(parseInt(args[0]) || 7)); break;
    case 'status': console.log(statusLine(args[0] || 'unknown')); break;
    default: console.log('Commands: session <id>, daily [days], status <id>');
  }
}
