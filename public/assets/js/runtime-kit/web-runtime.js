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
    var resize = null;
    var paintStroke = null;
    var paintLocalOperations = {};
    var lastCarryTitleTap = null;

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
            submitQuery(text);
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
        var collectionButton = event.target.closest('[data-collection-id]');
        var objectButton = event.target.closest('[data-object-id]');

        if (closeButton && state) {
            event.preventDefault();
            closeCarryPanel(String(closeButton.dataset.carryPanelClose || ''));
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
        var canvas = event.target.closest('[data-paint-surface]');
        if (canvas && state && event.button === 0) {
            beginPaintStroke(event, canvas);
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
            if (paintStroke && paintStroke.pointerId === event.pointerId) {
                appendPaintPoint(event);
                event.preventDefault();
            }
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
    window.addEventListener('pointerup', endPaintStroke);
    window.addEventListener('pointercancel', cancelPaintStroke);

    function loadDataset(runtimeState) {
        client.loadDataset(runtimeState).then(function (payload) {
            replaceDataset(payload);
            renderer.status(datasetStatus(payload), datasetStatusState(payload));
        }).catch(function (error) {
            var message = error && error.message ? error.message : 'World Dataset unavailable.';
            renderer.status(message, 'error');
            renderer.render(runtime.SceneModel.error(message));
        });
    }

    function submitQuery(text) {
        var request = {
            inputText: text,
            runtimeSessionId: state ? state.runtimeSessionId : '',
            selectedObjectId: state ? state.selectedObjectId : '',
            selectedCollectionId: state ? state.selectedCollectionId : ''
        };

        renderer.status('Requesting World Dataset.', 'loading');
        browserOrigin().then(function (origin) {
            request.origin = origin;
            request.radiusMeters = 1000;
            loadDataset(request);
        }).catch(function (error) {
            if (needsBrowserOrigin(text)) {
                renderer.status(error && error.message ? error.message : 'Location is required for nearby requests.', 'error');
                return;
            }
            loadDataset(request);
        });
    }

    function needsBrowserOrigin(text) {
        return /\b(near me|nearby|around me|close to me|in my area)\b/i.test(String(text || ''));
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

    function replaceDataset(payload) {
        var parsed = runtime.DatasetParser.parse(payload);
        var next = runtime.StateIndexer.build(parsed, state);
        state = runtime.ContinuityReconciler.reconcile(state, next);
        state.carryPanels = reconcileCarryPanels(loadCarryPanels());
        persistCarryPanels();
        renderState();
    }

    function renderState() {
        renderer.render(runtime.SceneModel.fromState(state));
        renderPaintCanvases();
    }

    function renderPaintCanvases() {
        root.querySelectorAll('[data-paint-surface]').forEach(function (canvas) {
            var context = canvas.getContext ? canvas.getContext('2d') : null;
            var objectId = String(canvas.dataset.objectId || '');
            var source = paintSourceDocument(canvas);
            var persisted = Array.isArray(source.operations) ? source.operations : null;
            var operations = persisted !== null ? persisted : (paintLocalOperations[objectId] || []);
            if (!context) {
                return;
            }
            clearPaintCanvas(canvas, context);
            operations.forEach(function (operation) {
                drawPaintStroke(context, operation);
            });
        });
    }

    function paintSourceDocument(canvas) {
        var source = String(canvas.dataset.paintSource || '');
        if (source === '') {
            return {};
        }
        try {
            source = JSON.parse(source);
        } catch (error) {
            return {};
        }
        return source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    }

    function clearPaintCanvas(canvas, context) {
        context.save();
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = 'rgba(255, 255, 255, 0)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
    }

    function beginPaintStroke(event, canvas) {
        var objectId = String(canvas.dataset.objectId || '');
        var context = canvas.getContext ? canvas.getContext('2d') : null;
        if (objectId === '' || !context) {
            return;
        }
        selectObject(objectId);
        paintStroke = {
            pointerId: event.pointerId,
            objectId: objectId,
            canvas: canvas,
            context: context,
            points: [paintPoint(event, canvas)],
            color: '#000000',
            width: 4
        };
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    function appendPaintPoint(event) {
        var point = null;
        if (!paintStroke) {
            return;
        }
        point = paintPoint(event, paintStroke.canvas);
        paintStroke.points.push(point);
        drawPaintStroke(paintStroke.context, {
            style: {
                color: paintStroke.color,
                width: paintStroke.width
            },
            geometry: {
                points: paintStroke.points.slice(-2)
            }
        });
    }

    function endPaintStroke(event) {
        var stroke = null;
        if (!paintStroke || paintStroke.pointerId !== event.pointerId) {
            return;
        }
        appendPaintPoint(event);
        stroke = {
            tool: 'pencil',
            style: {
                color: paintStroke.color,
                width: paintStroke.width
            },
            geometry: {
                points: simplifyPaintPoints(paintStroke.points)
            }
        };
        if (stroke.geometry.points.length >= 2) {
            persistPaintStroke(paintStroke.objectId, stroke);
        }
        paintStroke = null;
        event.preventDefault();
    }

    function cancelPaintStroke(event) {
        if (paintStroke && paintStroke.pointerId === event.pointerId) {
            paintStroke = null;
            renderPaintCanvases();
        }
    }

    function persistPaintStroke(objectId, stroke) {
        paintLocalOperations[objectId] = (paintLocalOperations[objectId] || []).concat([stroke]);
        renderer.status('Saving Paint stroke.', 'loading');
        loadDataset({
            runtimeSessionId: state ? state.runtimeSessionId : '',
            selectedObjectId: objectId,
            selectedCollectionId: state ? state.selectedCollectionId : '',
            inputText: 'draw stroke',
            surfaceCommand: {
                service: 'paint',
                operation: 'paint.draw',
                object_id: objectId,
                payload: {
                    stroke: stroke
                }
            }
        });
    }

    function paintPoint(event, canvas) {
        var rect = canvas.getBoundingClientRect();
        var x = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * canvas.width : 0;
        var y = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * canvas.height : 0;
        return {
            x: clamp(x, 0, canvas.width),
            y: clamp(y, 0, canvas.height)
        };
    }

    function simplifyPaintPoints(points) {
        var output = [];
        points.forEach(function (point) {
            var previous = output[output.length - 1] || null;
            if (!previous || Math.abs(previous.x - point.x) >= 0.5 || Math.abs(previous.y - point.y) >= 0.5) {
                output.push({
                    x: Math.round(point.x * 100) / 100,
                    y: Math.round(point.y * 100) / 100
                });
            }
        });
        return output;
    }

    function drawPaintStroke(context, stroke) {
        var style = stroke.style || {};
        var geometry = stroke.geometry || {};
        var points = Array.isArray(geometry.points) ? geometry.points : [];
        if (points.length < 2) {
            return;
        }
        context.save();
        context.strokeStyle = String(style.color || '#000000');
        context.lineWidth = Number(style.width || 4);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.moveTo(Number(points[0].x || 0), Number(points[0].y || 0));
        points.slice(1).forEach(function (point) {
            context.lineTo(Number(point.x || 0), Number(point.y || 0));
        });
        context.stroke();
        context.restore();
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
            var object = state.indexes.objects[String(panel.objectId || '')] || panel.object || null;
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
            recordCarryTitleTap(drag.id);
        }
        persistCarryPanels();
        drag = null;
    }

    function recordCarryTitleTap(panelId) {
        var now = Date.now();
        if (lastCarryTitleTap
            && lastCarryTitleTap.id === panelId
            && now - lastCarryTitleTap.time <= 420
        ) {
            lastCarryTitleTap = null;
            toggleCarryPanel(panelId);
            return;
        }
        lastCarryTitleTap = {
            id: panelId,
            time: now
        };
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
