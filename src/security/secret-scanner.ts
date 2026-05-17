import { readFileSync } from "node:fs";

export interface ScanResult {
  clean: boolean;
  findings: SecretFinding[];
}

export interface SecretFinding {
  type: string;
  line: number;
  preview: string;
  advice: string;
}

interface SecretPattern {
  type: string;
  regex: RegExp;
  advice: string;
}

// Intentionally casts a wide net — false positives are better than leaked keys
const SECRET_PATTERNS: SecretPattern[] = [
  {
    type: "GitHub Personal Access Token",
    regex: /ghp_[A-Za-z0-9_]{36,}/g,
    advice: "Remove this token from your settings. Use environment variables instead.",
  },
  {
    type: "GitHub OAuth Token",
    regex: /gho_[A-Za-z0-9_]{36,}/g,
    advice: "OAuth tokens should never be stored in browser settings.",
  },
  {
    type: "GitHub Fine-Grained PAT",
    regex: /github_pat_[A-Za-z0-9_]{22,}/g,
    advice: "Remove this PAT from your settings. Rotate it immediately if it was committed.",
  },
  {
    type: "AWS Access Key",
    regex: /AKIA[0-9A-Z]{16}/g,
    advice: "AWS keys should be in ~/.aws/credentials, never in browser settings.",
  },
  {
    type: "AWS Secret Key",
    regex: /aws_secret_access_key\s*[=:]\s*\S+/gi,
    advice: "This looks like an AWS secret key. Remove it immediately.",
  },
  {
    type: "Private Key",
    regex: /-----BEGIN\s+(RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    advice: "A private key was found. This should NEVER be synced. Remove it.",
  },
  {
    type: "Google API Key",
    regex: /AIza[0-9A-Za-z_-]{35}/g,
    advice: "Google API keys should not be stored in browser settings.",
  },
  {
    type: "Generic API Key",
    regex: /api[_-]?key\s*[=:]\s*["']?\S{20,}["']?/gi,
    advice: "This looks like an API key. Check if it's a real credential before syncing.",
  },
  {
    type: "Generic Secret",
    regex: /secret\s*[=:]\s*["']?\S{20,}["']?/gi,
    advice: "This looks like a secret value. Verify it's not a real credential.",
  },
  {
    type: "Generic Password",
    regex: /password\s*[=:]\s*["']?\S{8,}["']?/gi,
    advice: "This looks like a password. Remove it from your settings.",
  },
  {
    type: "Environment Variable Leak",
    regex: /\b[A-Z_]{2,}_(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)\s*[=:]\s*\S+/g,
    advice: "Environment variable values should not appear in config files.",
  },
];

export function scanFile(filePath: string): ScanResult {
  let content: string;

  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return { clean: true, findings: [] };
  }

  const findings: SecretFinding[] = [];
  const lines = content.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;

      if (pattern.regex.test(line)) {
        findings.push({
          type: pattern.type,
          line: lineIndex + 1,
          preview: redactMatch(line),
          advice: pattern.advice,
        });
      }
    }
  }

  return { clean: findings.length === 0, findings };
}

export function scanFiles(filePaths: string[]): {
  clean: boolean;
  results: Map<string, ScanResult>;
} {
  const results = new Map<string, ScanResult>();
  let allClean = true;

  for (const filePath of filePaths) {
    const result = scanFile(filePath);
    results.set(filePath, result);
    if (!result.clean) allClean = false;
  }

  return { clean: allClean, results };
}

/** Shows first 20 chars then redacts the rest to avoid logging real secrets. */
function redactMatch(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length <= 20) return trimmed;
  return trimmed.substring(0, 20) + "****";
}

export function formatFindings(filePath: string, findings: SecretFinding[]): string {
  if (findings.length === 0) return `✓ ${filePath} is clean.`;

  const header = `⚠ Sensitive data detected in ${filePath}\n`;
  const details = findings
    .map((f) => [
      `  ${f.type} (line ${f.line})`,
      `  Preview: ${f.preview}`,
      `  → ${f.advice}`,
    ].join("\n"))
    .join("\n\n");

  return header + "\n" + details + "\n\n  Sync has been blocked. Fix the issues above and try again.";
}
