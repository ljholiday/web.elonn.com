/*
 * State indexer for canonical World Dataset runtime state.
 */
(function () {
    'use strict';

    var common = window.ElonnWorldRuntime.Common;

    window.ElonnWorldRuntime.StateIndexer = {
        mergeDatasets: function (previous, incoming) {
            if (!previous || !incoming) {
                return incoming;
            }

            return Object.assign({}, incoming, {
                objects: mergeById(previous.objects, incoming.objects),
                actions: mergeById(previous.actions, incoming.actions),
                relationships: mergeById(previous.relationships, incoming.relationships),
                collections: mergeCollections(previous.collections, incoming.collections),
                resources: mergeById(previous.resources, incoming.resources),
                placements: mergePlacements(previous.placements, incoming.placements, previous.collections, incoming.collections)
            });
        },

        build: function (dataset, previous) {
            var indexes = {
                objects: common.indexBy(dataset.objects, 'id'),
                actions: common.indexBy(dataset.actions, 'id'),
                collections: common.indexBy(dataset.collections, 'id'),
                resources: common.indexBy(dataset.resources, 'id')
            };
            var firstCollection = dataset.collections[0] || {};
            var firstObject = dataset.objects[0] || {};
            var selectedObjectId = String(previous && previous.selectedObjectId || firstObject.id || '');
            var selectedCollectionId = String(previous && previous.selectedCollectionId || firstCollection.id || '');

            if (!indexes.objects[selectedObjectId]) {
                selectedObjectId = String(firstObject.id || '');
            }
            if (!indexes.collections[selectedCollectionId]) {
                selectedCollectionId = String(firstCollection.id || '');
            }

            return {
                dataset: dataset,
                indexes: indexes,
                orderedCollectionIds: dataset.collections.map(function (collection) {
                    return String(collection.id || '');
                }).filter(Boolean),
                layers: layers(dataset, indexes),
                runtimeSessionId: String(dataset.id || ''),
                selectedObjectId: selectedObjectId,
                selectedCollectionId: selectedCollectionId,
                actionResult: previous && previous.actionResult ? previous.actionResult : null,
                actionInFlight: false
            };
        }
    };

    function mergeById(previousItems, incomingItems) {
        var seen = {};
        return common.sectionItems({items: incomingItems}).concat(common.sectionItems({items: previousItems})).filter(function (item) {
            var id = String(item.id || '');
            if (id === '' || seen[id]) {
                return false;
            }
            seen[id] = true;
            return true;
        });
    }

    function mergeCollections(previousItems, incomingItems) {
        return common.sectionItems({items: incomingItems}).concat(common.sectionItems({items: previousItems}).filter(function (collection) {
            return common.itemIds(collection.items).length > 0;
        })).filter(uniqueById());
    }

    function mergePlacements(previousItems, incomingItems, previousCollections, incomingCollections) {
        var collections = mergeCollections(previousCollections, incomingCollections);
        var collectionIds = common.indexBy(collections, 'id');
        return mergeById(previousItems, incomingItems).filter(function (placement) {
            if (placement.collection_id !== '') {
                return !!collectionIds[placement.collection_id];
            }
            return placement.object_id !== '' || placement.resource_id !== '';
        });
    }

    function uniqueById() {
        var seen = {};
        return function (item) {
            var id = String(item.id || '');
            if (id === '' || seen[id]) {
                return false;
            }
            seen[id] = true;
            return true;
        };
    }

    function layers(dataset, indexes) {
        return ['carry', 'workspace', 'field'].map(function (placementType) {
            return {
                id: placementType,
                label: placementType,
                frame: placementType === 'field' ? 'world_anchored' : 'user_anchored',
                meaning: placementType,
                zones: [
                    zone(placementType, indexes, dataset)
                ]
            };
        });
    }

    function zone(placementType, indexes, dataset) {
        var collectionIds = [];
        var objectIds = [];
        dataset.placements.filter(function (placement) {
            return placement.type === placementType;
        }).forEach(function (placement) {
            if (placement.collection_id !== '' && indexes.collections[placement.collection_id]) {
                collectionIds.push(placement.collection_id);
            }
            if (placement.object_id !== '' && indexes.objects[placement.object_id]) {
                objectIds.push(placement.object_id);
            }
        });

        if (placementType === 'workspace' && collectionIds.length === 0 && objectIds.length === 0) {
            dataset.collections.forEach(function (collection) {
                if (collection.type === placementType || ['carry', 'field'].indexOf(collection.type) === -1) {
                    collectionIds.push(collection.id);
                }
            });
        }

        return {
            id: placementType,
            label: placementType,
            role: placementType,
            collectionIds: unique(collectionIds),
            objectIds: unique(objectIds)
        };
    }

    function unique(items) {
        var seen = {};
        return items.filter(function (item) {
            var id = String(item || '');
            if (id === '' || seen[id]) {
                return false;
            }
            seen[id] = true;
            return true;
        });
    }

}());
