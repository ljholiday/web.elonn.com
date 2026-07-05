/*
 * Flat-screen projection model for the World Dataset.
 */
(function () {
    'use strict';

    var common = window.ElonnWorldRuntime.Common;

    window.ElonnWorldRuntime.SceneModel = {
        loading: function () {
            return {
                layers: [],
                focus: {kind: 'empty', title: 'Requesting World Dataset.', summary: ''},
                actions: [],
                resources: [],
                related: [],
                status: []
            };
        },

        error: function (message) {
            return {
                layers: [],
                focus: {kind: 'empty', title: 'World Dataset unavailable.', summary: message},
                actions: [],
                resources: [],
                related: [],
                status: []
            };
        },

        fromState: function (state) {
            var selectedObject = state.indexes.objects[state.selectedObjectId] || null;
            return {
                layers: layers(state),
                focus: selectedObject ? objectView(state, selectedObject, true) : {kind: 'empty', title: 'No object selected.', summary: ''},
                actions: selectedObject ? actionsForObject(state, selectedObject.id) : [],
                resources: selectedObject ? resourcesForObject(state, selectedObject) : [],
                related: selectedObject ? relatedObjects(state, selectedObject.id) : [],
                actionResult: state.actionResult || null,
                status: statusRows(state)
            };
        }
    };

    function layers(state) {
        return (state.layers || []).map(function (layer) {
            return {
                id: layer.id,
                label: layer.label,
                frame: layer.frame,
                meaning: layer.meaning,
                selected: layerHasObject(state, layer, state.selectedObjectId),
                zones: layer.zones.map(function (zone) {
                    return {
                        id: zone.id,
                        label: zone.label,
                        role: zone.role,
                        selected: zoneHasObject(state, zone, state.selectedObjectId),
                        collections: zone.collectionIds.map(function (collectionId) {
                            return collectionView(state, state.indexes.collections[collectionId] || {});
                        }).filter(function (collection) {
                            return collection.id !== '';
                        })
                    };
                })
            };
        });
    }

    function collectionView(state, collection) {
        return {
            id: String(collection.id || ''),
            title: common.text(collection.title, 'Collection'),
            summary: common.text(collection.summary, ''),
            type: common.text(collection.type, 'collection'),
            selected: String(collection.id || '') === state.selectedCollectionId,
            availability: availability(collection.availability),
            objects: common.sectionItems({items: collection.items}).map(function (item) {
                var object = state.indexes.objects[String(item.object_id || '')] || null;
                return object ? objectView(state, object, String(object.id || '') === state.selectedObjectId) : null;
            }).filter(Boolean)
        };
    }

    function objectView(state, object, selected) {
        var metadata = object.metadata && typeof object.metadata === 'object' ? object.metadata : {};
        var visibility = object.visibility && typeof object.visibility === 'object' ? object.visibility : {};
        var permissions = object.permissions && typeof object.permissions === 'object' ? object.permissions : {};
        return {
            id: String(object.id || ''),
            title: common.text(object.title, 'Object'),
            summary: common.text(object.summary, ''),
            type: common.text(object.type, 'object'),
            layer: common.text(metadata.anchor, 'carry'),
            selected: selected,
            availability: availability(object.availability),
            visibility: Array.isArray(visibility.scopes) ? visibility.scopes.join(', ') : '',
            permissions: {
                canView: permissions.can_view === true,
                canAct: permissions.can_act === true,
                canShare: permissions.can_share === true,
                reason: common.text(permissions.reason, '')
            },
            resources: resourcesForObject(state, object)
        };
    }

    function actionsForObject(state, objectId) {
        return common.sectionItems(state.dataset.actions).filter(function (action) {
            return String(action.target_id || '') === String(objectId || '');
        }).map(function (action) {
            return {
                id: String(action.id || ''),
                label: common.text(action.label, 'Action'),
                type: common.text(action.type, 'action'),
                endpoint: String(action.endpoint || ''),
                availability: availability(action.availability),
                source: action
            };
        });
    }

    function resourcesForObject(state, object) {
        return common.sectionItems({items: object.resources}).map(function (reference) {
            var resource = state.indexes.resources[String(reference.resource_id || '')] || {};
            return {
                id: String(resource.id || reference.resource_id || ''),
                label: common.text(resource.label, 'Resource'),
                kind: common.text(reference.kind || resource.kind, 'resource'),
                mediaType: common.text(resource.media_type, ''),
                href: common.text(resource.href, ''),
                availability: availability(resource.availability)
            };
        });
    }

    function relatedObjects(state, objectId) {
        return common.sectionItems(state.dataset.relationships).filter(function (relationship) {
            return String(relationship.from_id || '') === objectId || String(relationship.to_id || '') === objectId;
        }).map(function (relationship) {
            var otherId = String(relationship.from_id || '') === objectId ? String(relationship.to_id || '') : String(relationship.from_id || '');
            var object = state.indexes.objects[otherId] || {};
            return {
                type: common.text(relationship.type, 'related'),
                object: objectView(state, object, String(object.id || '') === state.selectedObjectId)
            };
        }).filter(function (entry) {
            return entry.object.id !== '';
        });
    }

    function statusRows(state) {
        var context = state.dataset.context && state.dataset.context.runtime_context && typeof state.dataset.context.runtime_context === 'object'
            ? state.dataset.context.runtime_context
            : {};
        return [
            {label: 'Session', value: common.text(state.runtimeSessionId, 'pending')},
            {label: 'Intent', value: common.text(context.intent, 'overview')},
            {label: 'Scope', value: common.text(context.scope, 'default')}
        ];
    }

    function layerHasObject(state, layer, objectId) {
        return layer.zones.some(function (zone) {
            return zoneHasObject(state, zone, objectId);
        });
    }

    function zoneHasObject(state, zone, objectId) {
        return zone.collectionIds.some(function (collectionId) {
            var collection = state.indexes.collections[collectionId] || {};
            return common.sectionItems({items: collection.items}).some(function (item) {
                return String(item.object_id || '') === objectId;
            });
        });
    }

    function availability(value) {
        var availability = value && typeof value === 'object' ? value : {};
        return {
            state: common.text(availability.state, 'unknown'),
            reason: common.text(availability.reason, ''),
            requiredCapability: common.text(availability.required_capability, '')
        };
    }
}());
