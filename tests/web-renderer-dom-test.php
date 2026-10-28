<?php

declare(strict_types=1);

/*
 * DOM-execution coverage for web-renderer.js -- the exact file every live regression this
 * session happened in. canonical-runtime-kit-test.php proves DatasetParser/StateIndexer/
 * SceneModel project a Dataset correctly, but never loads web-renderer.js at all, since it
 * needs a real DOM (document.createElement, etc.) that its hand-rolled fake `window` doesn't
 * provide. This file runs the real pipeline end to end -- a raw World Dataset, through the
 * real parse/index/scene/render chain, into a real jsdom document -- and asserts on the
 * actual rendered output, not just the intermediate scene data.
 */

$root = dirname(__DIR__);

// Capture the real production markup (templates/runtime.php), the same way the app itself
// renders it, rather than hand-copying its structure into a fixture that could drift from
// reality unnoticed.
$world = ['base_url' => 'https://world.elonn.local'];
$api = ['base_url' => 'https://api.elonn.local'];
$app = ['environment' => 'test', 'debug' => false, 'url' => 'https://web.elonn.local'];
$title = 'Elonn Web';
$authMode = false;
$fallbackDataset = null;
define('BASE_PATH', $root);
ob_start();
require $root . '/templates/runtime.php';
$html = (string) ob_get_clean();

$script = <<<'JS'
const fs = require('fs');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const root = process.argv[2];
const html = fs.readFileSync(process.argv[3], 'utf8');

const dom = new JSDOM(html, {runScripts: 'outside-only', url: 'https://web.elonn.local/'});
const context = dom.getInternalVMContext();
context.window.ElonnWorldRuntime = {};
context.navigator = context.navigator || {language: 'en-US'};
context.Intl = {
  DateTimeFormat: function () {
    return {resolvedOptions: function () { return {timeZone: 'America/Los_Angeles'}; }};
  }
};

['common.js', 'world-client.js', 'dataset-parser.js', 'state-indexer.js', 'scene-model.js', 'web-renderer.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(`${root}/public/assets/js/runtime-kit/${file}`, 'utf8'), context, {filename: file});
});

const runtime = context.window.ElonnWorldRuntime;
const document = context.window.document;
const rootEl = document.querySelector('[data-world-runtime]');
if (!rootEl) throw new Error('setup: templates/runtime.php did not produce a [data-world-runtime] root');
const renderer = runtime.WebRenderer(rootEl);

const checks = [];
function check(label, condition) {
  checks.push({label, passed: !!condition});
}

function baseDataset(overrides) {
  return Object.assign({
    id: 'dataset:world:test',
    type: 'world',
    scope: 'full',
    mode: 'snapshot',
    created: '2026-10-24T00:00:00Z',
    objects: [],
    actions: [],
    relationships: [],
    collections: [],
    resources: [],
    placements: [],
    findings: [],
    errors: [],
    context: {focus: {object_id: ''}}
  }, overrides || {});
}

function sceneFrom(dataset, carryPanels) {
  const state = runtime.StateIndexer.build(runtime.DatasetParser.parse(dataset));
  if (carryPanels) state.carryPanels = carryPanels;
  return runtime.SceneModel.fromState(state);
}

// Case 1: a plain text Object (no media, blank summary -- e.g. mind.reasoning, decision.
// summary_is_descriptive_not_a_content_excerpt_20261024's own motivating case) shows its
// content.body text in a compact card via the shared compactBodyText() contract.
{
  const dataset = baseDataset({
    id: 'dataset:world:plain-text',
    objects: [{
      id: 'object:plain', type: 'mind.reasoning', title: '', name: '', summary: '', description: '',
      content: {body: [{node: 'paragraph', text: 'A real reasoning answer.'}]},
      resources: [], actions: [], relationships: []
    }],
    findings: [{id: 'finding:object:plain', content: {object: 'object:plain'}}]
  });
  renderer.render(sceneFrom(dataset));
  const card = rootEl.querySelector('[data-object-id="object:plain"]');
  check('Case 1 -- a plain text Object renders its content.body text in a compact card',
    !!card && card.textContent.indexOf('A real reasoning answer.') !== -1);
}

