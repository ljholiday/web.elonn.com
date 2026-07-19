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
    var drag = null;

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
    loadDataset({});

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
            renderer.status('Requesting World Dataset.', 'loading');
            loadDataset({
                inputText: text,
                runtimeSessionId: state ? state.runtimeSessionId : '',
                selectedObjectId: state ? state.selectedObjectId : '',
                selectedCollectionId: state ? state.selectedCollectionId : ''
            });
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
        var collectionButton = event.target.closest('[data-collection-id]');
        var objectButton = event.target.closest('[data-object-id]');

        if (closeButton && state) {
            event.preventDefault();
            closeCarryPanel(String(closeButton.dataset.carryPanelClose || ''));
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

    root.addEventListener('dblclick', function (event) {
        var title = event.target.closest('[data-carry-panel-title]');
        if (!title || !state) {
            return;
        }
        event.preventDefault();
        toggleCarryPanel(String(title.dataset.carryPanelTitle || ''));
    });

    root.addEventListener('pointerdown', function (event) {
        var title = event.target.closest('[data-carry-panel-title]');
        var panel = title ? title.closest('[data-carry-panel-id]') : null;
        var panelState = null;
        if (!title || !panel || !state || event.button !== 0) {
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
            node: panel
        };
        panel.style.zIndex = String(panelState.z || 1);
        title.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    root.addEventListener('pointermove', function (event) {
        var panelState = null;
        var bounds = null;
        if (!drag || drag.pointerId !== event.pointerId || !state) {
            return;
        }
        panelState = carryPanel(drag.id);
        if (!panelState) {
            return;
        }
        bounds = carryBounds(drag.node);
        panelState.x = clamp(drag.panelX + event.clientX - drag.startX, bounds.minX, bounds.maxX);
        panelState.y = clamp(drag.panelY + event.clientY - drag.startY, bounds.minY, bounds.maxY);
        if (drag.node) {
            drag.node.style.left = panelState.x + 'px';
            drag.node.style.top = panelState.y + 'px';
        }
    });

    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);

    function loadDataset(runtimeState) {
        client.loadDataset(runtimeState).then(function (payload) {
            replaceDataset(payload);
            renderer.status(datasetStatus(payload), (payload.errors || []).length === 0 ? 'ready' : 'error');
        }).catch(function (error) {
            var message = error && error.message ? error.message : 'World Dataset unavailable.';
            renderer.status(message, 'error');
            renderer.render(runtime.SceneModel.error(message));
        });
    }

    function replaceDataset(payload) {
        var parsed = runtime.DatasetParser.parse(payload);
        var next = runtime.StateIndexer.build(parsed, state);
        state = runtime.ContinuityReconciler.reconcile(state, next);
        state.carryPanels = reconcileCarryPanels(loadCarryPanels());
        renderState();
    }

    function renderState() {
        renderer.render(runtime.SceneModel.fromState(state));
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
            z: nextCarryZ(),
            collapsed: false
        });
        state.carryPanels = panels;
        persistCarryPanels();
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
            metadata: object.metadata || {},
            visibility: object.visibility || {},
            permissions: object.permissions || {},
            availability: object.availability || {}
        };
    }

    function reconcileCarryPanels(panels) {
        return panels.map(function (panel) {
            var object = state.indexes.objects[String(panel.objectId || '')] || panel.object || null;
            if (!object) {
                return null;
            }
            return {
                id: String(panel.id || 'carry-panel:' + String(panel.objectId || '')),
                objectId: String(panel.objectId || object.id || ''),
                object: carrySnapshot(object),
                x: Number(panel.x || 72),
                y: Number(panel.y || 116),
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

    function endDrag(event) {
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }
        persistCarryPanels();
        drag = null;
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
            return String(errors[0].message || 'World Dataset returned errors.');
        }
        return 'World Dataset loaded.';
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
