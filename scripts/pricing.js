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
  // Try exact match first, then partial match
  if (data.models[modelId]) return data.models[modelId];
  const key = Object.keys(data.models).find(k => modelId.includes(k) || k.includes(modelId));
  return key ? data.models[key] : data.models[data.default_model];
}

function estimateCost(inputTokens, outputTokens, modelId) {
  const pricing = getModelPricing(modelId || 'claude-sonnet-4-6');
  const inputCost = (inputTokens / 1_000_000) * pricing.input_per_million;
  const outputCost = (outputTokens / 1_000_000) * pricing.output_per_million;
  return { inputCost, outputCost, totalCost: inputCost + outputCost, model: pricing.name };
}

function charsToTokens(chars) {
  return Math.ceil(chars / loadPricing().chars_per_token);
}

module.exports = { loadPricing, getModelPricing, estimateCost, charsToTokens };

if (require.main === module) {
  const [,, cmd, ...args] = process.argv;
  if (cmd === 'estimate') {
    const [input, output, model] = args;
    console.log(JSON.stringify(estimateCost(Number(input), Number(output), model)));
  } else if (cmd === 'list') {
    const data = loadPricing();
    for (const [id, m] of Object.entries(data.models)) {
      console.log(`${id}: $${m.input_per_million}/M in, $${m.output_per_million}/M out`);
    }
  }
}