// Case 2: a thumbnail Object's media node resolves against the Dataset's flat resources map
// (scene.resourcesById), never only the Object's own narrower resources[] ref list -- the
// Phase 2b fix. The Object below deliberately lists no resources of its own.
{
  const dataset = baseDataset({
    id: 'dataset:world:thumbnail',
    objects: [{
      id: 'object:thumb', type: 'web_result', title: 'A result', name: '', summary: 'A real summary.', description: '',
      content: {body: [{node: 'media', kind: 'image', resource_or_object_ref: 'resource:thumb:1', alt: 'A result'}]},
      resources: [], actions: [], relationships: []
    }],
    resources: [{id: 'resource:thumb:1', type: 'resource', content: {kind: 'image', source: 'https://img.example.com/thumb.jpg'}}],
    findings: [{id: 'finding:object:thumb', content: {object: 'object:thumb'}}]
  });
  renderer.render(sceneFrom(dataset));
  const card = rootEl.querySelector('[data-object-id="object:thumb"]');
  const img = card ? card.querySelector('img') : null;
  check('Case 2 -- a thumbnail Object\'s image resolves against the Dataset\'s flat resources map, not the Object\'s own empty resources[] ref list',
    !!img && img.src === 'https://img.example.com/thumb.jpg');
}

// Case 3: a full multi-node content.body (heading, paragraph, list, media) renders every node
// kind, in document order, when the Object is opened on Carry.
{
  const dataset = baseDataset({
    id: 'dataset:world:document-body',
    objects: [{
      id: 'object:doc', type: 'docs.document', title: 'A document', name: '', summary: '', description: '',
      content: {body: [
        {node: 'heading', level: 1, text: 'A real heading'},
        {node: 'paragraph', text: 'A real paragraph.'},
        {node: 'list', ordered: false, items: [{content: [{node: 'paragraph', text: 'Item one'}]}, {content: [{node: 'paragraph', text: 'Item two'}]}]},
        {node: 'media', kind: 'image', resource_or_object_ref: 'resource:doc:image:1', alt: 'A diagram'}
      ]},
      resources: [], actions: [], relationships: []
    }],
    resources: [{id: 'resource:doc:image:1', type: 'resource', content: {kind: 'image', source: 'https://img.example.com/diagram.jpg'}}],
    placements: [{id: 'placement:doc:carry', type: 'carry', content: {object: 'object:doc'}}],
    context: {objects: {'object:doc': {title: 'A document', depth: 0, history: []}}, focus: {object_id: 'object:doc'}}
  });
  const scene = sceneFrom(dataset, [{id: 'carry-panel:object:doc', objectId: 'object:doc', x: 0, y: 0, width: 320, height: 200, z: 1, collapsed: false}]);
  renderer.render(scene);
  const panel = rootEl.querySelector('[data-carry-panel-id="carry-panel:object:doc"]');
  const content = panel ? panel.querySelector('.carry-object-panel__content') : null;
  check('Case 3 -- an opened document body renders heading, paragraph, list, and media nodes, in document order',
    !!content
    && /A real heading/.test(content.textContent)
    && /A real paragraph\./.test(content.textContent)
    && content.querySelectorAll('li').length === 2
    && content.querySelector('img') !== null
    && content.textContent.indexOf('A real heading') < content.textContent.indexOf('A real paragraph.')
    && content.textContent.indexOf('A real paragraph.') < content.textContent.indexOf('Item one'));
}

// Case 4: a sequence Collection's entries render via sequenceEntryNode, in Dataset order.
{
  const dataset = baseDataset({
    id: 'dataset:world:sequence',
    objects: [
      {id: 'object:seq:1', type: 'message', title: '', name: '', summary: '', description: '', content: {body: [{node: 'paragraph', text: 'First message.'}]}, resources: [], actions: [], relationships: []},
      {id: 'object:seq:2', type: 'message', title: '', name: '', summary: '', description: '', content: {body: [{node: 'paragraph', text: 'Second message.'}]}, resources: [], actions: [], relationships: []}
    ],
    collections: [{id: 'collection:seq', type: 'sequence', title: 'Messages', name: '', summary: '', description: '', content: {items: ['object:seq:1', 'object:seq:2']}}],
    findings: [{id: 'finding:collection:seq', content: {collection: 'collection:seq'}}]
  });
  renderer.render(sceneFrom(dataset));
  const text = rootEl.textContent;
  check('Case 4 -- a sequence Collection renders each entry\'s own body text, in order',
    text.indexOf('First message.') !== -1
    && text.indexOf('Second message.') !== -1
    && text.indexOf('First message.') < text.indexOf('Second message.'));
}

