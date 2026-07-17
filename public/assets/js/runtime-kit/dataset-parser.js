/*
 * Dataset parser and adapter for canonical World Datasets.
 */
(function () {
    'use strict';

    var common = window.ElonnWorldRuntime.Common;
    var requiredSections = [
        'identity',
        'context',
        'objects',
        'relationships',
        'actions',
        'collections',
        'layout',
        'capabilities',
        'permissions',
        'resources',
        'extensions',
        'metadata'
    ];

    window.ElonnWorldRuntime.DatasetParser = {
        requiredSections: requiredSections.slice(),

        parse: function (payload) {
            var dataset = payload && typeof payload === 'object' ? common.clone(payload) : {};
            var adapted = {};
            var contract = {};

            if (dataset.type === 'world') {
                adapted = this.fromCanonicalDataset(dataset);
                this.validateReferences(adapted);
                return adapted;
            }

            contract = dataset.dataset && typeof dataset.dataset === 'object' ? dataset.dataset : {};
            if (contract.name !== 'elonn.world.dataset' || Number(contract.version) !== 1) {
                throw new Error('Unsupported World Dataset contract.');
            }

            requiredSections.forEach(function (sectionName) {
                var section = dataset[sectionName] && typeof dataset[sectionName] === 'object' ? dataset[sectionName] : {};
                if (section.name !== sectionName || Number(section.version) !== 1) {
                    throw new Error('Unsupported World Dataset section: ' + sectionName);
                }
            });

            this.validateReferences(dataset);
            return dataset;
        },

        fromCanonicalDataset: function (dataset) {
            return {
                dataset: {
                    name: 'elonn.world.dataset',
                    version: 1,
                    runtime_session_id: String(dataset.id || '')
                },
                identity: this.section('identity', []),
                context: {
                    name: 'context',
                    version: 1,
                    runtime_context: this.runtimeContext(dataset)
                },
                objects: this.section('objects', this.objects(dataset)),
                relationships: this.section('relationships', this.relationships(dataset)),
                actions: this.section('actions', this.actions(dataset)),
                collections: this.section('collections', this.collections(dataset)),
                layout: this.layout(dataset),
                capabilities: this.section('capabilities', []),
                permissions: this.section('permissions', []),
                resources: this.section('resources', this.resources(dataset)),
                extensions: this.section('extensions', []),
                metadata: {
                    name: 'metadata',
                    version: 1,
                    canonical_dataset_id: String(dataset.id || ''),
                    canonical_created: String(dataset.created || ''),
                    errors: Array.isArray(dataset.errors) ? dataset.errors : []
                }
            };
        },

        section: function (name, items) {
            return {
                name: name,
                version: 1,
                items: Array.isArray(items) ? items : []
            };
        },

        runtimeContext: function (dataset) {
            var context = dataset.context && typeof dataset.context === 'object' ? dataset.context : {};
            var runtime = context.runtime && typeof context.runtime === 'object' ? context.runtime : {};
            return {
                intent: 'overview',
                scope: String(dataset.scope || 'full'),
                runtime_id: String(runtime.id || 'web'),
                runtime_session_id: String(runtime.session_id || dataset.id || '')
            };
        },

        objects: function (dataset) {
            return (Array.isArray(dataset.objects) ? dataset.objects : []).filter(Boolean).map(function (object) {
                var properties = object.properties && typeof object.properties === 'object' ? object.properties : {};
                var metadata = object.metadata && typeof object.metadata === 'object' ? object.metadata : {};
                return {
                    id: String(object.id || ''),
                    type: String(object.type || 'object'),
                    title: String(object.name || object.title || 'Object'),
                    summary: String(object.description || object.summary || ''),
                    visibility: properties.visibility && typeof properties.visibility === 'object' ? properties.visibility : {},
                    permissions: properties.permissions && typeof properties.permissions === 'object' ? properties.permissions : {},
                    availability: properties.availability && typeof properties.availability === 'object' ? properties.availability : {state: 'enabled', reason: null},
                    resources: Array.isArray(object.resources) ? object.resources : [],
                    metadata: Object.assign({}, properties, metadata)
                };
            }).filter(function (object) {
                return object.id !== '';
            });
        },

        actions: function (dataset) {
            return (Array.isArray(dataset.actions) ? dataset.actions : []).filter(Boolean).map(function (action) {
                var metadata = action.metadata && typeof action.metadata === 'object' ? action.metadata : {};
                return {
                    id: String(action.id || ''),
                    type: String(action.type || 'action'),
                    label: String(action.name || action.label || 'Action'),
                    target_id: String(metadata.target_id || ''),
                    endpoint: '',
                    availability: {
                        state: 'disabled',
                        reason: 'world_action_endpoint_unavailable'
                    }
                };
            }).filter(function (action) {
                return action.id !== '' && action.target_id !== '';
            });
        },

        relationships: function (dataset) {
            return (Array.isArray(dataset.relationships) ? dataset.relationships : []).filter(Boolean).map(function (relationship) {
                var content = relationship.content && typeof relationship.content === 'object' ? relationship.content : {};
                return {
                    id: String(relationship.id || ''),
                    type: String(relationship.type || 'relationship'),
                    from_id: String(content.from_id || relationship.from_id || ''),
                    to_id: String(content.to_id || relationship.to_id || '')
                };
            }).filter(function (relationship) {
                return relationship.id !== '' && relationship.from_id !== '' && relationship.to_id !== '';
            });
        },

        collections: function (dataset) {
            return (Array.isArray(dataset.collections) ? dataset.collections : []).filter(Boolean).map(function (collection) {
                var content = collection.content && typeof collection.content === 'object' ? collection.content : {};
                return {
                    id: String(collection.id || ''),
                    type: String(collection.type || 'collection'),
                    title: String(content.name || collection.name || 'Collection'),
                    summary: String(content.description || collection.description || ''),
                    availability: content.availability && typeof content.availability === 'object' ? content.availability : {state: 'enabled', reason: null},
                    items: Array.isArray(content.items) ? content.items : []
                };
            }).filter(function (collection) {
                return collection.id !== '';
            });
        },

        resources: function (dataset) {
            return (Array.isArray(dataset.resources) ? dataset.resources : []).filter(Boolean).map(function (resource) {
                var content = resource.content && typeof resource.content === 'object' ? resource.content : {};
                return {
                    id: String(resource.id || content.id || ''),
                    kind: String(content.kind || resource.type || 'resource'),
                    media_type: String(content.media_type || ''),
                    href: String(content.href || ''),
                    label: String(content.label || resource.id || 'Resource'),
                    availability: content.availability && typeof content.availability === 'object' ? content.availability : {state: 'enabled', reason: null}
                };
            }).filter(function (resource) {
                return resource.id !== '';
            });
        },

        layout: function (dataset) {
            var collectionIds = (Array.isArray(dataset.collections) ? dataset.collections : []).map(function (collection) {
                return String(collection.id || '');
            }).filter(Boolean);
            var has = function (id) {
                return collectionIds.indexOf(id) !== -1;
            };
            var findings = collectionIds.filter(function (id) {
                return id === 'world_collection_mind_results' || id === 'world_collection_search_results';
            });
            var field = collectionIds.filter(function (id) {
                return id === 'world_collection_nearby_places' || id === 'world_collection_today_events';
            });
            return {
                name: 'layout',
                version: 1,
                primary_collection_id: has('world_collection_navigation') ? 'world_collection_navigation' : (collectionIds[0] || ''),
                primary_object_id: '',
                relevance_order: collectionIds,
                layers: [
                    {id: 'carry', anchor: 'user', purpose: 'Personal carry context.', collections: []},
                    {id: 'findings', anchor: 'user', purpose: 'Findings returned by the current world state.', collections: findings},
                    {id: 'field', anchor: 'world', purpose: 'World-anchored field objects.', collections: field}
                ],
                regions: [
                    {id: 'top_dock', layer: 'carry', purpose: 'Navigation', collection_ids: has('world_collection_navigation') ? ['world_collection_navigation'] : []},
                    {id: 'left_panel', layer: 'carry', purpose: 'Recent context', collection_ids: collectionIds.filter(function (id) {
                        return ['world_collection_recent_conversations', 'world_collection_suggested_people', 'world_collection_community_feed'].indexOf(id) !== -1;
                    })},
                    {id: 'main_content', layer: 'carry', purpose: 'Primary carry content', collection_ids: collectionIds.filter(function (id) {
                        return ['world_collection_resources', 'world_collection_favorites'].indexOf(id) !== -1;
                    })},
                    {id: 'right_panel', layer: 'carry', purpose: 'Saved and temporal context', collection_ids: collectionIds.filter(function (id) {
                        return ['world_collection_favorites', 'world_collection_today_events'].indexOf(id) !== -1;
                    })},
                    {id: 'bottom_dock', layer: 'carry', purpose: 'Resources', collection_ids: has('world_collection_resources') ? ['world_collection_resources'] : []}
                ]
            };
        },

        validateReferences: function (dataset) {
            var objectIds = common.indexBy(common.sectionItems(dataset.objects), 'id');
            var resourceIds = common.indexBy(common.sectionItems(dataset.resources), 'id');
            var collectionIds = common.indexBy(common.sectionItems(dataset.collections), 'id');

            common.sectionItems(dataset.collections).forEach(function (collection) {
                common.sectionItems({items: collection.items}).forEach(function (item) {
                    if (!objectIds[String(item.object_id || '')]) {
                        throw new Error('Collection references a missing object.');
                    }
                });
            });

            common.sectionItems(dataset.relationships).forEach(function (relationship) {
                if (!objectIds[String(relationship.from_id || '')] || !objectIds[String(relationship.to_id || '')]) {
                    throw new Error('Relationship references a missing object.');
                }
            });

            common.sectionItems(dataset.actions).forEach(function (action) {
                if (!objectIds[String(action.target_id || '')]) {
                    throw new Error('Action references a missing object.');
                }
            });

            common.sectionItems(dataset.objects).forEach(function (object) {
                common.sectionItems({items: object.resources}).forEach(function (reference) {
                    if (!resourceIds[String(reference.resource_id || '')]) {
                        throw new Error('Object references a missing resource.');
                    }
                });
            });

            common.sectionItems({items: dataset.layout && dataset.layout.layers}).forEach(function (layer) {
                (Array.isArray(layer.collections) ? layer.collections : []).forEach(function (collectionId) {
                    if (!collectionIds[String(collectionId || '')]) {
                        throw new Error('Layer references a missing collection.');
                    }
                });
            });

            common.sectionItems({items: dataset.layout && dataset.layout.regions}).forEach(function (region) {
                (Array.isArray(region.collection_ids) ? region.collection_ids : []).forEach(function (collectionId) {
                    if (!collectionIds[String(collectionId || '')]) {
                        throw new Error('Region references a missing collection.');
                    }
                });
            });
        }
    };
}());
