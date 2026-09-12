/*
 * State indexer for canonical World Dataset runtime state.
 */
(function () {
    'use strict';

    var common = window.ElonnWorldRuntime.Common;

    window.ElonnWorldRuntime.StateIndexer = {
        build: function (dataset) {
            var indexes = {
                objects: common.indexBy(dataset.objects, 'id'),
                actions: common.indexBy(dataset.actions, 'id'),
                collections: common.indexBy(dataset.collections, 'id'),
                resources: common.indexBy(dataset.resources, 'id')
            };
            // Focus is World's: context.focus.object_id names the one focused Object, or '' for
            // none. The runtime does not fall back to the first Object -- nothing is focused
            // until the member focuses a Finding or navigates an Object, and a prior response's
            // selection is never carried forward into this one. The selected Collection follows
            // the focused Object (the Collection that contains it), if any.
            var focusedId = String((dataset.focus && dataset.focus.object_id) || '');
            var selectedObjectId = indexes.objects[focusedId] ? focusedId : '';
            var selectedCollectionId = selectedObjectId ? collectionIdContaining(dataset, selectedObjectId) : '';

            return {
                dataset: dataset,
                indexes: indexes,
                orderedCollectionIds: dataset.collections.map(function (collection) {
                    return String(collection.id || '');
                }).filter(Boolean),
                layers: layers(dataset, indexes),
                openedObjects: openedObjects(dataset, indexes),
                findings: findings(dataset),
                runtimeSessionId: String(dataset.id || ''),
                selectedObjectId: selectedObjectId,
                selectedCollectionId: selectedCollectionId
            };
        }
    };

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
            var subject = String(entry.subject || '');
            return {
                id: id,
                title: common.text(entry.title, common.text((indexes.objects[id] || {}).title, '')),
                depth: Math.max(0, parseInt(entry.depth, 10) || 0),
                collectionIds: unique(members.filter(function (m) { return !!indexes.collections[m]; })),
                objectIds: unique(members.filter(function (m) { return !!indexes.objects[m] && m !== id; })),
                subject: indexes.objects[subject] ? subject : '',
                // The semantic region focused within this container's document content, or ''
                // for its region list -- World's own state (dataset.navigation[id].region).
                region: String(entry.region || '')
            };
        });
    }

    /*
     * Findings: the Results-pane results, as World composed them into dataset.findings
     * (dev.elonn canonical/finding.md), in the exact order World wrote them -- newest first,
     * collections and objects interleaved as World ordered them. The runtime does not decide
     * what is a Finding, and it does not re-group or re-order this list by entity kind: doing
     * so would silently reorder results (e.g. burying a fresh object-type Finding under a
     * block of collection-type ones), which is exactly the ordering World's own composer
     * guarantees callers do not have to re-derive.
     */
    function findings(dataset) {
        var list = Array.isArray(dataset.findings) ? dataset.findings : [];
        var seen = {};
        var ordered = [];
        list.forEach(function (finding) {
            var collectionId = String(finding.collection_id || '');
            var objectId = String(finding.object_id || '');
            if (collectionId !== '' && !seen['c:' + collectionId]) {
                seen['c:' + collectionId] = true;
                ordered.push({kind: 'collection', id: collectionId});
            } else if (objectId !== '' && !seen['o:' + objectId]) {
                seen['o:' + objectId] = true;
                ordered.push({kind: 'object', id: objectId});
            }
        });
        return ordered;
    }

    function collectionIdContaining(dataset, objectId) {
        var match = '';
        (dataset.collections || []).some(function (collection) {
            if (common.itemIds(collection.items).indexOf(objectId) !== -1) {
                match = String(collection.id || '');
                return true;
            }
            return false;
        });
        return match;
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
