/**
 * SARIF v2.1 formatter — Static Analysis Results Interchange Format.
 *
 * SARIF is the standard format for static analysis tools,
 * supported by GitHub Code Scanning, Azure DevOps, and other platforms.
 *
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */

import type { ScanResult, Finding, ActiveSeverity } from '../core/types.js';
import type { Formatter } from './engine.js';

/**
 * Map acv severity to SARIF level.
 */
function toSarifLevel(severity: ActiveSeverity): string {
  switch (severity) {
    case 'error':
      return 'error';
    case 'warn':
      return 'warning';
    case 'info':
      return 'note';
  }
}

/**
 * Build a SARIF result from a finding.
 */
function toSarifResult(finding: Finding): Record<string, unknown> {
  const result: Record<string, unknown> = {
    ruleId: finding.ruleId,
    level: toSarifLevel(finding.severity),
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: finding.filePath },
          region: {
            startLine: finding.line,
            startColumn: finding.column,
            endLine: finding.endLine,
            endColumn: finding.endColumn,
          },
        },
      },
    ],
  };

  if (finding.fix) {
    result['fixes'] = [
      {
        description: { text: `Replace "${finding.fix.from}" with "${finding.fix.to}"` },
        artifactChanges: [
          {
            artifactLocation: { uri: finding.filePath },
            replacements: [
              {
                deletedRegion: {
                  startLine: finding.line,
                  startColumn: finding.column,
                  endLine: finding.endLine,
                  endColumn: finding.endColumn,
                },
                insertedContent: { text: finding.fix.to },
              },
            ],
          },
        ],
      },
    ];
  }

  if (finding.confidence < 1.0) {
    result['properties'] = {
      confidence: finding.confidence,
    };
  }

  return result;
}

/**
 * SARIF v2.1 formatter.
 */
export class SarifFormatter implements Formatter {
  format(result: ScanResult): string {
    const sarif = {
      $schema:
        'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'ai-code-verifier',
              version: result.version,
              informationUri: 'https://github.com/ai-code-verifier/acv',
              rules: this._buildRuleDescriptors(result),
            },
          },
          results: result.findings.map(toSarifResult),
          invocations: [
            {
              executionSuccessful: result.exitCode !== 3,
              endTimeUtc: result.timestamp,
            },
          ],
        },
      ],
    };

    return JSON.stringify(sarif, null, 2);
  }

  /**
   * Build SARIF rule descriptors from the findings.
   */
  private _buildRuleDescriptors(result: ScanResult): Array<Record<string, unknown>> {
    const ruleIds = new Set(result.findings.map((f) => f.ruleId));
    return [...ruleIds].map((id) => {
      const sample = result.findings.find((f) => f.ruleId === id);
      return {
        id,
        shortDescription: { text: sample?.message ?? id },
        defaultConfiguration: {
          level: sample ? toSarifLevel(sample.severity) : 'warning',
        },
        properties: {
          category: sample?.category,
        },
      };
    });
  }
}
