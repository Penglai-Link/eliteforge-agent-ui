import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
if (!version || process.argv.length !== 3 || !semver.test(version)) {
  console.error('Usage: npm run version:all -- <semver> (e.g. 0.2.0)');
  process.exit(1);
}

const readJson = async (file) => JSON.parse(await readFile(join(root, file), 'utf8'));
const files = (await readdir(join(root, 'packages'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => `packages/${entry.name}/package.json`);
const packages = await Promise.all(files.map(readJson));
const names = new Set(packages.map((pkg) => pkg.name));
if (!packages.length || names.size !== packages.length || packages.some((pkg) => !pkg.name)) {
  throw new Error('Workspace packages must have unique names');
}
const rootPackage = await readJson('package.json');
const lock = await readJson('package-lock.json');

function updateDependencies(pkg) {
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(pkg[section] || {})) {
      if (names.has(name)) pkg[section][name] = version;
    }
  }
}
rootPackage.version = version;
lock.version = version;
lock.packages[''].version = version;
updateDependencies(rootPackage);
updateDependencies(lock.packages['']);
const workspacePaths = new Set(files.map((file) => dirname(file)));
for (const [path, entry] of Object.entries(lock.packages)) {
  if (path.startsWith('packages/') && !path.slice('packages/'.length).includes('/') && !workspacePaths.has(path)) {
    throw new Error(`Lockfile contains an unknown workspace: ${path}`);
  }
  if (entry.name && names.has(entry.name) && path.startsWith('packages/') && !workspacePaths.has(path)) {
    throw new Error(`Unexpected workspace lockfile entry: ${path}`);
  }
}
for (let i = 0; i < files.length; i++) {
  const pkg = packages[i];
  const lockEntry = lock.packages[dirname(files[i])];
  if (!lockEntry || lockEntry.name !== pkg.name) throw new Error(`Missing lockfile entry for ${pkg.name}`);
  pkg.version = version;
  lockEntry.version = version;
  updateDependencies(pkg);
  updateDependencies(lockEntry);
}
const outputs = [['package.json', rootPackage], ['package-lock.json', lock], ...files.map((file, i) => [file, packages[i]])];
const originals = await Promise.all(outputs.map(async ([file]) => [file, await readFile(join(root, file), 'utf8')]));
try {
  for (const [file, value] of outputs) await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
  for (const [file, value] of outputs) {
    if (await readFile(join(root, file), 'utf8') !== `${JSON.stringify(value, null, 2)}\n`) {
      throw new Error(`Verification failed for ${file}`);
    }
  }
} catch (error) {
  const restored = await Promise.allSettled(originals.map(([file, content]) => writeFile(join(root, file), content)));
  if (restored.some((result) => result.status === 'rejected')) {
    console.error('Failed to restore all files; inspect the working tree before continuing.');
  }
  throw error;
}
console.log(`Updated ${packages.length} packages and their internal dependencies to ${version}.`);
