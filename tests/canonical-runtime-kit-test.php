<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$script = <<<'JS'
const fs = require('fs');
const vm = require('vm');

const root = process.argv[2];
const context = {
  window: {},
  navigator: {language: 'en-US'},
  Intl: {
    DateTimeFormat: function () {
      return {
        resolvedOptions: function () {
          return {timeZone: 'America/Los_Angeles'};
        }
      };
    }
  }
};
context.window.ElonnWorldRuntime = {};
vm.createContext(context);

['common.js', 'world-client.js', 'dataset-parser.js', 'state-indexer.js', 'scene-model.js'].forEach((file) => {
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
  actions: [{id: 'action:one:open', type: 'open', target: 'object:one', availability: {state: 'unavailable', reason: 'Reply once you have joined.'}, content: {label: 'Open'}}],
  relationships: [],
  collections: [{id: 'collection:one', type: 'collection', content: {items: ['object:one']}}],
  resources: [],
  placements: [{id: 'placement:one:carry', type: 'carry', content: {collection: 'collection:one'}}],
  errors: [],
  // World names the focused Object; the runtime never picks one (dev.elonn canonical/dataset.md).
  context: {focus: {object_id: 'object:one'}}
};

const paintDataset = Object.assign({}, dataset, {
  id: 'dataset:world:paint',
  objects: [{
    id: 'paint.document:test',
    type: 'paint.document',
    title: 'Sketch',
    summary: 'Paint document',
    content: {
      name: 'Sketch',
      description: 'Paint document',
      width: 1024,
      height: 768,
      source_resource: 'resource:11111111111111111111111111111111',
      preview_resource: 'resource:22222222222222222222222222222222',
      storage_state: 'ready',
      surface: {
        mode: 'hosted',
        service: 'paint',
        kind: 'editor',
        resources: {
          source: 'resource:11111111111111111111111111111111',
          preview: 'resource:22222222222222222222222222222222'
        }
      }
    },
    resources: [
      'resource:11111111111111111111111111111111',
      'resource:22222222222222222222222222222222'
    ]
  }],
  collections: [{id: 'collection:paint', type: 'collection', content: {items: ['paint.document:test']}}],
  context: {focus: {object_id: 'paint.document:test'}},
  resources: [{
    id: 'resource:11111111111111111111111111111111',
    type: 'application/vnd.elonn.paint+json',
    content: {
      kind: 'paint.source',
      label: 'Paint source',
      source: {
        type: 'paint.source',
        width: 1024,
        height: 768,
        operations: [{
          type: 'stroke',
          tool: 'pencil',
          style: {color: '#000000', width: 4},
          geometry: {points: [{x: 1, y: 2}, {x: 3, y: 4}]}
        }]
      }
    }
  }, {
    id: 'resource:22222222222222222222222222222222',
    type: 'image/png',
    content: {
      kind: 'paint.preview',
      label: 'Paint preview',
      data_url: 'data:image/png;base64,iVBORw0KGgo='
    }
  }],
  placements: [{id: 'placement:paint:carry', type: 'carry', content: {object: 'paint.document:test'}}]
});

const parsed = runtime.DatasetParser.parse(dataset);
if (parsed.errors.length !== 0) throw new Error('errors array was not preserved');
if (parsed.collections[0].items[0] !== 'object:one') throw new Error('canonical collection item ids were not preserved');
if (parsed.actions[0].target_id !== 'object:one') throw new Error('canonical action target was not parsed');

const state = runtime.StateIndexer.build(parsed, null);
if (state.layers[0].zones[0].collectionIds[0] !== 'collection:one') throw new Error('carry placement was not projected');
const scene = runtime.SceneModel.fromState(state);
// World owns availability (Composer::withNormalisedAvailability); the runtime renders {state, reason} verbatim.
if (scene.actions[0].availability.state !== 'unavailable') throw new Error('runtime must pass through the World-set availability state, not synthesise one');
if (scene.actions[0].availability.reason !== 'Reply once you have joined.') throw new Error('runtime must pass through the World-set availability reason verbatim');

const operationDataset = Object.assign({}, dataset, {
  id: 'dataset:world:operation-action',
  objects: [{
    id: 'paint.workspace',
    type: 'paint.workspace',
    content: {name: 'Paint', description: 'Create a new Paint drawing document.'}
  }],
  actions: [{
    id: 'action:paint.workspace:create',
    type: 'operation',
    target: 'paint.workspace',
    content: {
      label: 'Create drawing',
      operation_invocation: {
        service: 'paint',
        operation: 'paint.create',
        object_id: 'paint.workspace',
        payload: {}
      }
    }
  }],
  collections: [{id: 'collection:paint.workspace', type: 'collection', content: {items: ['paint.workspace']}}],
  placements: [],
  context: {focus: {object_id: 'paint.workspace'}}
});
const operationState = runtime.StateIndexer.build(runtime.DatasetParser.parse(operationDataset), null);
const operationScene = runtime.SceneModel.fromState(operationState);
if (operationScene.actions[0].availability.state !== 'enabled') throw new Error('operation action was not enabled');
if (operationScene.actions[0].operationInvocation.operation !== 'paint.create') throw new Error('operation invocation was not projected');

const paintState = runtime.StateIndexer.build(runtime.DatasetParser.parse(paintDataset), null);
const paintScene = runtime.SceneModel.fromState(paintState);
if (paintScene.focus.surface.mode !== 'hosted') throw new Error('hosted Object surface was not projected');
if (paintScene.focus.surface.service !== 'paint') throw new Error('hosted Object surface service was not projected');
if (paintScene.focus.content.width !== 1024 || paintScene.focus.content.height !== 768) throw new Error('hosted Object dimensions were not preserved');
if (paintScene.focus.resources.length !== 2) throw new Error('hosted Object Resources were not projected');
if (paintScene.focus.resources[0].content.source.operations.length !== 1) throw new Error('Paint source Resource content was not projected');
if (paintScene.focus.resources[1].content.data_url.indexOf('data:image/png;base64,') !== 0) throw new Error('Paint preview Resource data URL was not projected');
paintState.carryPanels = [{id: 'carry-panel:paint.document:test', objectId: 'paint.document:test', x: 10, y: 10, width: 360, height: 240, z: 24, collapsed: false}];
const paintCarryScene = runtime.SceneModel.fromState(paintState);
if (paintCarryScene.carryPanels[0].object.surface.kind !== 'editor') throw new Error('hosted Object surface was not available in carry panel');

const websiteDataset = Object.assign({}, dataset, {
  id: 'dataset:world:website',
  objects: [{
    id: 'finding:website',
    type: 'website.resource',
    title: 'Ballard Pizza',
    content: {
      name: 'Ballard Pizza',
      description: 'Neighborhood pizza.',
      document_resource: 'resource:finding:website:document'
    },
    resources: ['resource:finding:website:source', 'resource:finding:website:document']
  }, {
    id: 'finding:website:segment:menu',
    type: 'menu',
    title: 'Menu',
    content: {
      name: 'Menu',
      description: 'Classic pies and seasonal specials.',
      parent_resource_object_id: 'finding:website',
      segment_order: 1,
      parts: [{
        kind: 'link',
        title: 'Menu',
        href: 'https://ballard.example.test/menu'
      }]
    },
    resources: ['resource:finding:website:source', 'resource:finding:website:document']
  }],
  resources: [{
    id: 'resource:finding:website:source',
    type: 'resource',
    content: {kind: 'link', href: 'https://ballard.example.test', label: 'Ballard Pizza'}
  }, {
    id: 'resource:finding:website:document',
    type: 'application/vnd.elonn.website+json',
    content: {
      kind: 'website.document',
      url: 'https://ballard.example.test',
      domain: 'ballard.example.test',
      title: 'Ballard Pizza',
      description: 'Neighborhood pizza.',
      sections: [{id: 'section:summary', type: 'summary', title: 'Ballard Pizza', text: 'Wood-fired pizza.'}],
      links: [{label: 'Menu', href: 'https://ballard.example.test/menu'}]
    }
  }],
  relationships: [{
    id: 'relationship:website:menu',
    type: 'contains',
    source: 'finding:website',
    target: 'finding:website:segment:menu',
    content: {order: 1}
  }],
  collections: [{id: 'collection:website', type: 'resource.segmented', content: {items: ['finding:website']}}],
  placements: [],
  context: {focus: {object_id: 'finding:website'}}
});
const websiteState = runtime.StateIndexer.build(runtime.DatasetParser.parse(websiteDataset), null);
const websiteScene = runtime.SceneModel.fromState(websiteState);
if (websiteScene.focus.resources[1].kind !== 'website.document') throw new Error('website JSON Resource was not projected');
if (websiteScene.focus.resources[1].content.sections[0].text !== 'Wood-fired pizza.') throw new Error('website JSON sections were not preserved');
if (websiteScene.findings.collections[0].objects.length !== 1) throw new Error('segmented resource children were rendered as first-level result cards');
if (websiteScene.focus.containedObjects[0].type !== 'menu') throw new Error('segmented resource child object was not projected through containment');
if (websiteScene.focus.containedObjects[0].content.parts[0].href !== 'https://ballard.example.test/menu') throw new Error('segmented resource child parts were not projected');
if (websiteScene.focus.containedObjects[0].resources[1].kind !== 'website.document') throw new Error('segmented resource child object did not keep website JSON Resource');

state.carryPanels = [{id: 'carry-panel:object:one', objectId: 'object:one', x: 42, y: 84, width: 280, height: 160, z: 23, collapsed: true}];
const carryScene = runtime.SceneModel.fromState(state);
if (carryScene.carryPanels[0].object.id !== 'object:one') throw new Error('carry panel object was not projected');
if (carryScene.carryPanels[0].collapsed !== true) throw new Error('carry panel collapsed state was not projected');
if (carryScene.carryPanels[0].x !== 42 || carryScene.carryPanels[0].y !== 84) throw new Error('carry panel position was not projected');
if (carryScene.carryPanels[0].width !== 280 || carryScene.carryPanels[0].height !== 160) throw new Error('carry panel size was not projected');
state.carryPanels = [{
  id: 'carry-panel:paint.document:stale',
  objectId: 'paint.document:stale',
  object: {id: 'paint.document:stale', type: 'paint.document', title: 'Stale Paint'}
}];
const staleCarryScene = runtime.SceneModel.fromState(state);
if (staleCarryScene.carryPanels.length !== 0) throw new Error('stale local carry panel snapshot was rendered without a Dataset Object');

// Unplaced content is Findings, presented in the Results pane -- not on a layer (dev.elonn
// canonical/layout.md). It belongs to no opened Object.
const findingsDataset = Object.assign({}, dataset, {
  id: 'dataset:world:findings',
  collections: [{id: 'collection:findings', type: 'collection', content: {items: ['object:one']}}],
  placements: [],
  // A bare search focuses nothing (World sends context.focus.object_id "").
  context: {focus: {object_id: ''}}
});
const findingsState = runtime.StateIndexer.build(runtime.DatasetParser.parse(findingsDataset), null);
if (findingsState.layers.map((layer) => layer.id).join(',') !== 'carry,field') throw new Error('layers are exactly carry and field');
if (findingsState.findings.collectionIds[0] !== 'collection:findings') throw new Error('unplaced collection was not projected as a Finding');
if (findingsState.layers[0].zones[0].collectionIds.length !== 0) throw new Error('an unplaced collection leaked onto the carry layer');
if (findingsState.selectedObjectId !== '') throw new Error('a Findings-only Dataset focuses nothing until the member focuses a Finding');
const findingsScene = runtime.SceneModel.fromState(findingsState);
if (findingsScene.findings.collections[0].id !== 'collection:findings') throw new Error('Findings were not projected into the scene');
if (findingsScene.focus.kind !== 'empty') throw new Error('nothing is focused in a Findings-only scene');

// An Object with a carry Placement is opened on Carry: it gets a context.objects entry and
// world.back/close act on its id.
const openedDataset = Object.assign({}, dataset, {
  id: 'dataset:world:opened',
  placements: [{id: 'placement:one:carry', type: 'carry', content: {object: 'object:one'}}],
  context: {
    objects: {'object:one': {title: 'One', depth: 1, history: [{}], members: ['collection:one']}},
    focus: {object_id: 'object:one'}
  }
});
const openedState = runtime.StateIndexer.build(runtime.DatasetParser.parse(openedDataset), null);
if (openedState.openedObjects.length !== 1 || openedState.openedObjects[0].id !== 'object:one') throw new Error('carry-placed Object was not registered as opened');
if (openedState.openedObjects[0].depth !== 1) throw new Error('per-Object navigation depth was not projected');
openedState.carryPanels = [{id: 'carry-panel:object:one', objectId: 'object:one', x: 10, y: 10, width: 320, height: 200, z: 21, collapsed: false}];
const openedScene = runtime.SceneModel.fromState(openedState);
if (openedScene.carryPanels[0].opened !== true) throw new Error('the opened Object panel was not marked opened');
if (openedScene.carryPanels[0].depth !== 1) throw new Error('the opened Object panel did not carry its navigation depth');
if ((openedScene.carryPanels[0].collections[0] || {}).id !== 'collection:one') throw new Error('the opened Object panel did not carry its member Collection');

let rejected = false;
try {
  runtime.DatasetParser.parse({dataset: {name: 'elonn.world.dataset', version: 1}});
} catch (error) {
  rejected = true;
}
if (!rejected) throw new Error('old wrapper payload was accepted');

const worldClientRoot = {dataset: {worldBaseUrl: 'https://world.elonn.local', runtimeName: 'web'}};
const worldClient = runtime.WorldClient(worldClientRoot);
const worldCall = worldClient.worldCall({
  inputText: 'coffee near me',
  origin: {latitude: 47.6062, longitude: -122.3321},
  radiusMeters: 1000
});
if (worldCall.content.origin.latitude !== 47.6062 || worldCall.content.origin.longitude !== -122.3321) {
  throw new Error('browser origin was not included in the canonical World Call');
}
if (worldCall.content.radius_meters !== 1000) throw new Error('nearby radius was not included in the canonical World Call');
if (worldCall.context.runtime.id !== 'web') throw new Error('runtime identity was not preserved in the World Call');
if (worldCall.context.runtime.capabilities.action_dispatch !== true) throw new Error('operation action dispatch capability was not advertised');
const paintWorldCall = worldClient.worldCall({
  inputText: 'draw stroke',
  selectedObjectId: 'paint.document:test',
  operationInvocation: {
    service: 'paint',
    operation: 'paint.draw',
    object_id: 'paint.document:test',
    payload: {
      stroke: {
        tool: 'pencil',
        style: {color: '#000000', width: 4},
        geometry: {points: [{x: 1, y: 2}, {x: 3, y: 4}]}
      }
    }
  }
});
if (paintWorldCall.content.operation_invocation.operation !== 'paint.draw') throw new Error('operation invocation operation was not preserved');
if (paintWorldCall.content.operation_invocation.payload.stroke.geometry.points.length !== 2) throw new Error('operation invocation stroke was not preserved');
if (paintWorldCall.context.focus.object_id !== 'paint.document:test') throw new Error('operation invocation focus Object was not preserved');

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

echo "PASS: Canonical runtime kit parses and projects Datasets\n";
