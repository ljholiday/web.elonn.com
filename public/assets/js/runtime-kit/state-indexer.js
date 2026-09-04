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
                openedObjects: openedObjects(dataset, indexes),
                findings: findings(dataset, indexes),
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

    /*
     * Elonn has exactly two layers, carry and field (dev.elonn canonical/layout.md). A layer's
     * zone lists only what a Placement of that type puts there -- opened Objects on carry, Maps
     * content on field. Unplaced content is not on a layer; it is Findings (see findings()).
     */
    function layers(dataset, indexes) {
        return ['carry', 'field'].map(function (placementType) {
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

        return {
            id: placementType,
            label: placementType,
            role: placementType,
            collectionIds: unique(collectionIds),
            objectIds: unique(objectIds)
        };
    }

    /*
     * One entry per Object opened on Carry: its carry Placement plus the per-Object navigation
     * state World owns in context.objects (title, depth, and the ids of the content currently
     * shown inside its container). Navigation history belongs to the Object (layout.md).
     */
    function openedObjects(dataset, indexes) {
        var nav = dataset.navigation && typeof dataset.navigation === 'object' ? dataset.navigation : {};
        var order = [];
        var seen = {};
        dataset.placements.filter(function (placement) {
            return placement.type === 'carry' && placement.object_id !== '' && indexes.objects[placement.object_id];
        }).forEach(function (placement) {
            var id = placement.object_id;
            if (seen[id]) {
                return;
            }
            seen[id] = true;
            order.push(id);
        });

        return order.map(function (id) {
            var entry = nav[id] && typeof nav[id] === 'object' ? nav[id] : {};
            var members = Array.isArray(entry.members) ? entry.members.map(String) : [];
            return {
                id: id,
                title: common.text(entry.title, common.text((indexes.objects[id] || {}).title, '')),
                depth: Math.max(0, parseInt(entry.depth, 10) || 0),
                collectionIds: unique(members.filter(function (m) { return !!indexes.collections[m]; })),
                objectIds: unique(members.filter(function (m) { return !!indexes.objects[m] && m !== id; }))
            };
        });
    }

    /*
     * Findings: everything returned for a Call that no Placement puts on a layer and that
     * belongs to no opened Object. A Runtime presents these in the Results pane (layout.md).
     */
    function findings(dataset, indexes) {
        var claimed = {};
        dataset.placements.forEach(function (placement) {
            if (placement.object_id !== '') { claimed[placement.object_id] = true; }
            if (placement.collection_id !== '') { claimed[placement.collection_id] = true; }
            if (placement.resource_id !== '') { claimed[placement.resource_id] = true; }
        });
        var nav = dataset.navigation && typeof dataset.navigation === 'object' ? dataset.navigation : {};
        Object.keys(nav).forEach(function (objectId) {
            claimed[objectId] = true;
            (Array.isArray(nav[objectId].members) ? nav[objectId].members : []).forEach(function (memberId) {
                claimed[String(memberId)] = true;
            });
        });
        var placedObjectIds = {};
        dataset.collections.forEach(function (collection) {
            if (claimed[collection.id]) {
                common.itemIds(collection.items).forEach(function (itemId) { placedObjectIds[itemId] = true; });
            }
        });

        return {
            collectionIds: unique(dataset.collections.filter(function (collection) {
                return !claimed[collection.id];
            }).map(function (collection) { return collection.id; })),
            objectIds: unique(dataset.objects.filter(function (object) {
                return !claimed[object.id] && !placedObjectIds[object.id];
            }).map(function (object) { return object.id; }))
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