// Case 5: a roster Collection's entries render via rosterEntryNode, including the same
// preview image a grid/sequence card would show (record 702).
{
  const dataset = baseDataset({
    id: 'dataset:world:roster',
    objects: [{
      id: 'object:roster:1', type: 'social.member', title: 'A member', name: 'A member', summary: 'Member · Inner', description: '',
      content: {body: [{node: 'media', kind: 'image', resource_or_object_ref: 'resource:roster:avatar:1'}]},
      resources: [], actions: [], relationships: []
    }],
    resources: [{id: 'resource:roster:avatar:1', type: 'resource', content: {kind: 'image', source: 'https://img.example.com/avatar.jpg'}}],
    collections: [{id: 'collection:roster', type: 'roster', title: 'Members', name: '', summary: '1 member', description: '', content: {items: ['object:roster:1']}}],
    findings: [{id: 'finding:collection:roster', content: {collection: 'collection:roster'}}]
  });
  renderer.render(sceneFrom(dataset));
  const rosterList = rootEl.querySelector('.world-roster-list');
  const img = rosterList ? rosterList.querySelector('img') : null;
  check('Case 5 -- a roster Collection renders each entry with the same preview image a grid/sequence card would',
    !!rosterList && /A member/.test(rosterList.textContent) && !!img && img.src === 'https://img.example.com/avatar.jpg');
}

// Case 6: an opened panel renders summary AND body additively -- never suppressing either
// based solely on the other's presence (decision.summary_is_descriptive_not_a_content_
// excerpt_20261024, Phase 3j).
{
  const dataset = baseDataset({
    id: 'dataset:world:opened-additive',
    objects: [{
      id: 'object:additive', type: 'test.object', title: 'Additive', name: '', summary: 'A real descriptive summary.', description: '',
      content: {body: [{node: 'paragraph', text: 'Real body text, distinct from the summary.'}]},
      resources: [], actions: [], relationships: []
    }],
    placements: [{id: 'placement:additive:carry', type: 'carry', content: {object: 'object:additive'}}],
    context: {objects: {'object:additive': {title: 'Additive', depth: 0, history: []}}, focus: {object_id: 'object:additive'}}
  });
  const scene = sceneFrom(dataset, [{id: 'carry-panel:object:additive', objectId: 'object:additive', x: 0, y: 0, width: 320, height: 200, z: 1, collapsed: false}]);
  renderer.render(scene);
  const panel = rootEl.querySelector('[data-carry-panel-id="carry-panel:object:additive"]');
  const content = panel ? panel.querySelector('.carry-object-panel__content') : null;
  check('Case 6 -- an opened panel shows summary and body together, never suppressing either',
    !!content
    && content.textContent.indexOf('A real descriptive summary.') !== -1
    && content.textContent.indexOf('Real body text, distinct from the summary.') !== -1);
}

