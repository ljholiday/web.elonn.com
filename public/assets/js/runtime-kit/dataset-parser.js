/*
 * Parses canonical World Datasets into Web-owned runtime state.
 */
(function () {
    'use strict';

    var common = window.ElonnWorldRuntime.Common;
    var datasetFields = [
        'id',
        'type',
        'scope',
        'mode',
        'created',
        'objects',
        'relationships',
        'actions',
        'collections',
        'resources',
        'placements',
        'errors',
        'context'
    ];

    window.ElonnWorldRuntime.DatasetParser = {
        datasetFields: datasetFields.slice(),

        parse: function (payload) {
            var dataset = payload && typeof payload === 'object' ? common.clone(payload) : {};
            this.validateDataset(dataset);
            return {
                id: String(dataset.id),
                type: 'world',
                scope: String(dataset.scope),
                mode: String(dataset.mode),
                created: String(dataset.created),
                objects: this.objects(dataset),
                relationships: this.relationships(dataset),
                actions: this.actions(dataset),
                collections: this.collections(dataset),
                resources: this.resources(dataset),
                placements: this.placements(dataset),
                errors: this.errors(dataset),
                navigation: this.navigation(dataset),
                focus: this.focus(dataset),
                context: dataset.context && typeof dataset.context === 'object' ? dataset.context : {}
            };
        },

        /*
         * context.focus: the one Object World considers focused for this response (see
         * dev.elonn canonical/dataset.md). '' means nothing is focused -- a bare search, a
         * restore, a close. The runtime highlights this Object; it never picks one itself.
         */
        focus: function (dataset) {
            var context = dataset.context && typeof dataset.context === 'object' ? dataset.context : {};
            var focus = context.focus && typeof context.focus === 'object' && !Array.isArray(context.focus) ? context.focus : {};
            return {object_id: String(focus.object_id || '')};
        },

        validateDataset: function (dataset) {
            if (!dataset || typeof dataset !== 'object' || dataset.type !== 'world') {
                throw new Error('Unsupported World Dataset.');
            }
            ['id', 'scope', 'mode', 'created'].forEach(function (field) {
                if (String(dataset[field] || '') === '') {
                    throw new Error('World Dataset is missing ' + field + '.');
                }
            });
            ['objects', 'relationships', 'actions', 'collections', 'resources', 'placements', 'errors'].forEach(function (field) {
                if (!Array.isArray(dataset[field])) {
                    throw new Error('World Dataset ' + field + ' must be an array.');
                }
            });
            if (!dataset.context || typeof dataset.context !== 'object' || Array.isArray(dataset.context)) {
                throw new Error('World Dataset context must be an object.');
            }
        },

        objects: function (dataset) {
            return dataset.objects.filter(isObject).map(function (object) {
                var content = object.content && typeof object.content === 'object' ? object.content : {};
                var metadata = object.metadata && typeof object.metadata === 'object' ? object.metadata : {};
                var properties = object.properties && typeof object.properties === 'object' ? object.properties : {};
                var permissions = object.permissions && typeof object.permissions === 'object'
                    ? object.permissions
                    : (object.domain_permissions && typeof object.domain_permissions === 'object' ? object.domain_permissions : {});
                return {
                    id: String(object.id || ''),
                    type: String(object.type || 'object'),
                    // Canonical, set by World (Composer::withCanonicalFields). One field, no chain.
                    title: common.text(object.title, ''),
                    summary: common.text(object.summary, ''),
                    content: content,
                    visibility: object.visibility && typeof object.visibility === 'object' ? object.visibility : {},
                    permissions: permissions,
                    availability: availability(object.availability || content.availability || properties.availability),
                    resourceIds: idsFrom(object.resources || content.resources || []),
                    metadata: Object.assign({}, properties, metadata, content)
                };
            }).filter(hasId);
        },

        actions: function (dataset) {
            return dataset.actions.filter(isObject).map(function (action) {
                var content = action.content && typeof action.content === 'object' ? action.content : {};
                return {
                    id: String(action.id || ''),
                    type: String(action.type || 'action'),
                    label: common.text(content.label || content.name || action.label || action.name, 'Action'),
                    group: common.text(content.group || action.group, ''),
                    // Canonical, set by World (Composer::withCanonicalFields).
                    target_id: String(action.target || ''),
                    href: String(content.href || content.url || action.href || ''),
                    operation_invocation: content.operation_invocation && typeof content.operation_invocation === 'object' && !Array.isArray(content.operation_invocation)
                        ? content.operation_invocation
                        : null,
                    availability: availability(action.availability || content.availability),
                    source: action
                };
            }).filter(function (action) {
                return action.id !== '' && action.target_id !== '';
            });
        },

        relationships: function (dataset) {
            return dataset.relationships.filter(isObject).map(function (relationship) {
                var content = relationship.content && typeof relationship.content === 'object' ? relationship.content : {};
                return {
                    id: String(relationship.id || ''),
                    type: String(relationship.type || 'relationship'),
                    from_id: String(relationship.source || content.source || ''),
                    to_id: String(relationship.target || content.target || '')
                };
            }).filter(function (relationship) {
                return relationship.id !== '' && relationship.from_id !== '' && relationship.to_id !== '';
            });
        },

        collections: function (dataset) {
            return dataset.collections.filter(isObject).map(function (collection) {
                var content = collection.content && typeof collection.content === 'object' ? collection.content : {};
                return {
                    id: String(collection.id || ''),
                    type: String(collection.type || 'collection'),
                    // Canonical, set by World (Composer::withCanonicalFields).
                    title: common.text(collection.title, ''),
                    summary: common.text(collection.summary, ''),
                    availability: availability(collection.availability || content.availability),
                    items: idsFrom(collection.items || content.items || [])
                };
            }).filter(hasId);
        },

        resources: function (dataset) {
            return dataset.resources.filter(isObject).map(function (resource) {
                var content = resource.content && typeof resource.content === 'object' ? resource.content : {};
                return {
                    id: String(resource.id || content.id || ''),
                    kind: String(content.kind || resource.type || 'resource'),
                    media_type: String(content.media_type || content.mediaType || ''),
                    href: String(content.href || content.url || ''),
                    label: common.text(content.label || content.name || resource.label || resource.id, 'Resource'),
                    content: content,
                    availability: availability(resource.availability || content.availability)
                };
            }).filter(hasId);
        },

        placements: function (dataset) {
            return dataset.placements.filter(isObject).map(function (placement) {
                var content = placement.content && typeof placement.content === 'object' ? placement.content : {};
                return {
                    id: String(placement.id || ''),
                    type: String(placement.type || ''),
                    object_id: String(content.object || ''),
                    collection_id: String(content.collection || ''),
                    resource_id: String(content.resource || '')
                };
            }).filter(function (placement) {
                return placement.id !== '' && ['carry', 'field'].indexOf(placement.type) !== -1;
            });
        },

        /*
         * context.objects: per-Object navigation state World owns for each Object opened on
         * Carry (see dev.elonn canonical/layout.md). title + depth drive the panel title bar;
         * members lists the ids of the content currently shown inside that Object's container;
         * subject is the one member the container has navigated into (or '').
         */
        navigation: function (dataset) {
            var context = dataset.context && typeof dataset.context === 'object' ? dataset.context : {};
            var objects = context.objects && typeof context.objects === 'object' && !Array.isArray(context.objects) ? context.objects : {};
            var parsed = {};
            Object.keys(objects).forEach(function (objectId) {
                var entry = objects[objectId] && typeof objects[objectId] === 'object' ? objects[objectId] : {};
                parsed[String(objectId)] = {
                    title: common.text(entry.title, ''),
                    depth: Math.max(0, parseInt(entry.depth, 10) || 0),
                    members: (Array.isArray(entry.members) ? entry.members : []).map(String).filter(Boolean),
                    subject: common.text(entry.subject, '')
                };
            });
            return parsed;
        },

        errors: function (dataset) {
            return dataset.errors.filter(isObject).map(function (error) {
                return {
                    code: String(error.code || ''),
                    class: String(error.class || ''),
                    message: String(error.message || '')
                };
            }).filter(function (error) {
                return error.code !== '' && error.class !== '' && error.message !== '';
            });
        }
    };

    function availability(value) {
        var source = value && typeof value === 'object' ? value : {};
        // Canonical availability is {state, reason} (dev.elonn canonical/action.md).
        return {
            state: common.text(source.state, 'enabled'),
            reason: common.text(source.reason, '')
        };
    }

    function idsFrom(items) {
        return (Array.isArray(items) ? items : []).map(function (item) {
            if (typeof item === 'string') {
                return item;
            }
            if (item && typeof item === 'object') {
                return String(item.object_id || item.object || item.id || item.resource_id || item.resource || '');
            }
            return '';
        }).filter(Boolean);
    }

    function isObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value);
    }

    function hasId(value) {
        return String(value.id || '') !== '';
    }

}());
