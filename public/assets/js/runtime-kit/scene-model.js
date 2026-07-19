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
                carryPanels: [],
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
                carryPanels: [],
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
                carryPanels: carryPanels(state),
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
                        }),
                        objects: (zone.objectIds || []).map(function (objectId) {
                            var object = state.indexes.objects[String(objectId || '')] || null;
                            return object ? objectView(state, object, String(object.id || '') === state.selectedObjectId) : null;
                        }).filter(Boolean)
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
            objects: common.itemIds(collection.items).map(function (objectId) {
                var object = state.indexes.objects[String(objectId || '')] || null;
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
            layer: common.text(metadata.anchor, objectLayer(state, object.id)),
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
            var sourceAvailability = availability(action.availability);
            return {
                id: String(action.id || ''),
                label: common.text(action.label, 'Action'),
                type: common.text(action.type, 'action'),
                endpoint: String(action.endpoint || ''),
                availability: {
                    state: 'unavailable',
                    reason: common.text(sourceAvailability.reason, 'Action execution is not available yet.'),
                    requiredCapability: common.text(sourceAvailability.requiredCapability, 'action_dispatch')
                },
                source: action
            };
        });
    }

    function resourcesForObject(state, object) {
        return common.itemIds(object.resourceIds || object.resources || []).map(function (resourceId) {
            var resource = state.indexes.resources[String(resourceId || '')] || {};
            return {
                id: String(resource.id || resourceId || ''),
                label: common.text(resource.label, 'Resource'),
                kind: common.text(resource.kind, 'resource'),
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

    function carryPanels(state) {
        return (state.carryPanels || []).map(function (panel) {
            var object = state.indexes.objects[String(panel.objectId || '')] || panel.object || null;
            if (!object) {
                return null;
            }
            return {
                id: String(panel.id || ''),
                object: objectView(state, object, String(object.id || '') === state.selectedObjectId),
                x: Number(panel.x || 0),
                y: Number(panel.y || 0),
                width: Number(panel.width || 320),
                height: Number(panel.height || 180),
                z: Number(panel.z || 1),
                collapsed: panel.collapsed === true
            };
        }).filter(function (panel) {
            return panel && panel.id !== '' && panel.object.id !== '';
        });
    }

    function objectLayer(state, objectId) {
        var id = String(objectId || '');
        var dataset = state.dataset || {};
        var placements = common.sectionItems(dataset.placements);
        var collections = state.indexes.collections || {};
        var collectionIds = [];

        placements.forEach(function (placement) {
            if (String(placement.object_id || '') === id) {
                collectionIds.push(String(placement.type || ''));
            }
            if (placement.collection_id !== '') {
                var collection = collections[String(placement.collection_id || '')] || {};
                if (common.itemIds(collection.items).indexOf(id) !== -1) {
                    collectionIds.push(String(placement.type || ''));
                }
            }
        });

        return collectionIds.filter(Boolean)[0] || 'workspace';
    }

    function statusRows(state) {
        var rows = [
            {label: 'Dataset', value: common.text(state.runtimeSessionId, 'pending')},
            {label: 'Scope', value: common.text(state.dataset.scope, 'full')},
            {label: 'Mode', value: common.text(state.dataset.mode, 'snapshot')}
        ];
        (state.dataset.errors || []).forEach(function (error) {
            rows.push({label: common.text(error.code, 'error'), value: common.text(error.message, 'World Dataset error.')});
        });
        return rows;
    }

    function layerHasObject(state, layer, objectId) {
        return layer.zones.some(function (zone) {
            return zoneHasObject(state, zone, objectId);
        });
    }

    function zoneHasObject(state, zone, objectId) {
        if ((zone.objectIds || []).indexOf(objectId) !== -1) {
            return true;
        }
        return zone.collectionIds.some(function (collectionId) {
            var collection = state.indexes.collections[collectionId] || {};
            return common.itemIds(collection.items).indexOf(objectId) !== -1;
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
