<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$template = read_file($root . '/templates/runtime.php');
$loginTemplate = read_file($root . '/templates/login.php');
$index = read_file($root . '/public/index.php');
$config = read_file($root . '/config/config.php');
$envExample = read_file($root . '/.env.example');
$readme = read_file($root . '/README.md');
$scripts = '';
foreach (runtime_scripts($template) as $script) {
    $scripts .= "\n/* " . $script . " */\n" . read_file($root . '/public/assets/js/runtime-kit/' . $script);
}
$webRuntime = read_file($root . '/public/assets/js/runtime-kit/web-runtime.js');
$webRenderer = read_file($root . '/public/assets/js/runtime-kit/web-renderer.js');
$adapterRegistry = read_file($root . '/public/assets/js/runtime-kit/adapter-registry.js');
$paintAdapter = read_file($root . '/public/assets/js/runtime-kit/adapters/paint-editor.js');
$oldWorkspaceTerms = [
    'Find' . 'ings Layer',
    'find' . 'ing-overlay',
    'find' . 'ings:find' . 'ings',
    "'find" . "ings'",
];

$checks = [
    'Home and runtime-dataset both serve the canonical World Dataset runtime' => str_contains($index, "\$path !== '/' && \$path !== '/runtime-dataset'")
        && str_contains($template, 'data-world-runtime')
        && str_contains($template, 'canonical World Datasets'),
    'Web configuration exposes API for login and World for runtime data' => str_contains($config, "'api'")
        && str_contains($config, "'auth'")
        && str_contains($config, 'ELONN_API_BASE_URL')
        && str_contains($config, 'ELONN_COOKIE_DOMAIN')
        && str_contains($envExample, 'ELONN_API_BASE_URL')
        && str_contains($envExample, 'ELONN_COOKIE_DOMAIN')
        && str_contains($config, "'world'")
        && str_contains($config, 'ELONN_WORLD_BASE_URL')
        && !str_contains($config, 'ELONN_FIND_BASE_URL')
        && !str_contains($config, 'ELONN_SOCIAL_BASE_URL')
        && !str_contains($config, 'ELONN_TIME_BASE_URL')
        && !str_contains($envExample, 'ELONN_FIND_BASE_URL')
        && !str_contains($envExample, 'ELONN_SOCIAL_BASE_URL')
        && !str_contains($envExample, 'ELONN_TIME_BASE_URL'),
    'Runtime authentication is owned by Web and login is backed by API' => str_contains($index, 'web_runtime_auth_token')
        && !str_contains($index, "web_runtime_api_request(\$api, 'GET', '/identity/me'")
        && str_contains($index, "web_runtime_api_request(\$api, 'POST', '/identity/login'")
        && str_contains($index, "web_runtime_api_request(\$api, 'POST', '/identity/logout'")
        && str_contains($index, 'elonn_api_token')
        && str_contains($index, "\$path === '/login'")
        && str_contains($index, "\$path === '/logout'")
        && str_contains($loginTemplate, 'Runtime-owned login for Elonn Web')
        && str_contains($loginTemplate, 'action="/login"')
        && !str_contains($index . $template . $loginTemplate, 'elonn.local/account/login')
        && !str_contains($index . $template . $loginTemplate, 'elonn.com/account/login'),
    'Web sends runtime calls directly to World with the access token cookie' => !str_contains($index, "\$path === '/world/call'")
        && !str_contains($index, 'web_runtime_world_call')
        && str_contains($template, 'data-world-base-url="<?= htmlspecialchars($world')
        && str_contains($scripts, "credentials: 'include'")
        && !str_contains($scripts, 'Authorization: Bearer'),
    'Runtime requests only the canonical World Call endpoint' => str_contains($scripts, "postJson('/world/call'")
        && str_contains($scripts, "id: 'call:runtime:web:'")
        && str_contains($scripts, "operation: String(state.operation || 'world.compose')")
        && str_contains($scripts, "text: String(state.inputText || 'Open my world.')")
        && str_contains($scripts, 'content:')
        && str_contains($scripts, 'context:')
        && str_contains($index, "'id' => 'call:runtime:web:fallback'")
        && str_contains($index, "'operation' => 'world.compose'")
        && str_contains($index, "/world/call")
        && !str_contains($scripts . $index, '/world/session')
        && !str_contains($scripts . $index, 'elonn.world.session_request')
        && !str_contains($scripts, '/world/runtime')
        && !str_contains($scripts, '/world/translated')
        && !str_contains($scripts, 'provider_source_profile'),
    'Runtime exposes query composer input and voice control' => str_contains($template, 'data-runtime-query-form')
        && str_contains($template, 'data-runtime-query-input')
        && str_contains($template, 'data-runtime-voice')
        && str_contains($template, 'type="search"')
        && str_contains($scripts, "queryForm.addEventListener('submit'")
        && str_contains($scripts, 'submitQuery')
        && str_contains($scripts, 'speechRecognition')
        && str_contains($scripts, 'webkitSpeechRecognition'),
    'Runtime queries include browser origin for World when available' => str_contains($scripts, 'needsBrowserOrigin')
        && str_contains($scripts, 'navigator.geolocation.getCurrentPosition')
        && str_contains($scripts, 'call.content.origin')
        && str_contains($scripts, 'call.content.radius_meters')
        && str_contains($scripts, 'radiusMeters')
        && str_contains($scripts, 'Location is required for nearby requests.')
        && str_contains($scripts, 'loadDataset(request)')
        && str_contains($scripts, 'near me|nearby|around me|close to me|in my area')
        && !str_contains($scripts, '/maps/call'),
    'Runtime capabilities advertise keyboard voice and pointer without action dispatch' => str_contains($scripts, 'keyboard: true')
        && str_contains($scripts, 'voice: true')
        && str_contains($scripts, 'pointer: true')
        && str_contains($scripts, 'touch: false'),
    'Runtime does not dispatch unsupported actions as World Calls' => str_contains($scripts, "postJson('/world/call'")
        && !str_contains($scripts, 'dispatchWorldAction')
        && !str_contains($scripts, 'ActionDispatcher')
        && !str_contains($scripts, 'Dispatching World action')
        && !str_contains($scripts, "inputText: String(action.label")
        && !str_contains($scripts, '/world/actions/')
        && !str_contains($scripts, 'messages.elonn')
        && !str_contains($scripts, 'social.elonn')
        && !str_contains($scripts, 'find.elonn')
        && !str_contains($scripts, 'time.elonn')
        && !str_contains($scripts, 'maps.elonn'),
    'Runtime publishes a hosted surface adapter registry' => str_contains($template, 'adapter-registry.js')
        && str_contains($adapterRegistry, 'AdapterRegistry')
        && str_contains($adapterRegistry, 'register')
        && str_contains($adapterRegistry, 'mountAll')
        && str_contains($adapterRegistry, 'handleResponse')
        && str_contains($webRuntime, 'dispatchSurfaceCommand')
        && str_contains($webRuntime, 'removeObjectSurface')
        && str_contains($webRenderer, 'dataset.hostedSurface'),
    'Paint interaction lives in a runtime adapter instead of Web core' => str_contains($template, 'adapters/paint-editor.js')
        && str_contains($paintAdapter, "register('paint', 'editor'")
        && str_contains($paintAdapter, "operation: 'paint.draw'")
        && str_contains($paintAdapter, 'dataset.paintSurface')
        && str_contains($paintAdapter, 'mind.paint_document_not_found')
        && !str_contains($webRuntime, 'paint.draw')
        && !str_contains($webRuntime, 'Paint endpoint returned HTTP 404.')
        && !str_contains($webRuntime, 'paintLocalOperations')
        && !str_contains($webRenderer, 'paint.source')
        && !str_contains($webRenderer, 'paint-surface'),
    'Shared runtime kit has the required ABI boundaries' => str_contains($scripts, 'WorldClient')
        && str_contains($scripts, 'DatasetParser')
        && str_contains($scripts, 'StateIndexer')
        && str_contains($scripts, 'ContinuityReconciler')
        && str_contains($scripts, 'SceneModel'),
    'Runtime validates the canonical Dataset fields directly' => str_contains($scripts, "datasetFields")
        && str_contains($scripts, "'context'")
        && str_contains($scripts, "'objects'")
        && str_contains($scripts, "'relationships'")
        && str_contains($scripts, "'actions'")
        && str_contains($scripts, "'collections'")
        && str_contains($scripts, "'resources'")
        && str_contains($scripts, "'placements'")
        && str_contains($scripts, "'errors'")
        && !str_contains($scripts, "contract.name !== 'elonn.world.dataset'")
        && !str_contains($scripts, "'layout'"),
    'Runtime treats dependency Dataset errors as degraded loaded state' => str_contains($scripts, 'datasetStatusState')
        && str_contains($scripts, "error.class === 'dependency'")
        && str_contains($scripts, "return 'ready';")
        && str_contains($scripts, "return 'error';"),
    'Collections and resources are first-class scene inputs' => str_contains($scripts, 'state.indexes.collections[collectionId]')
        && str_contains($scripts, 'resourcesForObject')
        && str_contains($scripts, 'resourceIds'),
    'Returned actions remain latent scene affordances instead of rendered controls' => str_contains($scripts, 'Action execution is not available yet.')
        && str_contains($scripts, "state: 'unavailable'")
        && !str_contains($template, 'data-runtime-actions')
        && !str_contains($scripts, 'world-action')
        && !str_contains($scripts, 'button.disabled = true')
        && !str_contains($scripts, "button.setAttribute('aria-disabled', 'true')"),
    'Carry panels are runtime-local floating objects controlled by title text' => str_contains($template, 'data-runtime-carry-panels')
        && str_contains($scripts, 'carryStorageKey')
        && str_contains($scripts, 'localStorage')
        && str_contains($scripts, 'carryObject(')
        && str_contains($scripts, "root.addEventListener('pointerdown'")
        && str_contains($scripts, "window.addEventListener('pointermove'")
        && str_contains($scripts, "window.addEventListener('pointerup'")
        && str_contains($scripts, 'event.preventDefault()')
        && str_contains($template . $scripts . read_file($root . '/public/assets/css/runtime.css'), 'touch-action: none')
        && str_contains($scripts, 'data-carry-panel-resize')
        && str_contains($scripts, 'resizeBounds')
        && str_contains($scripts, 'panelState.width')
        && str_contains($scripts, 'panelState.height')
        && str_contains($scripts, 'resizeHandle')
        && str_contains($scripts, 'root.getBoundingClientRect()')
        && str_contains($scripts, 'lastCarryTitleTap')
        && str_contains($scripts, 'recordCarryTitleTap')
        && str_contains($scripts, 'drag.moved')
        && str_contains($scripts, 'carryPanelTitle')
        && str_contains($scripts, 'carryPanelNodes')
        && str_contains($scripts, 'carry-object-panel__title')
        && str_contains($scripts, 'carry-object-panel__content')
        && str_contains($scripts, 'data-carry-panel-close')
        && str_contains($scripts, 'closeCarryPanel'),
    'Runtime does not revive stale local carry panel Object snapshots' => str_contains($webRuntime, 'state.indexes.objects[String(panel.objectId || \'\')] || null')
        && str_contains($webRuntime, 'reconcileCarryPanels(loadCarryPanels())')
        && str_contains($webRuntime, 'object: carrySnapshot(object)')
        && str_contains($webRenderer, 'carryPanelNodes')
        && str_contains(read_file($root . '/tests/canonical-runtime-kit-test.php'), 'stale local carry panel snapshot')
        && !str_contains($webRuntime, '|| panel.object || null')
        && !str_contains(read_file($root . '/public/assets/js/runtime-kit/scene-model.js'), '|| panel.object || null'),
    'Runtime translates canonical Placement without World layout' => str_contains($scripts, 'dataset.placements')
        && str_contains($scripts, "['carry', 'workspace', 'field']")
        && str_contains($scripts, 'objectIds')
        && !str_contains($template, 'data-layer-zone="carry:main_content"')
        && !str_contains($template, 'data-layer-zone="carry:bottom_dock"')
        && str_contains($template, 'data-layer-zone="workspace:workspace"')
        && str_contains($template, 'data-layer-zone="field:field"'),
    'Runtime carries continuity through local Dataset state' => str_contains($scripts, 'runtimeSessionId')
        && str_contains($scripts, 'dataset_id')
        && str_contains($scripts, 'selected_collection_id')
        && str_contains($scripts, 'selectedObjectId')
        && str_contains($scripts, 'focus.object_id'),
    'Runtime hosts service-provided Object surfaces generically' => str_contains($scripts, 'object.surface && object.surface.mode')
        && str_contains($scripts, 'hostedSurface(object)')
        && str_contains($scripts, 'surfaceService')
        && str_contains($scripts, 'surface.resources')
        && str_contains($scripts, 'content.width')
        && str_contains(read_file($root . '/public/assets/css/runtime.css'), 'hosted-object-surface__preview')
        && !str_contains($scripts, "object.type === 'paint.document'"),
    'Runtime renders Resource image previews generically' => str_contains($webRenderer, 'imagePreview(object)')
        && str_contains($webRenderer, 'data:image/')
        && str_contains($webRenderer, 'object-preview')
        && str_contains(read_file($root . '/public/assets/css/runtime.css'), '.object-preview')
        && !str_contains($webRenderer, 'paint.preview'),
    'Runtime projects Carry Workspace and Field as environment anchors' => str_contains($template, 'data-field-projection')
        && str_contains($template, 'query-composer')
        && str_contains($template, 'data-runtime-carry-panels')
        && str_contains($template, 'workspace-layer')
        && str_contains($scripts, 'fieldMarker')
        && str_contains($scripts, 'carryPanelNodes')
        && !str_contains($scripts, 'focusNode')
        && !str_contains($scripts, 'resourceNodes')
        && !str_contains($scripts, 'relatedNodes'),
    'Runtime avoids page-section rendering of environment layers' => !str_contains($template, '<h2 id="find' . 'ings-heading"')
        && !str_contains($template, '<h2 id="field-heading"')
        && !str_contains($template, 'world-layers')
        && !str_contains($template, 'carry-center'),
    'Runtime keeps provider and contract diagnostics out of the main experience' => !str_contains($template, 'data-runtime-contract')
        && !str_contains($template, 'data-runtime-system')
        && !str_contains($scripts, 'Provider dependencies'),
    'Runtime has a server-rendered no-JS World Dataset fallback' => str_contains($index, 'web_runtime_fallback_dataset')
        && str_contains($index, "'scope' => 'server_fallback'")
        && str_contains($index, "array_key_exists('errors', \$payload)")
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
        ...$oldWorkspaceTerms,
    ]),
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
 * @return array<int, string>
 */
function runtime_scripts(string $template): array
{
    if (preg_match('/\\$scripts\\s*=\\s*\\[(.*?)\\];/s', $template, $matches) !== 1) {
        return [];
    }

    preg_match_all("/'([^']+\\.js)'/", $matches[1], $scriptMatches);
    return $scriptMatches[1] ?? [];
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
