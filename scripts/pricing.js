#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PRICING_PATH = path.join(__dirname, '..', 'data', 'pricing.json');

let _pricingData = null;

function loadPricing() {
  if (!_pricingData) {
    _pricingData = JSON.parse(fs.readFileSync(PRICING_PATH, 'utf8'));
  }
  return _pricingData;
}

function getModelPricing(modelId) {
  const data = loadPricing();
  if (!modelId) return data.models[data.default_model];

  const id = modelId.toLowerCase();
  // Exact match
  if (data.models[id]) return data.models[id];
  // Partial match — find longest matching key
  const matches = Object.keys(data.models)
    .filter(k => id.includes(k) || k.includes(id))
    .sort((a, b) => b.length - a.length);
  return matches.length > 0 ? data.models[matches[0]] : data.models[data.default_model];
}

function estimateCost(inputTokens, outputTokens, modelId) {
  const pricing = getModelPricing(modelId || 'claude-sonnet-4-6');
  const inputCost = (inputTokens / 1_000_000) * pricing.input_per_million;
  const outputCost = (outputTokens / 1_000_000) * pricing.output_per_million;
  return { inputCost, outputCost, totalCost: inputCost + outputCost, model: pricing.name };
}

function compareModels(inputTokens, outputTokens) {
  const data = loadPricing();
  const results = [];
  for (const [id, m] of Object.entries(data.models)) {
    if (m.tier === 'legacy') continue; // Skip legacy in comparisons
    const inputCost = (inputTokens / 1_000_000) * m.input_per_million;
    const outputCost = (outputTokens / 1_000_000) * m.output_per_million;
    results.push({
      id,
      name: m.name,
      tier: m.tier,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost
    });
  }
  return results.sort((a, b) => a.totalCost - b.totalCost);
}

function formatModelComparison(inputTokens, outputTokens, currentModel) {
  const models = compareModels(inputTokens, outputTokens);
  const currentId = (currentModel || 'claude-sonnet-4-6').toLowerCase();

  const lines = [];
  lines.push('');
  lines.push('  Model                              Input    Output     Total');
  lines.push('  ' + '─'.repeat(62));

  for (const m of models) {
    const isCurrent = currentId.includes(m.id) || m.id.includes(currentId);
    const marker = isCurrent ? ' ← current' : '';
    const name = m.name.padEnd(33);
    const inp = `$${m.inputCost.toFixed(2)}`.padStart(8);
    const out = `$${m.outputCost.toFixed(2)}`.padStart(8);
    const tot = `$${m.totalCost.toFixed(2)}`.padStart(9);
    lines.push(`  ${name} ${inp}  ${out}  ${tot}${marker}`);
  }

  // Savings comparison
  const cheapest = models[0];
  const current = models.find(m => currentId.includes(m.id) || m.id.includes(currentId)) || models[1];
  if (cheapest.id !== (current?.id || '') && current) {
    const savings = ((1 - cheapest.totalCost / current.totalCost) * 100).toFixed(0);
    lines.push('');
    lines.push(`  💡 ${cheapest.name} would be ${savings}% cheaper`);
  }

  lines.push('');
  return lines.join('\n');
}

function charsToTokens(chars) {
  return Math.ceil(chars / loadPricing().chars_per_token);
}

function listModels() {
  const data = loadPricing();
  const results = [];
  for (const [id, m] of Object.entries(data.models)) {
    results.push({ id, ...m });
  }
  return results;
}

module.exports = { loadPricing, getModelPricing, estimateCost, charsToTokens, compareModels, formatModelComparison, listModels };

if (require.main === module) {
  const [,, cmd, ...args] = process.argv;
  if (cmd === 'estimate') {
    const [input, output, model] = args;
    console.log(JSON.stringify(estimateCost(Number(input), Number(output), model)));
  } else if (cmd === 'compare') {
    const [input, output, current] = args;
    console.log(formatModelComparison(Number(input), Number(output), current));
  } else if (cmd === 'list') {
    const models = listModels();
    for (const m of models) {
      const tier = m.tier ? ` (${m.tier})` : '';
      console.log(`${m.id}: $${m.input_per_million}/M in, $${m.output_per_million}/M out${tier}`);
    }
  }
}
