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
$runtimeCss = read_file($root . '/public/assets/css/runtime.css');
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
        && str_contains($webRuntime, "loadDataset({operation: 'world.restore'})")
        && str_contains($scripts, "text: String(state.inputText || 'Open my world.')")
        && str_contains($scripts, 'content:')
        && str_contains($scripts, 'context:')
        && str_contains($index, "'id' => 'call:runtime:web:fallback'")
        && str_contains($index, "'operation' => 'world.restore'")
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
        && str_contains($webRuntime, 'dispatchOperationInvocation')
        && !str_contains($webRuntime . $paintAdapter, 'dispatchSurfaceCommand')
        && str_contains($webRuntime, 'operationInvocation')
        && str_contains($adapterRegistry, 'runtimeState.operationInvocation')
        && str_contains(read_file($root . '/public/assets/js/runtime-kit/world-client.js'), 'operation_invocation')
        && str_contains($webRuntime, 'removeObjectSurface')
        && str_contains($webRenderer, 'dataset.hostedSurface'),
    'Runtime leaves hosted surface interaction events to adapters' => str_contains($webRuntime, "event.target.closest('[data-hosted-surface]')")
        && strpos($webRuntime, 'if (hostedSurface && state)') !== false
        && strpos($webRuntime, 'if (hostedSurface && state)') < strpos($webRuntime, 'if (objectButton && state)'),
    'Paint interaction lives in a runtime adapter instead of Web core' => str_contains($template, 'adapters/paint-editor.js')
        && str_contains($paintAdapter, "register('paint', 'editor'")
        && str_contains($paintAdapter, "operation: 'paint.draw'")
        && str_contains($paintAdapter, "operation: 'paint.rename'")
        && str_contains($paintAdapter, 'dataset.paintSurface')
        && str_contains($paintAdapter, 'dataset.paintRenameForm')
        && str_contains($paintAdapter, 'dataset.paintSaveState')
        && str_contains($paintAdapter, 'dataset.paintColor')
        && str_contains($paintAdapter, 'dataset.paintWidth')
        && str_contains($paintAdapter, 'setSaveStateForObject')
        && str_contains($paintAdapter, "setSaveStateForObject(objectId, 'Saved')")
        && str_contains($paintAdapter, "setSaveStateForObject(objectId, 'Error')")
        && str_contains($paintAdapter, 'normalizeColor')
        && str_contains($paintAdapter, 'normalizeWidth')
        && str_contains($paintAdapter, 'mind.paint_document_not_found')
        && !str_contains($webRuntime, 'paint.draw')
        && !str_contains($webRuntime, 'paint.rename')
        && !str_contains($webRuntime, 'paintColor')
        && !str_contains($webRuntime, 'paintWidth')
        && !str_contains($webRuntime, 'Paint endpoint returned HTTP 404.')
        && !str_contains($webRuntime, 'paintLocalOperations')
        && !str_contains($webRenderer, 'paint.source')
        && !str_contains($webRenderer, 'paint-surface'),
    'Paint toolbar settings stay inside the runtime adapter command payload' => str_contains($paintAdapter, "color.type = 'color'")
        && str_contains($paintAdapter, "width.type = 'range'")
        && str_contains($paintAdapter, 'documentSettings')
        && str_contains($paintAdapter, 'settingsFor(object)')
        && str_contains($paintAdapter, 'updateSettings(object, color, width)')
        && str_contains($paintAdapter, 'style: {')
        && str_contains($paintAdapter, 'color: activeStroke.color')
        && str_contains($paintAdapter, 'width: activeStroke.width')
        && !str_contains($webRenderer, 'paint-editor__color')
        && !str_contains($webRenderer, 'paint-editor__width'),
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
    'Runtime does not repeat provider diagnostics in the status line' => str_contains($scripts, 'Some results could not be loaded.')
        && str_contains($scripts, 'World Dataset returned errors.')
        && !str_contains($scripts, "return String(errors[0].message || 'World Dataset returned errors.');"),
    'Collections and resources are first-class scene inputs' => str_contains($scripts, 'state.indexes.collections[collectionId]')
        && str_contains($scripts, 'resourcesForObject')
        && str_contains($scripts, 'resourceIds'),
    'Runtime expands selected resources through contained objects' => str_contains($scripts, 'containedObjects')
        && str_contains($webRenderer, 'containedObjectNodes')
        && str_contains($webRenderer, 'object-decomposition')
        && str_contains($runtimeCss, '.object-decomposition')
        && str_contains(read_file($root . '/tests/canonical-runtime-kit-test.php'), 'segmented resource children were rendered as first-level result cards'),
    'Runtime renders decomposed object parts instead of parent website documents' => str_contains($webRenderer, 'segmentNode')
        && str_contains($webRenderer, 'segmentPartNode')
        && str_contains($webRenderer, 'isDecomposedObject')
        && str_contains($webRenderer, "var website = segment ? null : websiteDocument(object)")
        && str_contains($webRenderer, "resource.kind !== 'website.document'")
        && str_contains($runtimeCss, '.object-segment')
        && str_contains(read_file($root . '/tests/canonical-runtime-kit-test.php'), 'segmented resource child parts were not projected'),
    'Runtime renders empty collection notices where results appear' => str_contains($scripts, 'emptyCollectionNotice')
        && str_contains($scripts, "collection.summary || 'No results.'"),
    'Runtime keeps notification areas at the bottom of the viewport' => str_contains($template, 'runtime-notifications')
        && str_contains($runtimeCss, '.runtime-notifications')
        && str_contains($runtimeCss, '.runtime-session')
        && str_contains($runtimeCss, 'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);')
        && str_contains($runtimeCss, 'grid-template-columns: minmax(0, 1fr);')
        && str_contains($runtimeCss, 'overflow-wrap: anywhere;')
        && str_contains($runtimeCss, '@media (max-width: 920px)')
        && str_contains($runtimeCss, 'justify-items: start;')
        && !str_contains($runtimeCss, "field-projection__status {\n    left: 22px;\n    top:")
        && !str_contains($runtimeCss, "runtime-session {\n    right: 20px;\n    top:"),
    'Workspace results use the search form as the shared panel title bar' => str_contains($template, 'workspace-layer workspace-results-panel')
        && str_contains($template, 'query-composer carry-object-panel__bar workspace-results-panel__bar')
        && str_contains($template, 'query-composer__field carry-object-panel__title')
        && str_contains($template, 'data-workspace-results-content="true"')
        && str_contains($template, 'data-layer-zone="workspace:workspace"')
        && str_contains($template, 'data-workspace-results-toggle="true"')
        && str_contains($template, 'data-workspace-results-clear="true"')
        && !str_contains($template, 'data-workspace-results-title')
        && !str_contains($template, 'data-workspace-results-close')
        && str_contains($webRenderer, "node.closest('[data-workspace-results-panel]')")
        && str_contains($webRenderer, "toggle.textContent = options.collapsed === true ? 'Show' : 'Hide'")
        && str_contains($webRenderer, 'function panelHeader(config)')
        && str_contains($webRenderer, 'function panelButton(config)')
        && str_contains($webRenderer, 'function setDataset(node, key, value)')
        && str_contains($webRenderer, 'carry-object-panel__title')
        && str_contains($webRenderer, 'carry-object-panel__close')
        && str_contains($webRenderer, 'carry-object-panel__actions')
        && str_contains($webRuntime, 'workspaceResultsCollapsed')
        && str_contains($webRuntime, 'workspaceResultsCleared')
        && str_contains($webRuntime, 'clearResults')
        && !str_contains($webRuntime, 'workspaceResultsClosed')
        && str_contains($webRuntime, 'workspaceResultsCleared = true;')
        && str_contains($webRuntime, "renderer.status('Results cleared.', 'neutral')")
        && !str_contains(substr($webRuntime, strpos($webRuntime, 'function clearResults()'), 500), "operation: 'world.clear'")
        && str_contains($webRuntime, 'function toggleWorkspaceResults()')
        && str_contains($webRuntime, 'workspaceToggle')
        && !str_contains($webRuntime, "recordTitleTap('workspace-results')")
        && !str_contains($webRuntime, "panelId === 'workspace-results'")
        && str_contains($webRuntime, 'replaceResults: workspaceResultsCleared')
        && str_contains($webRuntime, 'runtimeState.replaceResults !== true')
        && !str_contains($webRuntime, 'function clearWorkspaceResults')
        && !str_contains(substr($webRuntime, strpos($webRuntime, 'function clearResults()'), 500), "loadDataset({operation: 'world.restore'})")
        && str_contains($runtimeCss, '.workspace-results-panel[data-collapsed="true"] .workspace-results-panel__content'),
    'Returned remote actions remain unavailable without dispatch controls' => str_contains($scripts, 'Action execution is not available yet.')
        && str_contains($scripts, "href !== '' ? 'enabled' : 'unavailable'")
        && !str_contains($template, 'data-runtime-actions')
        && !str_contains($scripts, 'world-action')
        && !str_contains($scripts, 'button.disabled = true')
        && !str_contains($scripts, "button.setAttribute('aria-disabled', 'true')"),
    'Runtime renders safe action links without dispatching remote actions' => str_contains($scripts, 'actionLinks')
        && str_contains($scripts, "linkLine('Action'")
        && str_contains($scripts, "href !== '' ? 'enabled' : 'unavailable'")
        && !str_contains($scripts, 'dispatchWorldAction'),
    'Runtime shows source links on result entries' => str_contains($scripts, 'cardLinks')
        && str_contains($scripts, 'world-object-link')
        && str_contains($runtimeCss, '.world-object-link')
        && str_contains($scripts, "wrapper.appendChild(button)")
        && strpos($webRenderer, "firstHref(object.resources, 'Source'") < strpos($webRenderer, 'if (websiteDocument(object))'),
    'Runtime opens dataset-owned external URLs as existing runtime objects' => str_contains($webRenderer, 'externalHref')
        && str_contains($webRenderer, "document.createElement('button') : document.createElement('a')")
        && str_contains($webRenderer, 'dataset.runtimeUrl')
        && str_contains($webRenderer, 'dataset.runtimeUrlParent')
        && !str_contains($webRenderer, 'dataset.runtimeUrlObject')
        && str_contains($webRuntime, 'openRuntimeUrl')
        && str_contains($webRuntime, 'objectIdForRuntimeUrl')
        && strpos($webRuntime, 'objectIdForRuntimeUrl(url') < strpos($webRuntime, 'ensureRuntimeUrlObject')
        && str_contains($webRuntime, 'objectOwnsRuntimeUrl')
        && str_contains($webRuntime, 'resourceOwnsRuntimeUrl')
        && str_contains($webRuntime, 'normalizeRuntimeUrl')
        && str_contains($webRuntime, 'ensureRuntimeUrlObject')
        && str_contains($webRuntime, "type: 'website.link'")
        && str_contains($runtimeCss, '.world-object-link--runtime')
        && !str_contains($webRenderer, "target = '_blank'")
        && strpos($webRuntime, 'if (runtimeUrl && state)') < strpos($webRuntime, 'if (panelTitle && state)')
        && strpos($webRuntime, 'if (runtimeUrl && state)') < strpos($webRuntime, 'if (hostedSurface && state)'),
    'Runtime does not treat carry panel content as an object selection button' => str_contains($webRuntime, "closest('button[data-object-id]')")
        && !str_contains($webRuntime, "closest('[data-object-id]')"),
    'Runtime renders website JSON resources inside Web' => str_contains($webRenderer, 'websiteDocument')
        && str_contains($webRenderer, 'websiteNode')
        && str_contains($webRenderer, 'website-document__sections')
        && str_contains($webRenderer, 'website-document__links')
        && str_contains($webRenderer, "linkLine('Resource'")
        && str_contains($runtimeCss, '.website-document')
        && str_contains(read_file($root . '/tests/canonical-runtime-kit-test.php'), 'website JSON Resource was not projected'),
    'Carry panels are runtime-local floating objects controlled by title text' => str_contains($template, 'data-runtime-carry-panels')
        && str_contains($scripts, 'carryStorageKey')
        && str_contains($scripts, 'uiStorageKey')
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
        && str_contains($scripts, 'recordTitleTap')
        && str_contains($scripts, 'togglePanel')
        && str_contains($scripts, 'drag.moved')
        && str_contains($scripts, 'carryPanelTitle')
        && str_contains($scripts, 'carryPanelNodes')
        && str_contains($scripts, 'carry-object-panel__title')
        && str_contains($scripts, 'carry-object-panel__content')
        && str_contains($scripts, 'data-carry-panel-close')
        && str_contains($scripts, 'closeCarryPanel'),
    'Runtime restores browser-local UI state without caching World Datasets' => str_contains($webRuntime, 'restoreLocalUiState')
        && str_contains($webRuntime, 'persistLocalUiState')
        && str_contains($webRuntime, "loadDataset({operation: 'world.restore'})")
        && str_contains($webRuntime, "queryInput.addEventListener('input'")
        && !str_contains($webRuntime, 'restoreFallbackPayload')
        && !str_contains($webRuntime, 'isEmptyRestorePayload')
        && !str_contains($webRuntime, 'clearLocalRuntimeDataset')
        && !str_contains($webRuntime, 'dataset: datasetPayload || saved.dataset || null')
        && !str_contains($webRuntime, 'runtimeStorageKey'),
    'Runtime does not revive stale local carry panel Object snapshots' => str_contains($webRuntime, 'state.indexes.objects[String(panel.objectId || \'\')] || null')
        && str_contains($webRuntime, 'reconcileCarryPanels(loadCarryPanels())')
        && str_contains($webRuntime, 'object: carrySnapshot(object)')
        && str_contains($webRenderer, 'carryPanelNodes')
        && str_contains(read_file($root . '/tests/canonical-runtime-kit-test.php'), 'stale local carry panel snapshot')
        && !str_contains($webRuntime, '|| panel.object || null')
        && !str_contains(read_file($root . '/public/assets/js/runtime-kit/scene-model.js'), '|| panel.object || null'),
    'Runtime projects canonical Placement without World layout' => str_contains($scripts, 'dataset.placements')
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
