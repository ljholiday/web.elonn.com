/*
 * Browser runtime bootstrap for the World Dataset Contract.
 */
(function () {
    'use strict';

    var runtime = window.ElonnWorldRuntime;
    var root = document.querySelector('[data-world-runtime]');
    var client = null;
    var renderer = null;
    var dispatcher = null;
    var state = null;
    var queryForm = null;
    var queryInput = null;
    var voiceButton = null;
    var recognition = null;

    if (!root || !runtime) {
        return;
    }

    client = runtime.WorldClient(root);
    renderer = runtime.WebRenderer(root);
    dispatcher = runtime.ActionDispatcher(client);
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
        var collectionButton = event.target.closest('[data-collection-id]');
        var objectButton = event.target.closest('[data-object-id]');
        var actionButton = event.target.closest('[data-action-id]');
        var action = null;

        if (objectButton && state) {
            selectObject(String(objectButton.dataset.objectId || ''));
            renderState();
            return;
        }

        if (collectionButton && state) {
            selectCollection(String(collectionButton.dataset.collectionId || ''));
            return;
        }

        if (!actionButton || !state || state.actionInFlight) {
            return;
        }

        action = state.indexes.actions[String(actionButton.dataset.actionId || '')] || null;
        if (!action) {
            return;
        }

        state.actionInFlight = true;
        state.actionResult = {
            state: 'loading',
            status: 'dispatching',
            outcome: 'pending',
            message: 'Dispatching World action.'
        };
        renderer.status('Dispatching World action.', 'loading');
        renderState();

        dispatcher.dispatch(state, action).then(function (payload) {
            var errors = payload && Array.isArray(payload.errors) ? payload.errors : [];
            state.actionResult = {
                state: errors.length === 0 ? 'success' : 'error',
                status: errors.length === 0 ? 'dataset' : 'error',
                outcome: errors.length === 0 ? 'updated' : 'failed',
                message: errors.length === 0 ? 'World Dataset updated.' : String(errors[0].message || 'World action failed.')
            };
            if (payload && payload.type === 'world') {
                replaceDataset(payload);
            }
            renderer.status(state.actionResult.message, errors.length === 0 ? 'ready' : 'error');
        }).catch(function (error) {
            state.actionResult = {
                state: 'error',
                status: 'error',
                outcome: 'failed',
                message: error && error.message ? error.message : 'World action failed.'
            };
            renderer.status(state.actionResult.message, 'error');
        }).finally(function () {
            state.actionInFlight = false;
            renderState();
        });
    });

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
