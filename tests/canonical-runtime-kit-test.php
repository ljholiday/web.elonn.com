<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$script = <<<'JS'
const fs = require('fs');
const vm = require('vm');

const root = process.argv[2];
const context = {window: {}};
context.window.ElonnWorldRuntime = {};
vm.createContext(context);

['common.js', 'dataset-parser.js', 'state-indexer.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(`${root}/public/assets/js/runtime-kit/${file}`, 'utf8'), context, {filename: file});
});

const runtime = context.window.ElonnWorldRuntime;
const dataset = {
  id: 'dataset:world:test',
  type: 'world',
  scope: 'full',
  mode: 'snapshot',
  created: '2026-07-17T20:00:01Z',
  objects: [{id: 'object:one', type: 'note', content: {name: 'One'}}],
  actions: [{id: 'action:one:open', type: 'open', target: 'object:one', content: {label: 'Open'}}],
  relationships: [],
  collections: [{id: 'collection:one', type: 'collection', content: {items: ['object:one']}}],
  resources: [],
  placements: [{id: 'placement:one:carry', type: 'carry', content: {collection: 'collection:one'}}],
  errors: [],
  context: {}
};

const parsed = runtime.DatasetParser.parse(dataset);
if (parsed.errors.length !== 0) throw new Error('errors array was not preserved');
if (parsed.collections[0].items[0] !== 'object:one') throw new Error('canonical collection item ids were not preserved');
if (parsed.actions[0].target_id !== 'object:one') throw new Error('canonical action target was not parsed');

const state = runtime.StateIndexer.build(parsed, null);
if (state.layers[0].zones[0].collectionIds[0] !== 'collection:one') throw new Error('carry placement was not translated');

const workspaceDataset = Object.assign({}, dataset, {
  id: 'dataset:world:workspace',
  collections: [{id: 'collection:workspace', type: 'collection', content: {items: ['object:one']}}],
  placements: [{id: 'placement:one:workspace', type: 'workspace', content: {collection: 'collection:workspace'}}]
});
const workspaceState = runtime.StateIndexer.build(runtime.DatasetParser.parse(workspaceDataset), null);
if (workspaceState.layers[1].id !== 'workspace') throw new Error('workspace layer was not indexed');
if (workspaceState.layers[1].zones[0].collectionIds[0] !== 'collection:workspace') throw new Error('workspace placement was not translated');

let rejected = false;
try {
  runtime.DatasetParser.parse({dataset: {name: 'elonn.world.dataset', version: 1}});
} catch (error) {
  rejected = true;
}
if (!rejected) throw new Error('old wrapper payload was accepted');

const errorDataset = Object.assign({}, dataset, {id: 'dataset:world:error', errors: [{code: 'contract_violation', class: 'contract', message: 'Bad call.'}]});
const parsedError = runtime.DatasetParser.parse(errorDataset);
if (parsedError.errors[0].code !== 'contract_violation') throw new Error('canonical errors were not parsed');
if (parsedError.errors[0].class !== 'contract') throw new Error('canonical error classes were not parsed');
JS;

$temp = tempnam(sys_get_temp_dir(), 'web-runtime-kit-');
if (!is_string($temp)) {
    fwrite(STDERR, "Could not create temp file.\n");
    exit(1);
}

file_put_contents($temp, $script);
$command = 'node ' . escapeshellarg($temp) . ' ' . escapeshellarg($root) . ' 2>&1';
exec($command, $output, $status);
unlink($temp);

if ($status !== 0) {
    fwrite(STDERR, implode(PHP_EOL, $output) . PHP_EOL);
    exit(1);
}

echo "PASS: Canonical runtime kit parses Datasets and translations\n";