// Case 7: a Finding pulled onto Carry without being opened (no carry Placement, no
// context.objects entry) shows its summary, thumbnail, and actions via carryFindingBody --
// never the opened-panel's Collection/member machinery.
{
  const dataset = baseDataset({
    id: 'dataset:world:carried-not-opened',
    objects: [{
      id: 'object:carried', type: 'web_result', title: 'Carried result', name: '', summary: 'A carried summary.', description: '',
      content: {body: [{node: 'media', kind: 'image', resource_or_object_ref: 'resource:carried:thumb:1', alt: 'Carried result'}]},
      resources: [], actions: [], relationships: []
    }],
    // Actions are Dataset-level, matched to an Object by target -- never embedded on the
    // Object itself.
    actions: [{id: 'action:carried:open', type: 'open_object', target: 'object:carried', availability: {state: 'enabled', reason: ''}, content: {label: 'Open result', operation_invocation: {service: 'find.elonn', operation: 'find.open', object_id: 'https://example.com', payload: {}}}}],
    resources: [{id: 'resource:carried:thumb:1', type: 'resource', content: {kind: 'image', source: 'https://img.example.com/carried.jpg'}}]
    // Deliberately no placements / context.objects entry: this Object is NOT opened.
  });
  const scene = sceneFrom(dataset, [{id: 'carry-panel:object:carried', objectId: 'object:carried', x: 0, y: 0, width: 280, height: 160, z: 1, collapsed: false}]);
  if (scene.carryPanels.length !== 1 || scene.carryPanels[0].opened !== false) {
    throw new Error('setup: fixture Object was unexpectedly marked opened');
  }
  renderer.render(scene);
  const panel = rootEl.querySelector('[data-carry-panel-id="carry-panel:object:carried"]');
  const content = panel ? panel.querySelector('.carry-object-panel__content') : null;
  check('Case 7 -- a carried-but-unopened Finding shows summary, thumbnail, and its action, without opened-panel Collection chrome',
    !!content
    && content.textContent.indexOf('A carried summary.') !== -1
    && content.querySelector('img') !== null
    && content.querySelector('img').src === 'https://img.example.com/carried.jpg'
    && /Open result/.test(content.textContent)
    && content.querySelector('.object-decomposition') === null);
}

// Canonical text remains independent even when stale nested fields are present.
// Exercise the promoted-media rendering path, which formerly preferred content.title.
for (const title of ['Canonical media title', '']) {
  const dataset = baseDataset({
    objects: [
      {id: 'object:container', type: 'test.object', title: 'Container', name: '', summary: '', description: '', content: {}},
      {id: 'object:media', type: 'video', title, name: 'Independent name', summary: '', description: 'Independent description',
       content: {title: 'Stale nested title', summary: 'Stale nested summary', name: 'Stale nested name', description: 'Stale nested description', source: 'https://example.com/movie.mp4', playback: 'native'}}
    ],
    placements: [{id: 'placement:container', type: 'carry', content: {object: 'object:container'}}],
    context: {objects: {'object:container': {title: 'Container', depth: 0, history: [], members: ['object:media']}}}
  });
  const parsed = runtime.DatasetParser.parse(dataset);
  const media = parsed.objects.find((object) => object.id === 'object:media');
  check('Canonical text parser preserves title/blank summary without nested or sibling substitution: ' + JSON.stringify(title),
    media.title === title && media.summary === '');
  renderer.render(sceneFrom(dataset, [{id: 'carry-panel:object:container', objectId: 'object:container', x: 0, y: 0, width: 320, height: 200, z: 1, collapsed: false}]));
  const frame = rootEl.querySelector('.web-video');
  const heading = frame ? frame.querySelector('.web-video__title') : null;
  check('Promoted media renders only its canonical title, including blank: ' + JSON.stringify(title),
    !!frame && (title ? !!heading && heading.textContent === title : heading === null)
    && !frame.textContent.includes('Stale nested title'));
}

checks.forEach((c) => console.log((c.passed ? 'PASS' : 'FAIL') + ': ' + c.label));
if (checks.some((c) => !c.passed)) process.exit(1);
JS;

$htmlTemp = tempnam(sys_get_temp_dir(), 'web-runtime-html-');
$scriptTemp = tempnam(sys_get_temp_dir(), 'web-renderer-dom-');
if (!is_string($htmlTemp) || !is_string($scriptTemp)) {
    fwrite(STDERR, "Could not create temp files.\n");
    exit(1);
}

file_put_contents($htmlTemp, $html);
file_put_contents($scriptTemp, $script);
$command = 'NODE_PATH=' . escapeshellarg($root . '/node_modules') . ' node ' . escapeshellarg($scriptTemp) . ' ' . escapeshellarg($root) . ' ' . escapeshellarg($htmlTemp) . ' 2>&1';
exec($command, $output, $status);
unlink($htmlTemp);
unlink($scriptTemp);

echo implode(PHP_EOL, $output) . PHP_EOL;
exit($status === 0 ? 0 : 1);
