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
                windows: windows(dataset, indexes),
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
            var windowPlaced = {};
            dataset.placements.forEach(function (placement) {
                if (placement.type === 'window' && placement.collection_id !== '') {
                    windowPlaced[placement.collection_id] = true;
                }
            });
            dataset.collections.forEach(function (collection) {
                if (windowPlaced[collection.id]) {
                    return;
                }
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

    /*
     * One entry per window Placement id: its placed Collections and Objects, plus the mode /
     * title / navigation depth World tracks for it in context.windows. A window with no
     * context.windows entry (a Runtime seeing one mid-transition) falls back to object mode.
     */
    function windows(dataset, indexes) {
        var meta = dataset.windows && typeof dataset.windows === 'object' ? dataset.windows : {};
        var order = [];
        var byId = {};
        dataset.placements.filter(function (placement) {
            return placement.type === 'window' && placement.window_id !== '';
        }).forEach(function (placement) {
            var id = placement.window_id;
            if (!byId[id]) {
                byId[id] = {id: id, collectionIds: [], objectIds: [], mode: '', title: ''};
                order.push(id);
            }
            if (placement.window_mode !== '' && byId[id].mode === '') {
                byId[id].mode = placement.window_mode;
            }
            if (placement.collection_id !== '' && indexes.collections[placement.collection_id]) {
                byId[id].collectionIds.push(placement.collection_id);
            }
            if (placement.object_id !== '' && indexes.objects[placement.object_id]) {
                byId[id].objectIds.push(placement.object_id);
            }
        });

        return order.map(function (id) {
            var entry = byId[id];
            var m = meta[id] && typeof meta[id] === 'object' ? meta[id] : {};
            return {
                id: id,
                mode: (m.mode === 'dashboard' || m.mode === 'object') ? m.mode : (entry.mode === 'dashboard' ? 'dashboard' : 'object'),
                title: common.text(m.title, entry.title),
                depth: Math.max(0, parseInt(m.depth, 10) || 0),
                collectionIds: unique(entry.collectionIds),
                objectIds: unique(entry.objectIds)
            };
        });
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
