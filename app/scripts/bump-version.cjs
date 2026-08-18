#!/usr/bin/env node
/**
 * Keeps app/package.json version in sync with the latest git tag (vX.Y.Z),
 * so the title-bar version chip and the electron-builder artifact name always
 * match the GitHub Release that drives the auto-updater.
 *
 *   npm run version:bump          # sync to latest v* tag
 *   npm run version:bump 1.2.3    # force a specific version
 *
 * Safe to run repeatedly — it only edits the "version" field.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.resolve(__dirname, '../package.json');
const explicit = process.argv[2];

function latestTagVersion() {
  try {
    const out = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
    return out.replace(/^v/, '');
  } catch {
    return null;
  }
}

const next = explicit || latestTagVersion();
if (!next) {
  console.error('version:bump: no version given and no git tag found; leaving package.json unchanged.');
  process.exit(0);
}
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`version:bump: "${next}" is not a semver (x.y.z); aborting.`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.version === next) {
  console.log(`version:bump: package.json already at ${next}; nothing to do.`);
  process.exit(0);
}
pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`version:bump: package.json -> ${next}`);
