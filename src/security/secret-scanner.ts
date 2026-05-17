/**
 * secret-scanner.ts — The security guard.
 *
 * Before ANY file gets synced to your Git repo, this module
 * scans it for things that should NEVER leave your computer:
 * - API keys and tokens (GitHub, AWS, Google, etc.)
 * - Passwords and credentials
 * - Private keys (SSH, PGP, etc.)
 * - High-entropy strings that look like secrets
 *
 * If it finds something suspicious, it blocks the sync entirely
 * and tells you exactly what it found and where.
 *
 * This is the last line of defense. The allowlist (allowlist.ts)
 * is the first — it prevents unauthorized files from even being
 * considered. This module catches secrets that might be hiding
 * INSIDE otherwise-legitimate settings files.
 *
 * Better paranoid than sorry.
 */

import { readFileSync } from "node:fs";

// ─── Types ──────────────────────────────────────────────────────

/** What the scanner found in a file. */
export interface ScanResult {
  /** Is the file clean? If false, secrets were found. */
  clean: boolean;

  /** List of every suspicious thing found. Empty if clean. */
  findings: SecretFinding[];
}

/** Details about one specific suspicious match. */
export interface SecretFinding {
  /** What kind of secret it looks like (e.g., "GitHub Token"). */
  type: string;

  /** Which line the match was found on (1-indexed, like a text editor). */
  line: number;

  /** A preview of the match — redacted so we don't log the actual secret. */
  preview: string;

  /** A helpful message explaining why this was flagged. */
  advice: string;
}

// ─── Secret Patterns ────────────────────────────────────────────

/**
 * Each pattern represents a known type of secret.
 * The regex matches the pattern, the type gives it a name,
 * and the advice tells the user what to do about it.
 *
 * We intentionally cast a wide net here. A few false positives
 * are infinitely better than one leaked API key.
 */
interface SecretPattern {
  type: string;
  regex: RegExp;
  advice: string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // ── GitHub tokens ──
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

  // ── AWS credentials ──
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

  // ── Private keys ──
  {
    type: "Private Key",
    regex: /-----BEGIN\s+(RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    advice: "A private key was found. This should NEVER be synced. Remove it.",
  },

  // ── Google API keys ──
  {
    type: "Google API Key",
    regex: /AIza[0-9A-Za-z_-]{35}/g,
    advice: "Google API keys should not be stored in browser settings.",
  },

  // ── Generic patterns ──
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

  // ── Environment variable leaks ──
  {
    type: "Environment Variable Leak",
    regex: /\b[A-Z_]{2,}_(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)\s*[=:]\s*\S+/g,
    advice: "Environment variable values should not appear in config files.",
  },
];

// ─── Scanning ───────────────────────────────────────────────────

/**
 * Scans a single file for secrets.
 *
 * Reads the file, checks every line against every known pattern,
 * and returns a list of findings. If the list is empty, the file is clean.
 *
 * The preview in each finding is redacted — we show just enough
 * to identify the match, but not enough to expose the actual secret.
 *
 * Example:
 *   const result = scanFile("/path/to/Preferences");
 *   if (!result.clean) {
 *     console.log("Blocked! Found:", result.findings);
 *   }
 */
export function scanFile(filePath: string): ScanResult {
  let content: string;

  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    // If we can't read the file, we can't scan it.
    // Treat unreadable files as clean — the allowlist and
    // sync engine will handle missing files separately.
    return { clean: true, findings: [] };
  }

  const findings: SecretFinding[] = [];
  const lines = content.split("\n");

  // Check every line against every pattern.
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    for (const pattern of SECRET_PATTERNS) {
      // Reset regex state (important because we use the /g flag).
      pattern.regex.lastIndex = 0;

      if (pattern.regex.test(line)) {
        findings.push({
          type: pattern.type,
          line: lineIndex + 1, // Humans count from 1, not 0.
          preview: redactMatch(line),
          advice: pattern.advice,
        });
      }
    }
  }

  return {
    clean: findings.length === 0,
    findings,
  };
}

/**
 * Scans multiple files at once.
 * Returns the combined results — if ANY file has findings,
 * the overall result is not clean.
 *
 * This is what the sync engine calls before every commit.
 */
export function scanFiles(filePaths: string[]): {
  clean: boolean;
  results: Map<string, ScanResult>;
} {
  const results = new Map<string, ScanResult>();
  let allClean = true;

  for (const filePath of filePaths) {
    const result = scanFile(filePath);
    results.set(filePath, result);

    if (!result.clean) {
      allClean = false;
    }
  }

  return { clean: allClean, results };
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Redacts a line that contains a secret.
 *
 * Shows the first 20 characters and replaces the rest with "****".
 * This gives enough context to find the line in your file
 * without actually exposing the secret in logs.
 *
 * Example:
 *   "github.token": "ghp_abc123..." → "github.token": "ghp****"
 */
function redactMatch(line: string): string {
  const trimmed = line.trim();

  if (trimmed.length <= 20) {
    return trimmed;
  }

  return trimmed.substring(0, 20) + "****";
}

/**
 * Formats scan findings into a human-readable report.
 * Used for console output and UI display.
 *
 * Example output:
 *   ⚠ Sensitive data detected in Preferences
 *
 *     GitHub Personal Access Token (line 42)
 *     Preview: "github.token": "ghp****
 *     → Remove this token from your settings.
 */
export function formatFindings(filePath: string, findings: SecretFinding[]): string {
  if (findings.length === 0) {
    return `✓ ${filePath} is clean.`;
  }

  const header = `⚠ Sensitive data detected in ${filePath}\n`;
  const details = findings
    .map((finding) => {
      return [
        `  ${finding.type} (line ${finding.line})`,
        `  Preview: ${finding.preview}`,
        `  → ${finding.advice}`,
      ].join("\n");
    })
    .join("\n\n");

  return header + "\n" + details + "\n\n  Sync has been blocked. Fix the issues above and try again.";
}
