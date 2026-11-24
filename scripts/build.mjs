import {cp, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {build} from 'vite';

const root = new URL('../', import.meta.url);
const mime = {html:'text/html',css:'text/css',js:'text/javascript',svg:'image/svg+xml'};

async function readAssets(directory, prefix = '') {
  const assets = {};
  const entries = await readdir(directory, {withFileTypes:true});
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    const path = prefix + '/' + entry.name;
    if (entry.isDirectory()) {
      Object.assign(assets, await readAssets(new URL(entry.name + '/', directory), path));
      continue;
    }
    const type = mime[entry.name.split('.').at(-1)];
    if (!type) throw new Error('Unsupported frontend asset: ' + path);
    assets[path] = {
      type:type + '; charset=utf-8',
      data:await readFile(new URL(entry.name, directory), 'utf8')
    };
  }
  return assets;
}

await build();
const assets = await readAssets(new URL('dist/client/', root));

// The Sites deployment uses one Worker entry file. Keep dependencies before their consumers.
const modules = [
  'shared/documentBatch.mjs',
  'backend/modules/accounting/varianceSettlement.mjs',
  'backend/modules/accounting/ledger.mjs',
  'backend/modules/access/roles.mjs',
  'backend/modules/accounting/invoice.mjs',
  'backend/modules/accounting/overview.mjs',
  'backend/modules/accounting/catalog.mjs',
  'backend/modules/accounting/opening.mjs',
  'backend/modules/accounting/bankStatement.mjs',
  'backend/modules/accounting/stockCard.mjs',
  'backend/modules/accounting/ledgerReview.mjs',
  'backend/modules/accounting/domain.mjs',
  'backend/api/http.mjs',
  'backend/modules/access/accounts.mjs',
  'backend/api/workspace.mjs',
  'backend/index.mjs'
];
const sources = [];
for (const path of modules) {
  const source = await readFile(new URL(path, root), 'utf8');
  sources.push(source.replace(/^import .*?;\r?\n/gm,'').replace(/^export (?!(?:default)\b)/gm,''));
}

await mkdir(new URL('dist/server/', root), {recursive:true});
await mkdir(new URL('dist/.openai/', root), {recursive:true});
await writeFile(new URL('dist/server/index.js', root), 'const assets=' + JSON.stringify(assets) + ';\n' + sources.join('\n\n'));
await cp(new URL('.openai/hosting.json', root), new URL('dist/.openai/hosting.json', root));
