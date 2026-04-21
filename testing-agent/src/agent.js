#!/usr/bin/env node
// ── CRM Testing Agent — Main Orchestrator ──────────────────────────────
import { createWriteStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { results } from './runner.js';
import { runInfraTests } from './tests/infra.test.js';
import { runAuthTests } from './tests/auth.test.js';
import { runSecurityTests } from './tests/security.test.js';
import { generateReport } from './report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.join(__dirname, '..', 'reports');

// ── Console Colours (no deps) ───────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function icon(status) {
  return { PASS: `${C.green}✅`, FAIL: `${C.red}❌`, SECURITY: `${C.yellow}🔐`, WARN: `${C.yellow}⚠️` }[status] || '❓';
}

function printResult(r) {
  const ic = icon(r.status);
  const detail = r.detail ? `${C.gray} — ${r.detail}` : '';
  const dur = `${C.gray}(${r.duration}ms)`;
  console.log(`  ${ic} ${C.reset}${r.name}${detail} ${dur}${C.reset}`);
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║        🤖  CRM Testing Agent v1.0                   ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}║     Bugs & Security Audit — Telesales CRM           ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════╝${C.reset}\n`);
  console.log(`${C.gray}  Target: ${process.env.API_URL || 'http://localhost:4000'}${C.reset}\n`);

  const overallStart = Date.now();

  // ── Run test suites ───────────────────────────────────────────────────
  const suites = [
    { label: 'Infrastructure & Health', fn: runInfraTests },
    { label: 'Authentication', fn: runAuthTests },
    { label: 'Security', fn: runSecurityTests },
  ];

  for (const { label, fn } of suites) {
    const beforeCount = results.length;
    console.log(`\n${C.bold}${C.blue}▶  ${label}${C.reset}`);
    await fn();
    const suiteResults = results.slice(beforeCount);
    for (const r of suiteResults) printResult(r);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  const durationMs = Date.now() - overallStart;
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const secIssues = results.filter(r => r.status === 'SECURITY').length;
  const warnings = results.filter(r => r.status === 'WARN').length;
  const score = Math.round((passed / total) * 100);

  console.log(`\n${C.bold}${C.cyan}── Summary ─────────────────────────────────────────────${C.reset}`);
  console.log(`  ${C.green}✅ Passed:          ${passed}/${total}${C.reset}`);
  console.log(`  ${C.red}❌ Failed:          ${failed}${C.reset}`);
  console.log(`  ${C.yellow}🔐 Security Issues: ${secIssues}${C.reset}`);
  console.log(`  ${C.yellow}⚠️  Warnings:        ${warnings}${C.reset}`);
  console.log(`  ${C.cyan}📊 Score:           ${score}%${C.reset}`);
  console.log(`  ${C.gray}⏱  Duration:        ${durationMs}ms${C.reset}\n`);

  if (secIssues > 0) {
    console.log(`${C.bold}${C.yellow}╔══ 🚨 SECURITY ISSUES FOUND ══════════════════════════╗${C.reset}`);
    results.filter(r => r.status === 'SECURITY').forEach(r => {
      console.log(`  🔐 ${r.name}`);
      console.log(`     ${C.yellow}${r.detail}${C.reset}`);
    });
    console.log(`${C.bold}${C.yellow}╚═══════════════════════════════════════════════════════╝${C.reset}\n`);
  }

  if (failed > 0) {
    console.log(`${C.bold}${C.red}╔══ ❌ FAILED TESTS ════════════════════════════════════╗${C.reset}`);
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ [${r.suite}] ${r.name}`);
      console.log(`     ${C.red}${r.detail}${C.reset}`);
    });
    console.log(`${C.bold}${C.red}╚═══════════════════════════════════════════════════════╝${C.reset}\n`);
  }

  // ── Generate HTML Report ──────────────────────────────────────────────
  await mkdir(REPORT_DIR, { recursive: true });
  const html = generateReport(results, durationMs);
  const reportPath = path.join(REPORT_DIR, 'index.html');
  await writeFile(reportPath, html, 'utf8');

  // Also save JSON results
  const jsonPath = path.join(REPORT_DIR, 'results.json');
  await writeFile(jsonPath, JSON.stringify({ meta: { total, passed, failed, secIssues, warnings, score, durationMs, timestamp: new Date().toISOString() }, results }, null, 2));

  console.log(`${C.bold}${C.green}✅ Report saved: ${reportPath}${C.reset}`);
  console.log(`${C.gray}   JSON:         ${jsonPath}${C.reset}\n`);

  // Exit with non-zero if security issues or failures
  if (secIssues > 0 || failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(`\n${C.red}Fatal error in testing agent:${C.reset}`, err);
  process.exit(2);
});
