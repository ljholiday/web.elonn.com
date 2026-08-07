/*
 * Browser runtime bootstrap for the World Dataset Contract.
 */
(function () {
    'use strict';

    var runtime = window.ElonnWorldRuntime;
    var root = document.querySelector('[data-world-runtime]');
    var client = null;
    var renderer = null;
    var state = null;
    var queryForm = null;
    var queryInput = null;
    var voiceButton = null;
    var recognition = null;
    var carryStorageKey = 'elonn.web.carry.panels.v1';
    var uiStorageKey = 'elonn.web.runtime.ui.v1';
    var drag = null;
    var resize = null;
    var lastCarryTitleTap = null;
    var workspaceResultsCollapsed = false;
    var workspaceResultsCleared = false;

    if (!root || !runtime) {
        return;
    }

    client = runtime.WorldClient(root);
    renderer = runtime.WebRenderer(root);
    queryForm = root.querySelector('[data-runtime-query-form]');
    queryInput = root.querySelector('[data-runtime-query-input]');
    voiceButton = root.querySelector('[data-runtime-voice]');
    recognition = speechRecognition();

    renderer.status('Requesting World Dataset.', 'loading');
    renderer.render(runtime.SceneModel.loading());
    restoreLocalUiState();
    loadDataset({operation: 'world.restore'});

    if (voiceButton) {
        voiceButton.disabled = !recognition;
        voiceButton.title = recognition ? 'Start voice input' : 'Voice input is unavailable in this browser.';
    }

    if (queryForm) {
        queryForm.addEventListener('submit', function (event) {
            var text = queryInput ? String(queryInput.value || '').trim() : '';
            event.preventDefault();
            if (text === '') {
                return;
            }
            submitQuery(text);
        });
    }
    if (queryInput) {
        queryInput.addEventListener('input', function () {
            persistLocalUiState();
        });
    }

    if (voiceButton && recognition) {
        voiceButton.addEventListener('click', function () {
            try {
                recognition.start();
            } catch (error) {
                renderer.status('Voice input could not start.', 'error');
            }
        });
    }

    root.addEventListener('click', function (event) {
        var closeButton = event.target.closest('[data-carry-panel-close]');
        var resizeHandle = event.target.closest('[data-carry-panel-resize]');
        var panelTitle = event.target.closest('[data-carry-panel-title]');
        var hostedSurface = event.target.closest('[data-hosted-surface]');
        var runtimeUrl = event.target.closest('[data-runtime-url]');
        var operationAction = event.target.closest('[data-operation-invocation]');
        var workspaceToggle = event.target.closest('[data-workspace-results-toggle]');
        var workspaceClear = event.target.closest('[data-workspace-results-clear]');
        var collectionButton = event.target.closest('[data-collection-id]');
        var objectButton = event.target.closest('button[data-object-id]');

        if (closeButton && state) {
            event.preventDefault();
            closeCarryPanel(String(closeButton.dataset.carryPanelClose || ''));
            return;
        }

        if (runtimeUrl && state) {
            event.preventDefault();
            openRuntimeUrl(runtimeUrl);
            return;
        }

        if (operationAction && state) {
            event.preventDefault();
            dispatchOperationAction(operationAction);
            return;
        }

        if (workspaceToggle && state) {
            event.preventDefault();
            toggleWorkspaceResults();
            return;
        }

        if (workspaceClear) {
            event.preventDefault();
            clearResults();
            return;
        }

        if (resizeHandle && state) {
            event.preventDefault();
            return;
        }

        if (panelTitle && state) {
            event.preventDefault();
            return;
        }

        if (hostedSurface && state) {
            return;
        }

        if (objectButton && state) {
            selectObject(String(objectButton.dataset.objectId || ''));
            carryObject(String(objectButton.dataset.objectId || ''));
            renderState();
            return;
        }

        if (collectionButton && state) {
            selectCollection(String(collectionButton.dataset.collectionId || ''));
            return;
        }
    });

    root.addEventListener('pointerdown', function (event) {
        var handle = event.target.closest('[data-carry-panel-resize]');
        var panel = handle ? handle.closest('[data-carry-panel-id]') : null;
        var panelState = null;
        var size = null;
        if (!handle || !panel || !state || event.button !== 0) {
            return;
        }
        panelState = carryPanel(String(panel.dataset.carryPanelId || ''));
        if (!panelState) {
            return;
        }
        bringCarryPanelForward(panelState.id);
        size = panel.getBoundingClientRect();
        resize = {
            id: panelState.id,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            panelWidth: Number(panelState.width || size.width || 320),
            panelHeight: Number(panelState.height || size.height || 180),
            node: panel
        };
        panel.style.zIndex = String(panelState.z || 1);
        handle.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    root.addEventListener('pointerdown', function (event) {
        var title = event.target.closest('[data-carry-panel-title]');
        var panel = title ? title.closest('[data-carry-panel-id]') : null;
        var panelState = null;
        if (event.target.closest('[data-carry-panel-close]') || event.target.closest('[data-carry-panel-resize]') || !title || !panel || !state || event.button !== 0) {
            return;
        }
        panelState = carryPanel(String(panel.dataset.carryPanelId || ''));
        if (!panelState) {
            return;
        }
        bringCarryPanelForward(panelState.id);
        drag = {
            id: panelState.id,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            panelX: Number(panelState.x || 0),
            panelY: Number(panelState.y || 0),
            node: panel,
            moved: false
        };
        panel.style.zIndex = String(panelState.z || 1);
        title.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    window.addEventListener('pointermove', function (event) {
        var panelState = null;
        var bounds = null;
        if (resize && resize.pointerId === event.pointerId && state) {
            panelState = carryPanel(resize.id);
            if (!panelState) {
                return;
            }
            bounds = resizeBounds(resize.node, panelState);
            panelState.width = clamp(resize.panelWidth + event.clientX - resize.startX, bounds.minWidth, bounds.maxWidth);
            panelState.height = clamp(resize.panelHeight + event.clientY - resize.startY, bounds.minHeight, bounds.maxHeight);
            if (resize.node) {
                resize.node.style.width = panelState.width + 'px';
                resize.node.style.height = panelState.height + 'px';
            }
            event.preventDefault();
            return;
        }
        if (!drag || drag.pointerId !== event.pointerId || !state) {
            return;
        }
        panelState = carryPanel(drag.id);
        if (!panelState) {
            return;
        }
        if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) {
            drag.moved = true;
        }
        bounds = carryBounds(drag.node);
        panelState.x = clamp(drag.panelX + event.clientX - drag.startX, bounds.minX, bounds.maxX);
        panelState.y = clamp(drag.panelY + event.clientY - drag.startY, bounds.minY, bounds.maxY);
        if (drag.node) {
            drag.node.style.left = panelState.x + 'px';
            drag.node.style.top = panelState.y + 'px';
        }
        event.preventDefault();
    });

    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    function loadDataset(runtimeState) {
        client.loadDataset(runtimeState).then(function (payload) {
            replaceDataset(payload, shouldMergeDataset(runtimeState), runtimeState);
            runtime.AdapterRegistry.handleResponse(payload, runtimeState, adapterContext());
            renderer.status(datasetStatus(payload), datasetStatusState(payload));
        }).catch(function (error) {
            var message = error && error.message ? error.message : 'World Dataset unavailable.';
            if (runtimeState && String(runtimeState.operation || '') === 'world.clear') {
                workspaceResultsCleared = false;
                persistLocalUiState();
            }
            renderer.status(message, 'error');
            renderer.render(runtime.SceneModel.error(message));
        });
    }

    function submitQuery(text) {
        var request = {
            inputText: text,
            runtimeSessionId: state && !workspaceResultsCleared ? state.runtimeSessionId : '',
            selectedObjectId: state ? state.selectedObjectId : '',
            selectedCollectionId: state && !workspaceResultsCleared ? state.selectedCollectionId : '',
            replaceResults: workspaceResultsCleared
        };

        workspaceResultsCollapsed = false;
        workspaceResultsCleared = false;
        renderer.status('Requesting World Dataset.', 'loading');
        browserOrigin().then(function (origin) {
            request.origin = origin;
            request.radiusMeters = 1000;
            loadDataset(request);
        }).catch(function () {
            loadDataset(request);
        });
    }

    function browserOrigin() {
        return new Promise(function (resolve, reject) {
            if (!navigator.geolocation) {
                reject(new Error('Location is required for nearby requests.'));
                return;
            }
            navigator.geolocation.getCurrentPosition(function (position) {
                var coords = position && position.coords ? position.coords : {};
                var latitude = Number(coords.latitude);
                var longitude = Number(coords.longitude);
                if (!isFinite(latitude) || !isFinite(longitude)) {
                    reject(new Error('Location is required for nearby requests.'));
                    return;
                }
                resolve({
                    latitude: latitude,
                    longitude: longitude
                });
            }, function () {
                reject(new Error('Location is required for nearby requests.'));
            }, {
                enableHighAccuracy: false,
                maximumAge: 60000,
                timeout: 8000
            });
        });
    }

    function shouldMergeDataset(runtimeState) {
        return !!state
            && !!runtimeState
            && String(runtimeState.inputText || '').trim() === ''
            && !runtimeState.operationInvocation
            && runtimeState.replaceResults !== true;
    }

    function replaceDataset(payload, mergeWithPrevious, runtimeState) {
        var parsed = runtime.DatasetParser.parse(payload);
        if (mergeWithPrevious) {
            parsed = runtime.StateIndexer.mergeDatasets(state ? state.dataset : null, parsed);
        }
        var next = runtime.StateIndexer.build(parsed, state);
        state = runtime.ContinuityReconciler.reconcile(state, next);
        state.carryPanels = reconcileCarryPanels(loadCarryPanels());
        persistCarryPanels();
        persistLocalUiState();
        renderState();
    }

    function renderState() {
        renderer.render(runtime.SceneModel.fromState(state), {
            workspace: {
                collapsed: workspaceResultsCollapsed,
                closed: false,
                emptyVisible: workspaceResultsCleared
            }
        });
        runtime.AdapterRegistry.mountAll(root, adapterContext());
    }

    function clearResults() {
        workspaceResultsCollapsed = false;
        workspaceResultsCleared = true;
        if (queryInput) {
            queryInput.value = '';
            queryInput.focus();
        }
        persistLocalUiState();
        renderState();
        renderer.status('Results cleared.', 'neutral');
    }

    function toggleWorkspaceResults() {
        workspaceResultsCollapsed = !workspaceResultsCollapsed;
        persistLocalUiState();
        renderState();
    }

    function adapterContext() {
        return {
            status: renderer.status,
            dispatchOperationInvocation: dispatchOperationInvocation,
            removeObjectSurface: removeObjectSurface,
            selectObject: function (objectId) {
                selectObject(objectId);
            }
        };
    }

    function dispatchOperationInvocation(command) {
        var objectId = String(command && command.object_id || '');
        loadDataset({
            runtimeSessionId: state ? state.runtimeSessionId : '',
            selectedObjectId: objectId,
            selectedCollectionId: state ? state.selectedCollectionId : '',
            inputText: String(command && command.input_text || 'operation invocation'),
            operationInvocation: command
        });
    }

    function dispatchOperationAction(control) {
        var command = null;
        try {
            command = JSON.parse(String(control.dataset.operationInvocation || '{}'));
        } catch (error) {
            renderer.status('Action could not be read.', 'error');
            return;
        }
        if (!command || typeof command !== 'object' || Array.isArray(command)) {
            renderer.status('Action could not be read.', 'error');
            return;
        }
        dispatchOperationInvocation(command);
    }

    function removeObjectSurface(objectId) {
        objectId = String(objectId || '');
        if (objectId === '' || !state) {
            return;
        }
        state.carryPanels = (state.carryPanels || []).filter(function (panel) {
            return String(panel.objectId || '') !== objectId;
        });
        if (state.selectedObjectId === objectId) {
            state.selectedObjectId = '';
        }
        persistCarryPanels();
        renderState();
    }

    function selectCollection(collectionId) {
        var collection = state.indexes.collections[collectionId] || null;
        var firstItem = null;
        if (!collection) {
            return;
        }
        state.selectedCollectionId = collectionId;
        firstItem = runtime.Common.sectionItems({items: collection.items})[0] || {};
        firstItem = runtime.Common.itemIds(collection.items)[0] || '';
        if (firstItem && state.indexes.objects[String(firstItem)]) {
            state.selectedObjectId = String(firstItem);
        }
        renderState();
    }

    function selectObject(objectId) {
        if (!state.indexes.objects[objectId]) {
            return;
        }
        state.selectedObjectId = objectId;
        state.selectedCollectionId = collectionContainingObject(state, objectId) || state.selectedCollectionId;
    }

    function carryObject(objectId) {
        var object = state.indexes.objects[objectId] || null;
        var panels = state.carryPanels || [];
        var existing = null;
        if (!object) {
            return;
        }
        panels.some(function (panel) {
            if (String(panel.objectId || '') === objectId) {
                existing = panel;
                return true;
            }
            return false;
        });
        if (existing) {
            bringCarryPanelForward(existing.id);
            persistCarryPanels();
            return;
        }
        panels.push({
            id: 'carry-panel:' + objectId,
            objectId: objectId,
            object: carrySnapshot(object),
            x: 72 + panels.length * 26,
            y: 116 + panels.length * 26,
            width: 320,
            height: 180,
            z: nextCarryZ(),
            collapsed: false
        });
        state.carryPanels = panels;
        persistCarryPanels();
    }

    function openRuntimeUrl(control) {
        var url = String(control.dataset.runtimeUrl || '').trim();
        var objectId = objectIdForRuntimeUrl(url, String(control.dataset.runtimeUrlParent || ''));
        if (objectId === '') {
            objectId = ensureRuntimeUrlObject({
                url: url,
                label: String(control.dataset.runtimeUrlLabel || ''),
                parentObjectId: String(control.dataset.runtimeUrlParent || '')
            });
        }
        if (objectId === '') {
            return;
        }
        selectObject(objectId);
        carryObject(objectId);
        persistCarryPanels();
        renderState();
    }

    function objectIdForRuntimeUrl(url, parentObjectId) {
        var normalizedUrl = normalizeRuntimeUrl(url);
        var parent = state && state.indexes ? state.indexes.objects[String(parentObjectId || '')] || null : null;
        var objects = state && state.dataset ? state.dataset.objects || [] : [];
        var resources = state && state.indexes ? state.indexes.resources || {} : {};
        var matchedResourceIds = [];
        if (normalizedUrl === '') {
            return '';
        }
        if (parent && objectOwnsRuntimeUrl(parent, normalizedUrl, resources)) {
            return String(parent.id || '');
        }
        Object.keys(resources).forEach(function (resourceId) {
            if (resourceOwnsRuntimeUrl(resources[resourceId], normalizedUrl)) {
                matchedResourceIds.push(String(resourceId || ''));
            }
        });
        for (var index = 0; index < objects.length; index += 1) {
            if (objectOwnsRuntimeUrl(objects[index], normalizedUrl, resources, matchedResourceIds)) {
                return String(objects[index].id || '');
            }
        }
        return '';
    }

    function objectOwnsRuntimeUrl(object, normalizedUrl, resources, matchedResourceIds) {
        var content = object && typeof object.content === 'object' ? object.content : {};
        var resourceIds = common.itemIds(object.resourceIds || object.resources || []);
        if (runtimeUrlMatches(normalizedUrl, [content.source_url, content.canonical_url, content.url])) {
            return true;
        }
        if (Array.isArray(matchedResourceIds)) {
            for (var index = 0; index < matchedResourceIds.length; index += 1) {
                if (resourceIds.indexOf(matchedResourceIds[index]) !== -1) {
                    return true;
                }
            }
        }
        for (var resourceIndex = 0; resourceIndex < resourceIds.length; resourceIndex += 1) {
            if (resourceOwnsRuntimeUrl(resources[String(resourceIds[resourceIndex] || '')], normalizedUrl)) {
                return true;
            }
        }
        return false;
    }

    function resourceOwnsRuntimeUrl(resource, normalizedUrl) {
        var content = resource && typeof resource.content === 'object' ? resource.content : {};
        return runtimeUrlMatches(normalizedUrl, [
            resource && resource.href,
            content.href,
            content.url,
            content.source_url,
            content.canonical_url
        ]);
    }

    function runtimeUrlMatches(normalizedUrl, candidates) {
        return candidates.some(function (candidate) {
            return normalizeRuntimeUrl(candidate) === normalizedUrl;
        });
    }

    function normalizeRuntimeUrl(value) {
        var text = String(value || '').trim();
        var parsed = null;
        if (text === '') {
            return '';
        }
        try {
            parsed = new URL(text, window.location.origin);
            parsed.hash = '';
            if (parsed.pathname !== '/') {
                parsed.pathname = parsed.pathname.replace(/\/+$/, '');
            }
            return parsed.protocol.toLowerCase() + '//' + parsed.hostname.toLowerCase() + parsed.pathname + parsed.search;
        } catch (error) {
            return text.replace(/\/+$/, '').toLowerCase();
        }
    }

    function ensureRuntimeUrlObject(details) {
        var url = String(details.url || '').trim();
        var id = 'runtime.website.link:' + stableHash(url);
        var resourceId = 'resource:' + id + ':url';
        var placementId = 'placement:' + id + ':workspace';
        var label = String(details.label || '').trim();
        var domain = domainFromUrl(url);
        var panels = [];
        if (url === '' || !state) {
            return '';
        }
        if (!state.indexes.objects[id]) {
            panels = state.carryPanels || [];
            state.dataset.objects.unshift({
                id: id,
                type: 'website.link',
                title: label !== '' ? label : (domain !== '' ? domain : url),
                summary: domain,
                content: {
                    name: label !== '' ? label : (domain !== '' ? domain : url),
                    description: domain,
                    source_url: url,
                    source_domain: domain,
                    canonical_url: url,
                    parent_object_id: String(details.parentObjectId || '')
                },
                visibility: {},
                permissions: {},
                availability: {state: 'enabled'},
                resourceIds: [resourceId],
                metadata: {
                    service: 'web.runtime',
                    anchor: 'workspace'
                }
            });
            state.dataset.resources.unshift({
                id: resourceId,
                kind: 'website.link',
                media_type: 'application/vnd.elonn.website-link+json',
                href: '',
                label: label !== '' ? label : url,
                content: {
                    kind: 'website.link',
                    url: url,
                    domain: domain,
                    parent_object_id: String(details.parentObjectId || '')
                },
                availability: {state: 'enabled'}
            });
            state.dataset.placements.unshift({
                id: placementId,
                type: 'workspace',
                object_id: id,
                collection_id: '',
                resource_id: ''
            });
            state = runtime.StateIndexer.build(state.dataset, state);
            state.carryPanels = panels;
        }
        return id;
    }

    function toggleCarryPanel(panelId) {
        var panel = carryPanel(panelId);
        if (!panel) {
            return;
        }
        panel.collapsed = panel.collapsed !== true;
        bringCarryPanelForward(panelId);
        persistCarryPanels();
        renderState();
    }

    function closeCarryPanel(panelId) {
        state.carryPanels = (state.carryPanels || []).filter(function (panel) {
            return String(panel.id || '') !== panelId;
        });
        persistCarryPanels();
        renderState();
    }

    function bringCarryPanelForward(panelId) {
        var panel = carryPanel(panelId);
        if (!panel) {
            return;
        }
        panel.z = nextCarryZ();
    }

    function carryPanel(panelId) {
        var match = null;
        (state.carryPanels || []).some(function (panel) {
            if (String(panel.id || '') === panelId) {
                match = panel;
                return true;
            }
            return false;
        });
        return match;
    }

    function nextCarryZ() {
        var max = 20;
        (state.carryPanels || []).forEach(function (panel) {
            max = Math.max(max, Number(panel.z || 0));
        });
        return max + 1;
    }

    function carrySnapshot(object) {
        return {
            id: String(object.id || ''),
            type: String(object.type || 'object'),
            title: String(object.title || 'Object'),
            summary: String(object.summary || ''),
            content: object.content || {},
            surface: object.surface || null,
            metadata: object.metadata || {},
            visibility: object.visibility || {},
            permissions: object.permissions || {},
            availability: object.availability || {},
            resources: object.resources || []
        };
    }

    function reconcileCarryPanels(panels) {
        var rootBounds = root.getBoundingClientRect();
        return panels.map(function (panel) {
            var object = state.indexes.objects[String(panel.objectId || '')] || null;
            var width = 320;
            var height = 180;
            var x = 72;
            var y = 116;
            if (!object) {
                return null;
            }
            width = clamp(Number(panel.width || 320), 220, Math.max(220, rootBounds.width - 16));
            height = clamp(Number(panel.height || 180), 120, Math.max(120, rootBounds.height - 122));
            x = clamp(Number(panel.x || 72), 8, Math.max(8, rootBounds.width - width - 8));
            y = clamp(Number(panel.y || 116), 64, Math.max(64, rootBounds.height - height - 58));
            return {
                id: String(panel.id || 'carry-panel:' + String(panel.objectId || '')),
                objectId: String(panel.objectId || object.id || ''),
                object: carrySnapshot(object),
                x: x,
                y: y,
                width: width,
                height: height,
                z: Number(panel.z || 1),
                collapsed: panel.collapsed === true
            };
        }).filter(function (panel) {
            return panel && panel.objectId !== '';
        });
    }

    function loadCarryPanels() {
        var stored = '';
        try {
            stored = window.localStorage ? window.localStorage.getItem(carryStorageKey) : '';
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            return [];
        }
    }

    function persistCarryPanels() {
        try {
            if (window.localStorage) {
                window.localStorage.setItem(carryStorageKey, JSON.stringify(state.carryPanels || []));
            }
        } catch (error) {
            renderer.status('Carry panels could not be saved locally.', 'error');
        }
    }

    function restoreLocalUiState() {
        var saved = loadLocalUiState();
        if (queryInput && typeof saved.query === 'string') {
            queryInput.value = saved.query;
        }
        workspaceResultsCollapsed = saved.workspace && saved.workspace.collapsed === true;
        workspaceResultsCleared = saved.workspace && saved.workspace.cleared === true;
    }

    function persistLocalUiState() {
        var next = {
            query: queryInput ? String(queryInput.value || '') : '',
            workspace: {
                collapsed: workspaceResultsCollapsed,
                cleared: workspaceResultsCleared
            }
        };
        try {
            if (window.localStorage) {
                window.localStorage.setItem(uiStorageKey, JSON.stringify(next));
            }
        } catch (error) {
            renderer.status('Runtime UI state could not be saved locally.', 'error');
        }
    }

    function loadLocalUiState() {
        var stored = '';
        var decoded = null;
        try {
            stored = window.localStorage ? window.localStorage.getItem(uiStorageKey) : '';
            decoded = stored ? JSON.parse(stored) : {};
            return decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded : {};
        } catch (error) {
            return {};
        }
    }

    function endDrag(event) {
        if (resize && resize.pointerId === event.pointerId) {
            persistCarryPanels();
            resize = null;
            return;
        }
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }
        if (drag.moved !== true) {
            recordTitleTap(drag.id);
        }
        persistCarryPanels();
        drag = null;
    }

    function recordTitleTap(panelId) {
        var now = Date.now();
        if (lastCarryTitleTap
            && lastCarryTitleTap.id === panelId
            && now - lastCarryTitleTap.time <= 420
        ) {
            lastCarryTitleTap = null;
            togglePanel(panelId);
            return;
        }
        lastCarryTitleTap = {
            id: panelId,
            time: now
        };
    }

    function togglePanel(panelId) {
        toggleCarryPanel(panelId);
    }

    function carryBounds(panel) {
        var width = panel ? panel.offsetWidth : 320;
        var height = panel ? panel.offsetHeight : 160;
        var rootBounds = root.getBoundingClientRect();
        return {
            minX: 8,
            minY: 64,
            maxX: Math.max(8, rootBounds.width - width - 8),
            maxY: Math.max(64, rootBounds.height - height - 58)
        };
    }

    function resizeBounds(panel, panelState) {
        var rootBounds = root.getBoundingClientRect();
        var x = Number(panelState.x || 0);
        var y = Number(panelState.y || 0);
        return {
            minWidth: 220,
            minHeight: 120,
            maxWidth: Math.max(220, rootBounds.width - x - 8),
            maxHeight: Math.max(120, rootBounds.height - y - 58)
        };
    }

    function stableHash(value) {
        var text = String(value || '');
        var hash = 2166136261;
        var index = 0;
        for (index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return (hash >>> 0).toString(16);
    }

    function domainFromUrl(value) {
        try {
            return value ? (new URL(value, window.location.origin)).hostname : '';
        } catch (error) {
            return '';
        }
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function collectionContainingObject(currentState, objectId) {
        var selected = currentState.indexes.collections[currentState.selectedCollectionId] || null;
        if (selected && collectionContains(selected, objectId)) {
            return String(selected.id || '');
        }
        var collectionIds = currentState.orderedCollectionIds || [];
        var match = '';
        collectionIds.some(function (collectionId) {
            var collection = currentState.indexes.collections[collectionId] || null;
            if (collection && collectionContains(collection, objectId)) {
                match = collectionId;
                return true;
            }
            return false;
        });
        return match;
    }

    function collectionContains(collection, objectId) {
        return runtime.Common.sectionItems({items: collection.items}).some(function (item) {
            return runtime.Common.itemIds(collection.items).indexOf(objectId) !== -1;
        }) || runtime.Common.itemIds(collection.items).indexOf(objectId) !== -1;
    }

    function datasetStatus(payload) {
        var errors = payload && Array.isArray(payload.errors) ? payload.errors : [];
        if (errors.length > 0) {
            if (errors.every(function (error) {
                return error && error.class === 'dependency';
            })) {
                return 'Some results could not be loaded.';
            }
            return 'World Dataset returned errors.';
        }
        return 'World Dataset loaded.';
    }

    function datasetStatusState(payload) {
        var errors = payload && Array.isArray(payload.errors) ? payload.errors : [];
        if (errors.length === 0) {
            return 'ready';
        }
        if (errors.every(function (error) {
            return error && error.class === 'dependency';
        })) {
            return 'ready';
        }
        return 'error';
    }

    function speechRecognition() {
        var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
        var instance = null;
        if (!SpeechRecognition) {
            return null;
        }
        instance = new SpeechRecognition();
        instance.continuous = false;
        instance.interimResults = false;
        instance.lang = String(navigator.language || 'en-US');
        instance.onstart = function () {
            renderer.status('Listening.', 'loading');
        };
        instance.onerror = function () {
            renderer.status('Voice input failed.', 'error');
        };
        instance.onresult = function (event) {
            var result = event.results && event.results[0] && event.results[0][0]
                ? String(event.results[0][0].transcript || '').trim()
                : '';
            if (result !== '' && queryInput) {
                queryInput.value = result;
                queryInput.focus();
            }
            renderer.status('Voice input ready.', 'ready');
        };

        return instance;
    }
}());
