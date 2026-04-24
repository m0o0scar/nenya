import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const artifactsDir = join(repoRoot, '.artifacts');
const stageDir = process.env.SAFARI_STAGE_DIR
  ? resolve(process.env.SAFARI_STAGE_DIR)
  : join(artifactsDir, 'safari-src');
const projectDir = process.env.SAFARI_PROJECT_DIR
  ? resolve(process.env.SAFARI_PROJECT_DIR)
  : join(artifactsDir, 'safari-xcode');
const appName = process.env.SAFARI_APP_NAME || 'Nenya';
const bundleIdentifier =
  process.env.SAFARI_BUNDLE_IDENTIFIER || 'com.nenya.Nenya';
const extensionBundleIdentifier = `${bundleIdentifier}.Extension`;

const requiredPaths = ['assets', 'src', 'manifest.safari.json'];

/**
 * Run a command and return the result.
 * @param {string} command
 * @param {string[]} args
 * @returns {ReturnType<typeof spawnSync>}
 */
function run(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

/**
 * Exit with a formatted error.
 * @param {string} message
 * @param {ReturnType<typeof spawnSync>} [result]
 * @returns {never}
 */
function fail(message, result) {
  console.error(`\n${message}`);
  if (result?.stdout) {
    console.error(result.stdout.trim());
  }
  if (result?.stderr) {
    console.error(result.stderr.trim());
  }
  process.exit(1);
}

/**
 * Recursively find files by name.
 * @param {string} directory
 * @param {string} fileName
 * @returns {string[]}
 */
function findFiles(directory, fileName) {
  if (!existsSync(directory)) {
    return [];
  }

  /** @type {string[]} */
  const matches = [];
  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findFiles(entryPath, fileName));
      continue;
    }
    if (entry.isFile() && entry.name === fileName) {
      matches.push(entryPath);
    }
  }

  return matches;
}

/**
 * Locate the Safari packaging tool provided by Xcode.
 * @returns {string}
 */
function findSafariTool() {
  const toolNames = [
    'safari-web-extension-packager',
    'safari-web-extension-converter',
  ];

  for (const toolName of toolNames) {
    const result = run('xcrun', ['--find', toolName]);
    if (result.status === 0) {
      return toolName;
    }
  }

  fail(
    'Could not find Safari Web Extension packaging tools. Install Xcode, then run `xcodebuild -runFirstLaunch` if Xcode has not been initialized.',
  );
}

/**
 * Stage the Safari extension source.
 * @returns {void}
 */
function stageSafariSource() {
  for (const pathName of requiredPaths) {
    if (!existsSync(join(repoRoot, pathName))) {
      fail(`Missing required Safari source path: ${pathName}`);
    }
  }

  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  cpSync(join(repoRoot, 'assets'), join(stageDir, 'assets'), {
    recursive: true,
  });
  cpSync(join(repoRoot, 'src'), join(stageDir, 'src'), {
    recursive: true,
  });
  cpSync(join(repoRoot, 'manifest.safari.json'), join(stageDir, 'manifest.json'));
}

/**
 * Package the staged Safari source into an Xcode project.
 * @returns {void}
 */
function packageSafariExtension() {
  const toolName = findSafariTool();
  const args = [
    toolName,
    stageDir,
    '--project-location',
    projectDir,
    '--app-name',
    appName,
    '--bundle-identifier',
    bundleIdentifier,
    '--swift',
    '--macos-only',
    '--copy-resources',
    '--force',
    '--no-open',
    '--no-prompt',
  ];

  const result = spawnSync('xcrun', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    fail(
      'Safari packaging failed. If Xcode reports that a required plugin failed to load, run `xcodebuild -runFirstLaunch` once and retry.',
    );
  }

  repairBundleIdentifiers();

  console.log(`\nSafari source staged at: ${stageDir}`);
  console.log(`Safari Xcode project created at: ${projectDir}`);
  console.log(`Containing app bundle ID: ${bundleIdentifier}`);
  console.log(`Extension bundle ID: ${extensionBundleIdentifier}`);
}

/**
 * Ensure the embedded extension bundle identifier is prefixed by the containing
 * app bundle identifier. Apple's packager can generate mismatched identifiers
 * when app names and explicit bundle IDs diverge.
 * @returns {void}
 */
function repairBundleIdentifiers() {
  const projectFiles = findFiles(projectDir, 'project.pbxproj');
  if (projectFiles.length === 0) {
    fail(`Could not find generated Xcode project under ${projectDir}`);
  }

  for (const projectFile of projectFiles) {
    const original = readFileSync(projectFile, 'utf8');
    const updated = original.replace(
      /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g,
      (match, currentIdentifier) => {
        const normalizedIdentifier = String(currentIdentifier).trim();
        const replacement = normalizedIdentifier.endsWith('.Extension')
          ? extensionBundleIdentifier
          : bundleIdentifier;
        return `PRODUCT_BUNDLE_IDENTIFIER = ${replacement};`;
      },
    );

    if (updated !== original) {
      writeFileSync(projectFile, updated);
    }
  }

  const viewControllerFiles = findFiles(projectDir, 'ViewController.swift');
  for (const viewControllerFile of viewControllerFiles) {
    const original = readFileSync(viewControllerFile, 'utf8');
    const updated = original.replace(
      /let extensionBundleIdentifier = "([^"]+)"/,
      `let extensionBundleIdentifier = "${extensionBundleIdentifier}"`,
    );

    if (updated !== original) {
      writeFileSync(viewControllerFile, updated);
    }
  }
}

stageSafariSource();
packageSafariExtension();
