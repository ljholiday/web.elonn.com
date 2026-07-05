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

    if (!root || !runtime) {
        return;
    }

    client = runtime.WorldClient(root);
    renderer = runtime.WebRenderer(root);
    dispatcher = runtime.ActionDispatcher(client);

    renderer.status('Requesting World Dataset.', 'loading');
    renderer.render(runtime.SceneModel.loading());
    loadDataset({});

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
            var result = payload && payload.result && typeof payload.result === 'object' ? payload.result : {};
            state.actionResult = {
                state: payload && payload.status === 'accepted' ? 'success' : 'neutral',
                status: String(payload && payload.status || 'unknown'),
                outcome: String(result.outcome || 'unknown'),
                message: String(result.message || 'World action returned a result.')
            };
            if (payload && payload.dataset) {
                replaceDataset(payload.dataset);
            }
            renderer.status('World action completed.', 'ready');
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
            renderer.status('World Dataset loaded.', 'ready');
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
        if (firstItem.object_id && state.indexes.objects[String(firstItem.object_id)]) {
            state.selectedObjectId = String(firstItem.object_id);
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
            return String(item.object_id || '') === objectId;
        });
    }
}());
