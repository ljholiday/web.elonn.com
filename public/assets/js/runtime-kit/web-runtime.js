/*
 * Browser runtime bootstrap for the World Dataset Contract.
 */
(function () {
    'use strict';

    var runtime = window.ElonnWorldRuntime;
    var root = document.querySelector('[data-world-runtime]');
    var client = null;
    var authClient = null;
    var renderer = null;
    var state = null;
    var queryForm = null;
    var queryInput = null;
    var voiceButton = null;
    var recognition = null;
    var carryStorageKey = 'elonn.web.carry.panels.v1';
    var workspacePanelStorageKey = 'elonn.web.workspace.panel.v1';
    var uiStorageKey = 'elonn.web.runtime.ui.v1';
    var drag = null;
    var resize = null;
    var lastCarryTitleTap = null;
    var workspaceResultsCleared = false;
    var findScope = '';
    // Set by the server when there is no auth cookie. In this mode the runtime renders
    // api.elonn's login / register Dataset instead of the member's world, and every operation
    // dispatch is an auth submission, not a World Call.
    var authMode = String(root && root.dataset.authMode || '') !== '';

    if (!root || !runtime) {
        return;
    }

    client = runtime.WorldClient(root);
    authClient = runtime.AuthClient(root);
    renderer = runtime.WebRenderer(root);
    recognition = speechRecognition();

    renderer.status('Requesting World Dataset.', 'loading');
    renderer.render(runtime.SceneModel.loading());

    // The query form lives inside the workspace panel, which renderer.render() just built (once,
    // reused for every subsequent render) -- these elements don't exist before that first call.
    queryForm = root.querySelector('[data-runtime-query-form]');
    queryInput = root.querySelector('[data-runtime-query-input]');
    voiceButton = root.querySelector('[data-runtime-voice]');

    restoreLocalUiState();
    if (authMode) {
        renderAuthForm('login');
    } else {
        loadDataset({operation: 'world.restore'});
    }

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
        var collapseButton = event.target.closest('[data-carry-panel-collapse]');
        var resizeHandle = event.target.closest('[data-carry-panel-resize]');
        var panelTitle = event.target.closest('[data-carry-panel-title]');
        var hostedSurface = event.target.closest('[data-hosted-surface]');
        var runtimeUrl = event.target.closest('[data-runtime-url]');
        var operationAction = event.target.closest('[data-operation-invocation]');
        var workspaceToggle = event.target.closest('[data-workspace-results-toggle]');
        var workspaceClear = event.target.closest('[data-workspace-results-clear]');
        var findScopeButton = event.target.closest('[data-runtime-find-scope]');
        var collectionButton = event.target.closest('[data-collection-id]');
        var objectButton = event.target.closest('button[data-object-id]');
        var worldBack = event.target.closest('[data-world-back]');
        var worldClose = event.target.closest('[data-world-close]');

        if (closeButton && state) {
            event.preventDefault();
            closeCarryPanel(String(closeButton.dataset.carryPanelClose || ''));
            return;
        }

        if (collapseButton && state) {
            event.preventDefault();
            toggleCarryPanel(String(collapseButton.dataset.carryPanelCollapse || ''));
            return;
        }

        if (worldBack && state) {
            event.preventDefault();
            dispatchWorldNavigation('world.back', String(worldBack.dataset.worldBack || ''));
            return;
        }

        if (worldClose && state) {
            event.preventDefault();
            dispatchWorldNavigation('world.close', String(worldClose.dataset.worldClose || ''));
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

        if (findScopeButton) {
            event.preventDefault();
            findScope = String(findScopeButton.dataset.runtimeFindScope || '');
            renderState();
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
            var focusedId = String(objectButton.dataset.objectId || '');
            var originObject = originObjectFor(objectButton);
            selectObject(focusedId);
            if (openActionForObject(focusedId)) {
                // A card with an `open` action opens its Object on Carry. Fired from inside an
                // opened Object panel, World navigates that Object in place instead.
                openObject(focusedId, originObject);
            } else if (originObject !== '') {
                // Inside an opened Object, a card with no open action (a message, a participant)
                // is terminal content -- select it, never spawn a separate panel for it.
                renderState();
            } else {
                // A Finding with no open action: focusing it opens the referenced Object on
                // Carry (see dev.elonn canonical/layout.md).
                carryObject(focusedId);
                renderState();
            }
            return;
        }

        if (collectionButton && state) {
            selectCollection(String(collectionButton.dataset.collectionId || ''));
            return;
        }
    });

    root.addEventListener('submit', function (event) {
        var form = event.target.closest('[data-operation-invocation-form]');
        if (!form || !state) {
            return;
        }
        event.preventDefault();
        submitOperationForm(form);
    });

    function submitOperationForm(form) {
        var base = null;
        var submitButton = form.querySelector('.operation-form__submit');
        var statusNode = form.querySelector('[data-operation-form-status]');
        var label = submitButton ? submitButton.textContent : 'Save';
        var payload = {};
        try {
            base = JSON.parse(String(form.dataset.operationBase || '{}'));
        } catch (error) {
            return;
        }
        if (!base || typeof base !== 'object' || Array.isArray(base)) {
            return;
        }

        new FormData(form).forEach(function (value, key) {
            payload[key] = value;
        });
        form.querySelectorAll('input[type="checkbox"]').forEach(function (checkbox) {
            payload[checkbox.name] = checkbox.checked;
        });
        base.payload = payload;

        if (submitButton) {
            submitButton.disabled = true;
        }
        if (statusNode) {
            statusNode.textContent = 'Saving…';
            statusNode.dataset.state = 'loading';
        }

        dispatchOperationInvocation(base).then(function () {
            renderer.status(label + ' saved.', 'ready');
        }).catch(function (error) {
            var message = error && error.message ? error.message : label + ' failed.';
            if (statusNode) {
                statusNode.textContent = message;
                statusNode.dataset.state = 'error';
            }
            if (submitButton) {
                submitButton.disabled = false;
            }
        });
    }

    // Bring any panel the member interacts with to the front -- a plain click anywhere
    // inside it, not only a title or resize drag. Capture phase so it runs before the
    // drag/resize/click handlers; never prevents default, so those still fire.
    root.addEventListener('pointerdown', function (event) {
        var el = event.target.closest('[data-carry-panel-id]');
        var panelState = el && state && event.button === 0
            ? carryPanel(String(el.dataset.carryPanelId || ''))
            : null;
        if (!panelState || Number(panelState.z || 0) >= nextCarryZ() - 1) {
            return;
        }
        bringCarryPanelForward(panelState.id);
        el.style.zIndex = String(panelState.z || 1);
        persistCarryPanels();
        persistWorkspacePanel();
    }, true);

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
        // [data-carry-panel-title] marks the whole header (title text + header actions), so a
        // header button click also matches .closest() here -- exclude the actions area entirely,
        // not just the close button, so extra header actions (Hide/Clear on the workspace panel)
        // never get hijacked into starting a drag instead of firing their own click.
        if (event.target.closest('.carry-object-panel__actions') || event.target.closest('[data-carry-panel-resize]') || !title || !panel || !state || event.button !== 0) {
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
        return client.loadDataset(runtimeState).then(function (payload) {
            replaceDataset(payload, shouldMergeDataset(runtimeState), runtimeState);
            runtime.AdapterRegistry.handleResponse(payload, runtimeState, adapterContext());
            renderer.status(datasetStatus(payload), datasetStatusState(payload));
            return payload;
        }).catch(function (error) {
            var message = error && error.message ? error.message : 'World Dataset unavailable.';
            if (runtimeState && String(runtimeState.operation || '') === 'world.clear') {
                workspaceResultsCleared = false;
                persistLocalUiState();
            }
            renderer.status(message, 'error');
            if (!runtimeState || !runtimeState.operationInvocation) {
                renderer.render(runtime.SceneModel.error(message));
            }
            throw error;
        });
    }

    function submitQuery(text) {
        if (authMode) {
            return;
        }
        // A fresh Entry search is a new search of the member's whole world -- it carries no
        // focused-Finding context. Sending a stale selected object id makes World read the
        // Call as focusing a Finding (isBareFreeText -> false) and open it on Carry instead
        // of returning Findings. Clear the selection and submit the query bare.
        if (state) {
            state.selectedObjectId = '';
            state.selectedCollectionId = '';
        }
        var request = {
            inputText: text,
            runtimeSessionId: state ? state.runtimeSessionId : '',
            selectedObjectId: '',
            selectedCollectionId: ''
        };

        var panel = carryPanel('workspace-results');
        if (panel) {
            panel.collapsed = false;
        }
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

    // World returns a full cumulative snapshot on every path (composeFindings merges prior
    // Findings forward; back/close/clear return the whole placed state). The client never
    // re-merges -- a stale client merge would revive an Object World just dropped.
    function shouldMergeDataset() {
        return false;
    }

    function replaceDataset(payload, mergeWithPrevious, runtimeState) {
        var parsed = runtime.DatasetParser.parse(payload);
        var next = runtime.StateIndexer.build(parsed, state);
        state = runtime.ContinuityReconciler.reconcile(state, next);
        state.carryPanels = reconcileCarryPanels(carryPanelSeed());
        state.workspacePanel = reconcileWorkspacePanel(loadWorkspacePanel());
        persistCarryPanels();
        persistLocalUiState();
        renderState();
    }

    /*
     * The set of object panels to show: every Object World placed on Carry (an opened Object),
     * plus any the member pulled out client-side from a Finding, keyed by object id so persisted
     * geometry is reused. An opened Object dropped by World (world.close) falls out here.
     */
    function carryPanelSeed() {
        var byObject = {};
        var order = [];
        var topZ = 20;
        loadCarryPanels().forEach(function (panel) {
            var objectId = String(panel && (panel.objectId || panel.id) || '');
            if (objectId === '' || byObject[objectId]) {
                return;
            }
            byObject[objectId] = Object.assign({}, panel, {id: 'carry-panel:' + objectId, objectId: objectId});
            order.push(objectId);
            topZ = Math.max(topZ, Number(panel.z || 0));
        });
        if (state && state.workspacePanel) {
            topZ = Math.max(topZ, Number(state.workspacePanel.z || 0));
        }
        // World lists the just-opened Object first in openedObjects (its carry Placement is
        // prepended), so lower index == more recently opened. On a cold load several opened
        // Objects seed here at once; the newest must land ON TOP, not behind an Object that
        // was already open (e.g. the Dashboard it was launched from).
        var openedList = (state && state.openedObjects || []);
        var newIndex = 0;
        openedList.forEach(function (opened, listIndex) {
            var objectId = String(opened.id || '');
            if (objectId === '') {
                return;
            }
            if (!byObject[objectId]) {
                // A freshly opened Object gets room to show a conversation or a browse,
                // staggered so it clears the Results pane, and a z ABOVE every existing box
                // and the Results pane -- it opens in front, and its controls actually
                // receive pointer events. Persisted geometry (a prior drag/resize) wins.
                newIndex += 1;
                byObject[objectId] = {
                    id: 'carry-panel:' + objectId,
                    objectId: objectId,
                    x: 24 + newIndex * 24,
                    y: 88 + newIndex * 24,
                    width: 400,
                    height: 420,
                    z: topZ + (openedList.length - listIndex)
                };
                order.push(objectId);
            }
            byObject[objectId].opened = true;
        });
        return order.filter(function (objectId) {
            return !!(state && state.indexes && state.indexes.objects[objectId]);
        }).map(function (objectId) {
            return byObject[objectId];
        });
    }

    function isOpenedObjectPanel(objectId) {
        return (state && state.openedObjects || []).some(function (opened) {
            return String(opened.id || '') === String(objectId || '');
        });
    }

    function renderState() {
        var panel = carryPanel('workspace-results') || {};
        renderer.render(runtime.SceneModel.fromState(state), {
            workspace: {
                collapsed: panel.collapsed === true,
                closed: false,
                emptyVisible: workspaceResultsCleared,
                x: panel.x,
                y: panel.y,
                width: panel.width,
                height: panel.height,
                z: panel.z,
                findScope: findScope
            }
        });
        runtime.AdapterRegistry.mountAll(root, adapterContext());
    }

    /*
     * The clear control clears the Results pane (see dev.elonn canonical/layout.md, Entry).
     * world.clear removes the Findings from saved World state and has no effect on Carry,
     * Field, or Objects placed on either layer. The local flag hides the list immediately so
     * there is no round-trip flicker; the world.clear response resets it with the (now empty)
     * Findings.
     */
    function clearResults() {
        var panel = carryPanel('workspace-results');
        if (panel) {
            panel.collapsed = false;
        }
        workspaceResultsCleared = true;
        if (queryInput) {
            queryInput.value = '';
            queryInput.focus();
        }
        persistCarryPanels();
        persistLocalUiState();
        renderState();
        loadDataset({
            operation: 'world.clear',
            runtimeSessionId: state ? state.runtimeSessionId : '',
            inputText: 'world.clear'
        }).then(function () {
            workspaceResultsCleared = false;
            persistLocalUiState();
            renderState();
            renderer.status('Results cleared.', 'neutral');
        }).catch(function () {
            workspaceResultsCleared = false;
            persistLocalUiState();
            renderState();
        });
    }

    function toggleWorkspaceResults() {
        toggleCarryPanel('workspace-results');
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

    // Fetch api.elonn's login / register screen and render it through the ordinary Dataset
    // pipeline -- the same parser, scene model and renderer used for the member's world. All
    // display copy (title, help, error text) rides on the Dataset; nothing is authored here.
    function renderAuthForm(mode) {
        return authClient.loadForm(mode).then(function (dataset) {
            replaceDataset(dataset, false, {operation: 'identity.auth_form'});
            renderer.status(datasetStatus(dataset), datasetStatusState(dataset));
        }).catch(function (error) {
            renderer.status(authFailureText(error), 'error');
        });
    }

    function authFailureText(error) {
        return error && error.message ? error.message : datasetStatus({errors: [{class: 'dependency'}]});
    }

    // In authMode every operation dispatch is an auth action, never a World Call.
    function handleAuthInvocation(command) {
        var operation = String(command && command.operation || '');
        if (operation === 'identity.auth_form') {
            return renderAuthForm(String(command && command.switch_mode || 'login'));
        }
        if (operation !== 'identity.login' && operation !== 'identity.register') {
            return Promise.resolve();
        }
        return authClient.submit(operation, command && command.payload).then(function (result) {
            var context = result && typeof result.context === 'object' ? result.context : {};
            if (context.status === 'ok') {
                // The shared auth cookie is set; reload into the authenticated world.
                window.location.reload();
                return;
            }
            // api returned the same form Dataset with a validation / credential error on it;
            // the error text rides on the form object, so re-rendering it is enough.
            replaceDataset(result, false, {operation: 'identity.auth_form'});
        }).catch(function (error) {
            renderer.status(authFailureText(error), 'error');
        });
    }

    function dispatchOperationInvocation(command, opts) {
        // Logout rides on every member.profile object; it is a direct api call, not a World
        // Call, in or out of authMode.
        if (String(command && command.operation || '') === 'identity.logout') {
            return authClient.logout().then(function () {
                window.location.reload();
            });
        }
        if (authMode) {
            return handleAuthInvocation(command);
        }
        opts = opts && typeof opts === 'object' ? opts : {};
        var objectId = String(command && command.object_id || '');
        var originObject = String(opts.originObject || '');
        if (originObject === '') {
            // A result not navigated into an opened Object lands as Findings in the Results
            // pane -- make sure it is visible and on top so the member sees what they asked for.
            var panel = carryPanel('workspace-results');
            if (panel) {
                panel.collapsed = false;
                bringCarryPanelForward('workspace-results');
            }
            workspaceResultsCleared = false;
        }
        renderer.status('Requesting World Dataset.', 'loading');
        return loadDataset({
            runtimeSessionId: state ? state.runtimeSessionId : '',
            selectedObjectId: objectId,
            selectedCollectionId: state ? state.selectedCollectionId : '',
            inputText: String(command && command.input_text || 'operation invocation'),
            operationInvocation: command,
            originObject: originObject
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
        // An action fired from inside an opened Object panel (Reply, RSVP, Save, a nested
        // entrance) navigates that Object in place; otherwise its result lands as Findings.
        var originObject = originObjectFor(control);
        dispatchOperationInvocation(command, originObject !== '' ? {originObject: originObject} : {});
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
                    anchor: 'carry'
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
            // No Placement: this synthetic link Object is pulled onto Carry client-side by the
            // caller (openRuntimeUrl -> carryObject), not placed by World.
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
        var objectId = String(panelId || '').indexOf('carry-panel:') === 0
            ? String(panelId).slice('carry-panel:'.length)
            : String(panelId || '');
        // Closing an Object World opened on Carry is a world.close (it leaves saved state).
        // Closing a client-only Finding panel just removes the panel.
        if (isOpenedObjectPanel(objectId)) {
            dispatchWorldNavigation('world.close', objectId);
            return;
        }
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

    /*
     * Resolves any panel by id, real carried object or the workspace results panel alike -- the
     * same generic lookup every drag/resize/collapse handler already uses regardless of which
     * kind of panel it's operating on.
     */
    function carryPanel(panelId) {
        var match = null;
        if (!state) {
            return null;
        }
        if (panelId === 'workspace-results') {
            return state.workspacePanel || null;
        }
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
        if (state.workspacePanel) {
            max = Math.max(max, Number(state.workspacePanel.z || 0));
        }
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
                // Floor at 21: above the Results pane (10) and the field layers, so the box
                // is the frontmost thing at its position and actually receives pointer events.
                z: Math.max(21, Number(panel.z || 0)),
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
        persistWorkspacePanel();
    }

    function persistWorkspacePanel() {
        try {
            if (window.localStorage && state && state.workspacePanel) {
                window.localStorage.setItem(workspacePanelStorageKey, JSON.stringify(state.workspacePanel));
            }
        } catch (error) {
            renderer.status('Workspace panel could not be saved locally.', 'error');
        }
    }

    function loadWorkspacePanel() {
        var stored = '';
        try {
            stored = window.localStorage ? window.localStorage.getItem(workspacePanelStorageKey) : '';
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            return {};
        }
    }

    /*
     * Same shape as reconcileCarryPanels() -- clamp persisted geometry to the current viewport,
     * with defaults matching the panel's original fixed CSS position (centered, near the top) so
     * a member who has never dragged or resized it sees the same layout as before this changed.
     */
    function reconcileWorkspacePanel(saved) {
        var rootBounds = root.getBoundingClientRect();
        var defaultWidth = Math.min(620, Math.max(320, rootBounds.width - 24));
        var width = clamp(Number(saved.width || defaultWidth), 320, Math.max(320, rootBounds.width - 16));
        var defaultHeight = Math.min(rootBounds.height * 0.58, rootBounds.height - 16);
        var height = clamp(Number(saved.height || defaultHeight), 160, Math.max(160, rootBounds.height - 16));
        var defaultX = (rootBounds.width - width) / 2;
        var x = clamp(saved.x != null ? Number(saved.x) : defaultX, 8, Math.max(8, rootBounds.width - width - 8));
        var y = clamp(Number(saved.y != null ? saved.y : 8), 8, Math.max(8, rootBounds.height - height - 8));
        return {
            id: 'workspace-results',
            x: x,
            y: y,
            width: width,
            height: height,
            z: Number(saved.z || 10),
            collapsed: saved.collapsed === true
        };
    }

    /*
     * Per-window floating-panel geometry, persisted by window id the same way carry panels
     * persist by object id. A window World reports gets a saved position or a fresh staggered
     * one; geometry for a window that no longer exists is dropped.
     */
    /*
     * The id of the opened Object a node sits inside, if any: an explicit [data-origin-object]
     * host, else the enclosing carry panel when that panel is an opened Object. A click in the
     * Results pane or a client-only Finding panel returns ''.
     */
    /*
     * The id of the opened Object a node sits inside, for in-place navigation -- or '' when
     * the node is in the Results pane, a client-only Finding box, OR a Dashboard. A Dashboard
     * is a stable launcher (layout.md, Dashboard): activating one of its entry points always
     * opens a NEW Object (or a new Dashboard) on Carry, never navigates the Dashboard itself.
     */
    function originObjectFor(node) {
        var host = node && node.closest ? node.closest('[data-origin-object]') : null;
        if (host && host.dataset.originObject) {
            return isDashboard(String(host.dataset.originObject)) ? '' : String(host.dataset.originObject);
        }
        var panel = node && node.closest ? node.closest('[data-carry-panel-id]') : null;
        var id = panel ? String(panel.dataset.carryPanelId || '') : '';
        var objectId = id.indexOf('carry-panel:') === 0 ? id.slice('carry-panel:'.length) : id;
        return (isOpenedObjectPanel(objectId) && !isDashboard(objectId)) ? objectId : '';
    }

    function isDashboard(objectId) {
        var object = state && state.indexes ? state.indexes.objects[String(objectId || '')] : null;
        return !!object && String(object.type || '') === 'service.dashboard';
    }

    function openActionForObject(objectId) {
        var match = null;
        ((state && state.dataset && state.dataset.actions) || []).some(function (action) {
            var invocation = action.operation_invocation && typeof action.operation_invocation === 'object' ? action.operation_invocation : null;
            if (String(action.target_id || '') === String(objectId || '')
                && (action.type === 'open' || action.type === 'open_object')
                && invocation) {
                match = {invocation: invocation};
                return true;
            }
            return false;
        });
        return match;
    }

    /*
     * Focusing a card that opens an Object: with an open action, invoke it -- the Service places
     * the Object on Carry and World opens it (or, fired from inside an opened Object, navigates
     * that Object in place). With no open action, pull the referenced Object onto Carry
     * client-side.
     */
    function openObject(objectId, originObject) {
        var open = openActionForObject(objectId);
        if (!open) {
            selectObject(objectId);
            carryObject(objectId);
            renderState();
            return;
        }
        dispatchOperationInvocation(open.invocation, originObject !== '' ? {originObject: originObject} : {});
    }

    function dispatchWorldNavigation(operation, objectId) {
        if (String(objectId || '') === '') {
            return;
        }
        renderer.status('Requesting World Dataset.', 'loading');
        loadDataset({
            operation: operation,
            originObject: String(objectId),
            runtimeSessionId: state ? state.runtimeSessionId : '',
            selectedObjectId: state ? state.selectedObjectId : '',
            inputText: operation
        });
    }

    function restoreLocalUiState() {
        var saved = loadLocalUiState();
        if (queryInput && typeof saved.query === 'string') {
            queryInput.value = saved.query;
        }
        workspaceResultsCleared = saved.workspace && saved.workspace.cleared === true;
    }

    function persistLocalUiState() {
        var next = {
            query: queryInput ? String(queryInput.value || '') : '',
            workspace: {
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
