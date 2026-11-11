#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOutput = path.join(repositoryRoot, 'apps/op-admin/server/config/gmItemConfig.json');
const inputs = [
  ['item_list.js', 'item'],
  ['equip_list.js', 'equipment'],
  ['equip_stone_list.js', 'stone'],
];

function usage() {
  console.log('Usage: node scripts/generate-gm-items.mjs --source-root /path/to/op_server [--output FILE] [--check]');
  console.log('Reads app/config_data_cn/{item_list,equip_list,equip_stone_list}.js without executing source code.');
}

function options(args) {
  const result = { sourceRoot: '', output: defaultOutput, check: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      usage();
      return null;
    }
    if (argument === '--check') {
      result.check = true;
      continue;
    }
    if (argument === '--source-root' || argument === '--output') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
      result[argument === '--source-root' ? 'sourceRoot' : 'output'] = path.resolve(value);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!result.sourceRoot) throw new Error('--source-root must point to the reference op_server directory');
  return result;
}

// The exported game configuration is a strict JSON literal with this CJS wrapper.
// Do not import/evaluate the source module or accept additional JavaScript statements.
function parseData(source, filename) {
  const match = /^\uFEFF?\s*exports\.data\s*=\s*(\{[\s\S]*\})\s*;\s*$/.exec(source);
  if (!match) throw new Error(`${filename}: expected a single exports.data JSON assignment`);
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new Error(`${filename}: the exported value is not strict JSON`);
  }
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw new Error(`${filename}: expected an item dictionary`);
  }
  return data;
}

function categoryFor(id, sourceCategory) {
  if (id >= 60000 && id <= 69999) return 'partner_fragment';
  if (id >= 70000 && id <= 79999) return 'equipment_fragment';
  return sourceCategory;
}

async function main() {
  const config = options(process.argv.slice(2));
  if (!config) return;
  const catalog = {};
  const counts = {};
  let overwritten = 0;
  // Keep the same merge order as new_gmtools/models/data_load.js.
  for (const [filename, sourceCategory] of inputs) {
    const filenamePath = path.join(config.sourceRoot, 'app/config_data_cn', filename);
    const data = parseData(await readFile(filenamePath, 'utf8'), filename);
    counts[filename] = Object.keys(data).length;
    for (const [id, record] of Object.entries(data)) {
      const numericId = Number(id);
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(numericId)) {
        throw new Error(`${filename}: invalid dictionary item ID ${id}`);
      }
      if (!record || typeof record !== 'object' || typeof record.n !== 'string' || !record.n.trim()) {
        throw new Error(`${filename}: missing item name for ID ${id}`);
      }
      // The dictionary key is authoritative; record.i can reference another item.
      if (Object.hasOwn(catalog, id)) overwritten++;
      catalog[id] = { name: record.n, category: categoryFor(numericId, sourceCategory) };
    }
  }
  const output = JSON.stringify(catalog, null, 2) + '\n';
  if (config.check) {
    if (await readFile(config.output, 'utf8') !== output) {
      throw new Error('GM item catalog differs from the selected reference configuration; regenerate it');
    }
  } else {
    await mkdir(path.dirname(config.output), { recursive: true });
    await writeFile(config.output, output);
  }
  console.log(JSON.stringify({
    action: config.check ? 'verified' : 'generated',
    output: config.output,
    total: Object.keys(catalog).length,
    sources: counts,
    overwritten,
  }));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
