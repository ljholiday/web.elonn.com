<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$template = read_file($root . '/templates/runtime.php');
$index = read_file($root . '/public/index.php');
$config = read_file($root . '/config/config.php');
$envExample = read_file($root . '/.env.example');
$readme = read_file($root . '/README.md');
$scripts = '';
foreach (glob($root . '/public/assets/js/runtime-kit/*.js') ?: [] as $script) {
    $scripts .= "\n/* " . basename($script) . " */\n" . read_file($script);
}

$checks = [
    'Home and runtime-dataset both serve the World Dataset runtime' => str_contains($index, "\$path !== '/' && \$path !== '/runtime-dataset'")
        && str_contains($template, 'data-world-runtime')
        && str_contains($template, 'elonn.world.dataset v1'),
    'Web configuration exposes only World as a service dependency' => str_contains($config, "'world'")
        && str_contains($config, 'ELONN_WORLD_BASE_URL')
        && !str_contains($config, 'ELONN_API_BASE_URL')
        && !str_contains($config, 'ELONN_FIND_BASE_URL')
        && !str_contains($config, 'ELONN_SOCIAL_BASE_URL')
        && !str_contains($config, 'ELONN_TIME_BASE_URL')
        && !str_contains($envExample, 'ELONN_API_BASE_URL')
        && !str_contains($envExample, 'ELONN_FIND_BASE_URL')
        && !str_contains($envExample, 'ELONN_SOCIAL_BASE_URL')
        && !str_contains($envExample, 'ELONN_TIME_BASE_URL'),
    'Runtime requests only the canonical World Call endpoint' => str_contains($scripts, "postJson('/world/call'")
        && str_contains($scripts, "id: 'call:runtime:web:'")
        && str_contains($scripts, 'content:')
        && str_contains($scripts, 'context:')
        && str_contains($index, "'id' => 'call:runtime:web:fallback'")
        && str_contains($index, "/world/call")
        && !str_contains($scripts . $index, '/world/session')
        && !str_contains($scripts . $index, 'elonn.world.session_request')
        && !str_contains($scripts, '/world/runtime')
        && !str_contains($scripts, '/world/translated')
        && !str_contains($scripts, 'provider_source_profile'),
    'Runtime dispatches only through World Calls' => str_contains($scripts, 'dispatchWorldAction')
        && str_contains($scripts, "postJson('/world/call'")
        && str_contains($scripts, 'dispatchWorldAction')
        && !str_contains($scripts, '/world/actions/')
        && !str_contains($scripts, 'messages.elonn')
        && !str_contains($scripts, 'social.elonn')
        && !str_contains($scripts, 'find.elonn')
        && !str_contains($scripts, 'time.elonn')
        && !str_contains($scripts, 'maps.elonn'),
    'Shared runtime kit has the required ABI boundaries' => str_contains($scripts, 'WorldClient')
        && str_contains($scripts, 'DatasetParser')
        && str_contains($scripts, 'StateIndexer')
        && str_contains($scripts, 'ActionDispatcher')
        && str_contains($scripts, 'ContinuityReconciler')
        && str_contains($scripts, 'SceneModel'),
    'Runtime validates every independently versioned section' => str_contains($scripts, "'identity'")
        && str_contains($scripts, "'context'")
        && str_contains($scripts, "'objects'")
        && str_contains($scripts, "'relationships'")
        && str_contains($scripts, "'actions'")
        && str_contains($scripts, "'collections'")
        && str_contains($scripts, "'layout'")
        && str_contains($scripts, "'capabilities'")
        && str_contains($scripts, "'permissions'")
        && str_contains($scripts, "'resources'")
        && str_contains($scripts, "'extensions'")
        && str_contains($scripts, "'metadata'"),
    'Collections and resources are first-class scene inputs' => str_contains($scripts, 'state.indexes.collections[collectionId]')
        && str_contains($scripts, 'resourcesForObject')
        && str_contains($scripts, 'resource_id'),
    'Runtime consumes World layout as semantic layers and regions' => str_contains($scripts, 'orderedCollectionIds')
        && str_contains($scripts, 'layout.relevance_order')
        && str_contains($scripts, 'layout.layers')
        && str_contains($scripts, 'layout.regions')
        && str_contains($scripts, 'collection_ids')
        && str_contains($template, 'data-layer-zone="carry:main_content"')
        && str_contains($template, 'data-layer-zone="findings:findings"')
        && str_contains($template, 'data-layer-zone="field:field"'),
    'Runtime carries continuity through World session state' => str_contains($scripts, 'runtimeSessionId')
        && str_contains($scripts, 'runtime_session_id')
        && str_contains($scripts, 'selected_collection_id')
        && str_contains($scripts, 'selected_object_id'),
    'Runtime projects Carry Findings and Field as environment anchors' => str_contains($template, 'data-field-projection')
        && str_contains($template, 'carry-top')
        && str_contains($template, 'carry-bottom')
        && str_contains($template, 'carry-panel--left')
        && str_contains($template, 'finding-overlay')
        && str_contains($scripts, 'fieldMarker')
        && str_contains($scripts, 'focusNode')
        && str_contains($scripts, 'resourceNodes')
        && str_contains($scripts, 'relatedNodes'),
    'Runtime avoids page-section rendering of environment layers' => !str_contains($template, '<h2 id="findings-heading"')
        && !str_contains($template, '<h2 id="field-heading"')
        && !str_contains($template, 'world-layers')
        && !str_contains($template, 'carry-center'),
    'Runtime keeps provider and contract diagnostics out of the main experience' => !str_contains($template, 'data-runtime-contract')
        && !str_contains($template, 'data-runtime-system')
        && !str_contains($scripts, 'Provider dependencies'),
    'Runtime has a server-rendered no-JS World Dataset fallback' => str_contains($index, 'web_runtime_fallback_dataset')
        && str_contains($index, "'scope' => 'server_fallback'")
        && str_contains($template, 'web_runtime_fallback_collections')
        && str_contains($template, '<noscript>'),
    'Legacy runtime vocabulary is quarantined outside the new app' => !contains_any($template . $scripts . $readme, [
        'surface_runtime',
        'field_runtime',
        'service_binding',
        'runtime_panel',
        'loadMessages',
        'loadSocial',
        'loadTime',
    ]),
    'Legacy app is documented as moved aside' => is_dir(dirname($root) . '/web.elonn.local.legacy-runtime')
        && str_contains($readme, 'web.elonn.local.legacy-runtime'),
];

$failed = 0;
foreach ($checks as $label => $passed) {
    echo ($passed ? 'PASS' : 'FAIL') . ': ' . $label . PHP_EOL;
    $failed += $passed ? 0 : 1;
}

exit($failed === 0 ? 0 : 1);

function read_file(string $path): string
{
    $contents = file_get_contents($path);
    return is_string($contents) ? $contents : '';
}

/**
 * @param array<int, string> $needles
 */
function contains_any(string $haystack, array $needles): bool
{
    foreach ($needles as $needle) {
        if (str_contains($haystack, $needle)) {
            return true;
        }
    }

    return false;
}
