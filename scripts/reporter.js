#!/usr/bin/env node
const store = require('./store');

const W = 48; // inner width between ║ chars

function bar(value, maxValue, width = 20) {
  if (maxValue === 0) return ' '.repeat(width);
  const ratio = Math.min(value / maxValue, 1);
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
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

function pad(str, len) {
  // Pad string to exact visual width
  const visual = [...str].length;
  return str + ' '.repeat(Math.max(0, len - visual));
}

function line(content) {
  return `║  ${pad(content, W - 4)}  ║`;
}

function sep() {
  return '╠' + '═'.repeat(W) + '╣';
}

function sessionReport(sessionId) {
  const cost = store.getSessionCost(sessionId);
  const tokens = store.getSessionTokens(sessionId);
  const startTime = store.getSessionStart(sessionId);
  const config = store.loadConfig();
  const budget = config.budgets?.session;

  let elapsed = 0;
  if (startTime) {
    elapsed = (Date.now() - new Date(startTime + 'Z').getTime()) / 1000 / 60;
  }
  const burnRate = elapsed > 0 ? cost / elapsed : 0;

  const out = [];
  out.push('');
  out.push('╔' + '═'.repeat(W) + '╗');
  out.push('║' + '  COST GUARDIAN — Session Report'.padEnd(W) + '║');
  out.push(sep());
  out.push(line(`Total Cost:     ${formatCost(cost)}`));
  out.push(line(`Total Tokens:   ${formatTokens(tokens)}`));
  out.push(line(`Duration:       ${elapsed.toFixed(1)} min`));
  out.push(line(`Burn Rate:      ${formatCost(burnRate)}/min`));

  if (budget) {
    const pct = budget.limit > 0 ? Math.min((cost / budget.limit) * 100, 100) : 0;
    out.push(sep());
    out.push(line(`Budget:  ${formatCost(budget.limit)} (${budget.mode})`));
    out.push(line(`Used:    ${bar(cost, budget.limit, 24)} ${pct.toFixed(0).padStart(3)}%`));
    out.push(line(`Left:    ${formatCost(Math.max(0, budget.limit - cost))}`));
    if (burnRate > 0) {
      const minsLeft = (budget.limit - cost) / burnRate;
      out.push(line(`ETA:     ${minsLeft > 0 ? `~${minsLeft.toFixed(0)} min until limit` : 'EXCEEDED!'}`));
    }
  }

  const tools = store.getToolBreakdown(sessionId);
  if (tools.length > 0) {
    const maxCost = Math.max(...tools.map(t => t.cost));
    out.push(sep());
    out.push(line('Per-Tool Breakdown'));
    out.push(sep());
    for (const t of tools.slice(0, 8)) {
      const name = t.tool.padEnd(10).slice(0, 10);
      const b = bar(t.cost, maxCost, 14);
      const c = formatCost(t.cost).padStart(6);
      const n = String(t.count).padStart(3);
      out.push(line(`${name} ${b} ${c} ${n}x`));
    }
  }

  out.push('╚' + '═'.repeat(W) + '╝');
  out.push('');
  return out.join('\n');
}

function dailyReport(days = 7) {
  const breakdown = store.getDailyBreakdown(days);
  const dailyCost = store.getDailyCost();
  const weeklyCost = store.getWeeklyCost();
  const monthlyCost = store.getMonthlyCost();
  const config = store.loadConfig();
  const budgets = config.budgets || {};

  const out = [];
  out.push('');
  out.push('╔' + '═'.repeat(W) + '╗');
  out.push('║' + '  COST GUARDIAN — Usage Report'.padEnd(W) + '║');
  out.push(sep());
  out.push(line(`Today:       ${formatCost(dailyCost)}`));
  out.push(line(`This Week:   ${formatCost(weeklyCost)}`));
  out.push(line(`This Month:  ${formatCost(monthlyCost)}`));

  out.push(sep());
  out.push(line('Budget Status'));
  out.push(sep());
  if (budgets.daily) {
    const pct = Math.min((dailyCost / budgets.daily.limit) * 100, 100);
    out.push(line(`Daily   ${bar(dailyCost, budgets.daily.limit, 20)} ${pct.toFixed(0).padStart(3)}% of ${formatCost(budgets.daily.limit)}`));
  }
  if (budgets.weekly) {
    const pct = Math.min((weeklyCost / budgets.weekly.limit) * 100, 100);
    out.push(line(`Weekly  ${bar(weeklyCost, budgets.weekly.limit, 20)} ${pct.toFixed(0).padStart(3)}% of ${formatCost(budgets.weekly.limit)}`));
  }
  if (budgets.monthly) {
    const pct = Math.min((monthlyCost / budgets.monthly.limit) * 100, 100);
    out.push(line(`Monthly ${bar(monthlyCost, budgets.monthly.limit, 20)} ${pct.toFixed(0).padStart(3)}% of ${formatCost(budgets.monthly.limit)}`));
  }

  if (breakdown.length > 0) {
    const maxCost = Math.max(...breakdown.map(d => d.cost));
    out.push(sep());
    out.push(line(`Daily Spend (last ${days} days)`));
    out.push(sep());
    for (const d of breakdown) {
      const dateShort = d.date.slice(5);
      const b = bar(d.cost, maxCost, 22);
      out.push(line(`${dateShort}  ${b} ${formatCost(d.cost).padStart(7)}`));
    }
  }

  if (breakdown.length >= 2) {
    const recent = breakdown.slice(-3).reduce((s, d) => s + d.cost, 0) / Math.min(3, breakdown.length);
    const older = breakdown.slice(0, -3).reduce((s, d) => s + d.cost, 0) / Math.max(1, breakdown.length - 3);
    if (older > 0) {
      const change = ((recent - older) / older * 100).toFixed(0);
      const arrow = recent > older ? '↑' : '↓';
      out.push(sep());
      out.push(line(`Trend: ${arrow} ${Math.abs(change)}% vs prior period`));
    }
  }

  out.push('╚' + '═'.repeat(W) + '╝');
  out.push('');
  return out.join('\n');
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
