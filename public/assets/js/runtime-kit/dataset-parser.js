/*
 * Dataset parser and validator for elonn.world.dataset v1.
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
            var contract = dataset.dataset && typeof dataset.dataset === 'object' ? dataset.dataset : {};

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
                if (String(action.endpoint || '').indexOf('/world/actions/') !== 0) {
                    throw new Error('Action does not publish a World endpoint.');
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
