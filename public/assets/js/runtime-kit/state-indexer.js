/*
 * State indexer for generic World Dataset runtime state.
 */
(function () {
    'use strict';

    var common = window.ElonnWorldRuntime.Common;

    window.ElonnWorldRuntime.StateIndexer = {
        build: function (dataset, previous) {
            var indexes = {
                objects: common.indexBy(common.sectionItems(dataset.objects), 'id'),
                actions: common.indexBy(common.sectionItems(dataset.actions), 'id'),
                collections: common.indexBy(common.sectionItems(dataset.collections), 'id'),
                resources: common.indexBy(common.sectionItems(dataset.resources), 'id')
            };
            var layout = dataset.layout && typeof dataset.layout === 'object' ? dataset.layout : {};
            var context = dataset.context && typeof dataset.context === 'object' && dataset.context.runtime_context && typeof dataset.context.runtime_context === 'object'
                ? dataset.context.runtime_context
                : {};
            var firstCollection = common.sectionItems(dataset.collections)[0] || {};
            var firstObject = common.sectionItems(dataset.objects)[0] || {};
            var selectedObjectId = String(previous && previous.selectedObjectId || context.selected_object_id || layout.primary_object_id || firstObject.id || '');
            var selectedCollectionId = String(previous && previous.selectedCollectionId || context.selected_collection_id || layout.primary_collection_id || firstCollection.id || '');

            if (!indexes.objects[selectedObjectId]) {
                selectedObjectId = String(firstObject.id || '');
            }
            if (!indexes.collections[selectedCollectionId]) {
                selectedCollectionId = String(firstCollection.id || '');
            }

            return {
                dataset: dataset,
                indexes: indexes,
                orderedCollectionIds: orderedCollectionIds(dataset, indexes.collections),
                layers: layers(dataset, indexes.collections),
                runtimeSessionId: String(dataset.dataset && dataset.dataset.runtime_session_id || ''),
                selectedObjectId: selectedObjectId,
                selectedCollectionId: selectedCollectionId,
                actionResult: previous && previous.actionResult ? previous.actionResult : null,
                actionInFlight: false
            };
        }
    };

    function orderedCollectionIds(dataset, collectionIndex) {
        var layout = dataset.layout && typeof dataset.layout === 'object' ? dataset.layout : {};
        var seen = {};
        var ordered = [];

        (Array.isArray(layout.relevance_order) ? layout.relevance_order : []).forEach(function (id) {
            var value = String(id || '');
            if (collectionIndex[value] && !seen[value]) {
                ordered.push(value);
                seen[value] = true;
            }
        });

        common.sectionItems(dataset.collections).forEach(function (collection) {
            var id = String(collection.id || '');
            if (id !== '' && !seen[id]) {
                ordered.push(id);
                seen[id] = true;
            }
        });

        return ordered;
    }

    function layers(dataset, collectionIndex) {
        var layout = dataset.layout && typeof dataset.layout === 'object' ? dataset.layout : {};
        var carryRegions = common.sectionItems({items: layout.regions}).filter(function (region) {
            return String(region.layer || '') === 'carry';
        });
        return common.sectionItems({items: layout.layers}).map(function (layer) {
            var layerId = String(layer.id || '');
            return {
                id: layerId,
                label: common.text(layerId, 'Layer'),
                frame: common.text(layer.anchor, 'user') === 'world' ? 'world_anchored' : 'user_anchored',
                meaning: common.text(layer.purpose, ''),
                zones: zonesForLayer(layer, carryRegions, collectionIndex)
            };
        });
    }

    function zonesForLayer(layer, carryRegions, collectionIndex) {
        var layerId = String(layer.id || '');
        if (layerId === 'carry') {
            return carryRegions.map(function (region) {
                return zone(String(region.id || ''), common.text(region.purpose, ''), region.collection_ids, collectionIndex);
            });
        }
        return [
            zone(layerId, common.text(layer.purpose, ''), layer.collections, collectionIndex)
        ];
    }

    function zone(id, role, collectionIds, collectionIndex) {
        return {
            id: id,
            label: id,
            role: role,
            collectionIds: (Array.isArray(collectionIds) ? collectionIds : []).filter(function (collectionId) {
                return collectionIndex[String(collectionId || '')];
            }).map(function (collectionId) {
                return String(collectionId);
            })
        };
    }
}());
