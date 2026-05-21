import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const AUR_DIR = path.join(ROOT, "aur-synkromium-bin");
const SETTINGS_PATH = path.join(homedir(), ".synkromium", "settings.json");

const VALID_BUMP_TYPES = ["major", "minor", "patch", "premajor", "preminor", "prepatch", "prerelease"];
const SEMVER_REGEX = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$/;

// ── Helpers ─────────────────────────────────────────────────────

const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function log(msg) {
  console.log(`${colors.cyan("›")} ${msg}`);
}

function success(msg) {
  console.log(`${colors.green("✔")} ${msg}`);
}

function warn(msg) {
  console.log(`${colors.yellow("⚠")} ${msg}`);
}

function fail(msg) {
  console.error(`${colors.red("✖")} ${msg}`);
  process.exit(1);
}

function header(msg) {
  console.log(`\n${colors.bold(colors.magenta(`── ${msg} ──`))}\n`);
}

function run(cmd, cwd = ROOT) {
  return execSync(cmd, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

function runSafe(cmd, cwd = ROOT) {
  try {
    return { ok: true, output: run(cmd, cwd) };
  } catch (error) {
    return { ok: false, output: error.stderr || error.message || "" };
  }
}

function runVisible(cmd, cwd = ROOT) {
  execSync(cmd, { cwd, encoding: "utf8", stdio: "inherit" });
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${colors.cyan("?")} ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function confirm(question) {
  return ask(`${question} ${colors.dim("[y/N]")}`).then(
    (answer) => answer.toLowerCase() === "y" || answer.toLowerCase() === "yes"
  );
}

function getCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return pkg.version;
}

function loadGitHubToken() {
  if (!fs.existsSync(SETTINGS_PATH)) return null;
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    return settings.githubToken || null;
  } catch {
    return null;
  }
}

// ── Pre-Flight Checks ───────────────────────────────────────────

function preflight() {
  header("Pre-flight checks");

  // Git installed?
  const gitCheck = runSafe("git --version");
  if (!gitCheck.ok) fail("Git is not installed.");
  success(`Git found: ${gitCheck.output}`);

  // Inside a git repo?
  const repoCheck = runSafe("git rev-parse --is-inside-work-tree");
  if (!repoCheck.ok) fail("Not inside a git repository.");

  // On the main branch?
  const branch = run("git rev-parse --abbrev-ref HEAD");
  if (branch !== "main") {
    fail(`You must be on the 'main' branch to release. Currently on '${branch}'.`);
  }
  success(`On branch: ${branch}`);

  // Detached HEAD?
  if (branch === "HEAD") {
    fail("Detached HEAD state. Please checkout a branch before releasing.");
  }

  // Merge conflicts?
  const conflictCheck = runSafe("git diff --name-only --diff-filter=U");
  if (conflictCheck.ok && conflictCheck.output.length > 0) {
    fail(`Merge conflicts detected in:\n${conflictCheck.output}\nResolve them before releasing.`);
  }
  success("No merge conflicts");

  // GitHub token?
  const token = loadGitHubToken();
  if (!token) {
    fail(
      `No GitHub token found.\nExpected at: ${SETTINGS_PATH}\nRun the app and authenticate first.`
    );
  }
  success("GitHub token found");

  // Can we reach GitHub?
  const pingCheck = runSafe(
    `git ls-remote --exit-code "https://${token}@github.com/tokitauhid/Synkromium.git" HEAD`
  );
  if (!pingCheck.ok) {
    fail(
      "Cannot reach GitHub. Check your internet connection and token validity.\n" +
        colors.dim(pingCheck.output)
    );
  }
  success("GitHub connection verified");

  // makepkg available? (needed for AUR, but not fatal if missing)
  const makepkgCheck = runSafe("makepkg --version");
  const hasMakepkg = makepkgCheck.ok;
  if (hasMakepkg) {
    success(`makepkg found: ${makepkgCheck.output.split("\n")[0]}`);
  } else {
    warn("makepkg not found — AUR update will be skipped (non-Arch system?)");
  }

  // AUR directory exists?
  const hasAurDir = fs.existsSync(AUR_DIR) && fs.existsSync(path.join(AUR_DIR, "PKGBUILD"));
  if (hasAurDir) {
    success("AUR repository found");
  } else {
    warn("AUR directory not found — AUR update will be skipped");
  }

  return { token, hasMakepkg, hasAurDir };
}

// ── Uncommitted Changes ─────────────────────────────────────────

async function handleUncommittedChanges() {
  header("Working tree check");

  const status = run("git status --porcelain");

  if (!status) {
    success("Working tree is clean — nothing to commit");
    return;
  }

  // Parse the changes for intelligent message suggestion
  const lines = status.split("\n").filter(Boolean);
  const added = [];
  const modified = [];
  const deleted = [];
  const untracked = [];

  for (const line of lines) {
    const code = line.substring(0, 2).trim();
    const file = line.substring(3);
    if (code === "??") untracked.push(file);
    else if (code.includes("A")) added.push(file);
    else if (code.includes("D")) deleted.push(file);
    else modified.push(file);
  }

  log("Uncommitted changes detected:\n");

  if (untracked.length > 0) {
    console.log(colors.green(`  New files (${untracked.length}):`));
    for (const f of untracked) console.log(colors.green(`    + ${f}`));
  }
  if (added.length > 0) {
    console.log(colors.green(`  Staged additions (${added.length}):`));
    for (const f of added) console.log(colors.green(`    + ${f}`));
  }
  if (modified.length > 0) {
    console.log(colors.yellow(`  Modified (${modified.length}):`));
    for (const f of modified) console.log(colors.yellow(`    ~ ${f}`));
  }
  if (deleted.length > 0) {
    console.log(colors.red(`  Deleted (${deleted.length}):`));
    for (const f of deleted) console.log(colors.red(`    - ${f}`));
  }

  console.log("");

  // Generate a smart suggestion based on changes
  const suggestion = generateCommitSuggestion(untracked, added, modified, deleted);

  log(`Suggested commit message:`);
  console.log(colors.dim(`  "${suggestion}"`));
  console.log("");

  const userMessage = await ask(
    `Commit message ${colors.dim("(press Enter to use suggestion, or type your own)")}:`
  );
  const commitMessage = userMessage || suggestion;

  // Stage everything and commit
  log("Staging all changes...");
  run("git add -A");

  log("Committing...");
  // Use a temp file for the commit message to handle special characters safely
  const msgFile = path.join(ROOT, ".git", "RELEASE_COMMIT_MSG");
  fs.writeFileSync(msgFile, commitMessage, "utf8");
  try {
    run(`git commit --file="${msgFile}"`);
    success(`Committed: "${commitMessage}"`);
  } finally {
    fs.unlinkSync(msgFile);
  }
}

function generateCommitSuggestion(untracked, added, modified, deleted) {
  const allNew = [...untracked, ...added];
  const allFiles = [...allNew, ...modified, ...deleted];

  // Detect new directories/modules
  const newDirs = new Set();
  for (const f of allNew) {
    const parts = f.split("/");
    if (parts.length >= 2 && parts[0] === "src") {
      newDirs.add(parts.slice(0, 2).join("/"));
    }
  }

  // If new modules were added, it's a feature
  if (newDirs.size > 0) {
    const modules = [...newDirs].map((d) => d.replace("src/", "")).join(", ");
    const hasModified = modified.length > 0;
    if (hasModified) {
      return `feat: add ${modules} module${newDirs.size > 1 ? "s" : ""} and update existing code`;
    }
    return `feat: add ${modules} module${newDirs.size > 1 ? "s" : ""}`;
  }

  // All modifications? Could be refactor, fix, or feat
  if (allNew.length === 0 && deleted.length === 0 && modified.length > 0) {
    // Check if it's mostly UI changes
    const uiFiles = modified.filter(
      (f) => f.includes("renderer") || f.includes(".html") || f.includes(".css")
    );
    if (uiFiles.length > modified.length / 2) {
      return "feat: update UI components and styles";
    }

    // Check if it's config/build changes
    const configFiles = modified.filter(
      (f) => f.includes("package") || f.includes("tsconfig") || f.includes("config/")
    );
    if (configFiles.length > modified.length / 2) {
      return "chore: update project configuration";
    }

    // Generic multi-file modification
    if (modified.length > 5) {
      return "refactor: update multiple modules";
    }

    const scope = path.basename(modified[0], path.extname(modified[0]));
    return `refactor: update ${scope}`;
  }

  // Deletions only
  if (allNew.length === 0 && modified.length === 0 && deleted.length > 0) {
    return "chore: remove unused files";
  }

  // Mix of everything
  return `feat: update codebase (${allFiles.length} files changed)`;
}

// ── Version Bump ─────────────────────────────────────────────────

async function bumpVersion(bumpArg) {
  header("Version bump");

  const currentVersion = getCurrentVersion();
  log(`Current version: ${colors.bold(currentVersion)}`);

  // Validate the bump argument
  const isBumpType = VALID_BUMP_TYPES.includes(bumpArg);
  const isExplicitVersion = SEMVER_REGEX.test(bumpArg);

  if (!isBumpType && !isExplicitVersion) {
    fail(
      `Invalid version argument: "${bumpArg}"\n` +
        `  Valid bump types: ${VALID_BUMP_TYPES.join(", ")}\n` +
        `  Or provide an explicit semver: e.g. 1.0.0`
    );
  }

  // If explicit version, check it's actually newer
  if (isExplicitVersion && bumpArg === currentVersion) {
    fail(`Version ${bumpArg} is the same as the current version.`);
  }

  // Check if the tag already exists
  const tagName = isExplicitVersion ? `v${bumpArg}` : null;
  if (tagName) {
    const tagCheck = runSafe(`git tag -l "${tagName}"`);
    if (tagCheck.ok && tagCheck.output === tagName) {
      fail(`Tag ${tagName} already exists. Choose a different version.`);
    }
  }

  // npm version runs update-version.js hook, stages files, commits, and tags
  log(`Running npm version ${bumpArg}...`);
  try {
    runVisible(`npm version ${bumpArg}`, ROOT);
  } catch (error) {
    fail(
      `npm version failed. This usually means:\n` +
        `  - The working tree has unstaged changes (should have been committed above)\n` +
        `  - The version/tag already exists\n` +
        `  - update-version.js encountered an error`
    );
  }

  const newVersion = getCurrentVersion();
  success(`Version bumped: ${currentVersion} → ${colors.bold(newVersion)}`);
  return newVersion;
}

// ── Push to GitHub ───────────────────────────────────────────────

function pushToGitHub(token) {
  header("Push to GitHub");

  const remoteUrl = `https://${token}@github.com/tokitauhid/Synkromium.git`;

  // Push commits
  log("Pushing commits...");
  const pushResult = runSafe(`git push "${remoteUrl}" main`);
  if (!pushResult.ok) {
    // Check common failure modes
    const errMsg = pushResult.output.toLowerCase();
    if (errMsg.includes("rejected") || errMsg.includes("non-fast-forward")) {
      fail(
        "Push rejected — remote has commits you don't have locally.\n" +
          "Pull and merge first: git pull --rebase origin main"
      );
    }
    if (errMsg.includes("authentication") || errMsg.includes("403") || errMsg.includes("401")) {
      fail("Authentication failed. Your GitHub token may be expired or revoked.");
    }
    fail(`Push failed:\n${pushResult.output}`);
  }
  success("Commits pushed");

  // Push tags
  log("Pushing tags...");
  const tagResult = runSafe(`git push "${remoteUrl}" --tags`);
  if (!tagResult.ok) {
    warn(`Tag push encountered an issue: ${tagResult.output}`);
    warn("You may need to push tags manually: git push origin --tags");
  } else {
    success("Tags pushed");
  }
}

// ── Update AUR ───────────────────────────────────────────────────

function updateAur(newVersion, hasMakepkg) {
  header("AUR package update");

  if (!fs.existsSync(AUR_DIR)) {
    warn("AUR directory not found, skipping");
    return;
  }

  // Step 1: Sanitize — make sure private keys aren't tracked
  log("Sanitizing AUR repository (ensuring keys aren't tracked)...");

  const gitignorePath = path.join(AUR_DIR, ".gitignore");
  const gitignoreContent = [
    "# SSH keys — never push these to public AUR",
    "aur_key",
    "aur_key.pub",
    "",
    "# makepkg artifacts",
    "*.tar.*",
    "*.deb",
    "pkg/",
    "src/",
    "",
  ].join("\n");
  fs.writeFileSync(gitignorePath, gitignoreContent, "utf8");
  success("Created .gitignore for AUR repo");

  // Check if local branch is ahead of remote (key leak commit)
  const aheadCheck = runSafe("git log aur/master..HEAD --oneline", AUR_DIR);
  if (aheadCheck.ok && aheadCheck.output.length > 0) {
    log("Local AUR branch is ahead of remote — resetting to clean state...");
    // Check if the ahead commits contain key files
    const aheadFiles = runSafe("git diff --name-only aur/master..HEAD", AUR_DIR);
    if (aheadFiles.ok && (aheadFiles.output.includes("aur_key"))) {
      warn("Detected SSH keys in unpushed commits — resetting to prevent leak");
      run("git reset --mixed aur/master", AUR_DIR);
      success("Reset AUR branch to aur/master (keys removed from history)");
    }
  }

  // Step 2: Update PKGBUILD
  const pkgbuildPath = path.join(AUR_DIR, "PKGBUILD");
  if (!fs.existsSync(pkgbuildPath)) {
    fail("PKGBUILD not found in AUR directory");
  }

  let pkgbuild = fs.readFileSync(pkgbuildPath, "utf8");
  const oldPkgver = pkgbuild.match(/pkgver=([^\n]+)/)?.[1];

  pkgbuild = pkgbuild.replace(
    /pkgver=[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?/,
    `pkgver=${newVersion}`
  );
  pkgbuild = pkgbuild.replace(/pkgrel=[0-9]+/, "pkgrel=1");
  fs.writeFileSync(pkgbuildPath, pkgbuild, "utf8");
  success(`PKGBUILD updated: pkgver ${oldPkgver} → ${newVersion}`);

  // Step 3: Regenerate .SRCINFO
  if (hasMakepkg) {
    log("Regenerating .SRCINFO...");
    try {
      const srcinfo = run("makepkg --printsrcinfo", AUR_DIR);
      fs.writeFileSync(path.join(AUR_DIR, ".SRCINFO"), srcinfo + "\n", "utf8");
      success(".SRCINFO regenerated");
    } catch (error) {
      warn("makepkg --printsrcinfo failed, generating .SRCINFO manually...");
      generateSrcinfoManually(newVersion);
    }
  } else {
    log("makepkg not available, generating .SRCINFO manually...");
    generateSrcinfoManually(newVersion);
  }

  // Step 4: Commit
  log("Staging AUR changes...");
  run("git add PKGBUILD .SRCINFO .gitignore", AUR_DIR);

  const aurStatus = runSafe("git status --porcelain", AUR_DIR);
  if (!aurStatus.ok || !aurStatus.output) {
    warn("No changes to commit in AUR repo (already up to date?)");
    return;
  }

  log("Committing AUR changes...");
  run(`git commit -m "chore: bump version to ${newVersion}"`, AUR_DIR);
  success("AUR changes committed");

  // Step 5: Push to AUR
  log("Pushing to AUR...");
  const aurPushResult = runSafe("git push aur master", AUR_DIR);
  if (!aurPushResult.ok) {
    const err = aurPushResult.output;
    if (err.includes("Permission denied") || err.includes("publickey")) {
      fail(
        "AUR push failed — SSH key authentication error.\n" +
          "Make sure your AUR SSH key is set up correctly.\n" +
          colors.dim(err)
      );
    }
    if (err.includes("rejected") || err.includes("non-fast-forward")) {
      fail(
        "AUR push rejected — remote has diverged.\n" +
          "You may need to force push: cd aur-synkromium-bin && git push aur master --force\n" +
          colors.dim(err)
      );
    }
    fail(`AUR push failed:\n${err}`);
  }
  success("Pushed to AUR successfully");
}

function generateSrcinfoManually(version) {
  // Fallback: generate .SRCINFO from PKGBUILD values directly
  const srcinfo = `pkgbase = synkromium-bin
\tpkgdesc = Keep your Chromium browser settings and extensions in sync across all your devices, privately and automatically.
\tpkgver = ${version}
\tpkgrel = 1
\turl = https://github.com/tokitauhid/Synkromium
\tarch = x86_64
\tlicense = MIT
\tdepends = nss
\tdepends = libxss
\tdepends = libsecret
\tdepends = gtk3
\tdepends = alsa-lib
\tprovides = synkromium
\tconflicts = synkromium
\tsource = synkromium-bin-${version}.deb::https://github.com/tokitauhid/Synkromium/releases/download/v${version}/synkromium_${version}_amd64.deb
\tsha256sums = SKIP

pkgname = synkromium-bin
`;
  fs.writeFileSync(path.join(AUR_DIR, ".SRCINFO"), srcinfo, "utf8");
  success(".SRCINFO generated manually");
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log(
    colors.bold(
      colors.cyan("  ╔══════════════════════════════════════╗")
    )
  );
  console.log(
    colors.bold(
      colors.cyan("  ║     Synkromium Release Manager       ║")
    )
  );
  console.log(
    colors.bold(
      colors.cyan("  ╚══════════════════════════════════════╝")
    )
  );

  // Parse CLI argument
  const bumpArg = process.argv[2];
  if (!bumpArg) {
    console.log("");
    console.log(`  Usage: ${colors.bold("npm run release -- <version|bump-type>")}`);
    console.log("");
    console.log(`  Bump types: ${colors.dim(VALID_BUMP_TYPES.join(", "))}`);
    console.log(`  Or specify an exact version: ${colors.dim("e.g. 1.0.0")}`);
    console.log("");
    console.log(`  Examples:`);
    console.log(`    ${colors.dim("npm run release -- patch")}      ${colors.dim("# 0.1.2 → 0.1.3")}`);
    console.log(`    ${colors.dim("npm run release -- minor")}      ${colors.dim("# 0.1.2 → 0.2.0")}`);
    console.log(`    ${colors.dim("npm run release -- 1.0.0")}      ${colors.dim("# 0.1.2 → 1.0.0")}`);
    console.log("");
    process.exit(0);
  }

  // Run the pipeline
  const { token, hasMakepkg, hasAurDir } = preflight();

  await handleUncommittedChanges();

  const newVersion = await bumpVersion(bumpArg);

  // Confirm before pushing
  console.log("");
  const shouldPush = await confirm(
    `Ready to push ${colors.bold(`v${newVersion}`)} to GitHub${hasAurDir ? " and AUR" : ""}. Proceed?`
  );
  if (!shouldPush) {
    warn("Release aborted. Your local commits and tags are intact.");
    warn("To undo the version bump: git reset --hard HEAD~1 && git tag -d v" + newVersion);
    process.exit(0);
  }

  pushToGitHub(token);

  if (hasAurDir) {
    updateAur(newVersion, hasMakepkg);
  }

  // Done!
  header("Release complete");
  console.log(`  Version:  ${colors.bold(colors.green(`v${newVersion}`))}`);
  console.log(`  GitHub:   ${colors.dim("https://github.com/tokitauhid/Synkromium")}`);
  if (hasAurDir) {
    console.log(`  AUR:      ${colors.dim("https://aur.archlinux.org/packages/synkromium-bin")}`);
  }
  console.log("");
  console.log(
    `  ${colors.yellow("⚠")} The GitHub Actions workflow will build release binaries.`
  );
  console.log(
    `  ${colors.yellow("⚠")} Once the workflow completes, go to GitHub Releases and`
  );
  console.log(
    `    ${colors.bold("publish the draft release")} so AUR users can download it.`
  );
  console.log("");
}

main().catch((error) => {
  fail(`Unexpected error: ${error.message}`);
});
