/*
 * Shared utilities for runtimes that consume the World Dataset Contract.
 */
(function () {
    'use strict';

    window.ElonnWorldRuntime = window.ElonnWorldRuntime || {};

    window.ElonnWorldRuntime.Common = {
        sectionItems: function (section) {
            var items = Array.isArray(section) ? section : (Array.isArray(section && section.items) ? section.items : []);
            return items.filter(function (item) {
                return item && typeof item === 'object';
            });
        },

        itemIds: function (items) {
            return (Array.isArray(items) ? items : []).map(function (item) {
                if (typeof item === 'string') {
                    return item;
                }
                if (item && typeof item === 'object') {
                    return String(item.object_id || item.object || item.id || item.resource_id || item.resource || '');
                }
                return '';
            }).filter(function (id) {
                return id !== '';
            });
        },

        indexBy: function (items, key) {
            var indexed = {};
            this.sectionItems({items: items}).forEach(function (item) {
                var id = String(item[key] || '');
                if (id !== '') {
                    indexed[id] = item;
                }
            });
            return indexed;
        },

        text: function (value, fallback) {
            var output = String(value || '');
            return output !== '' ? output : fallback;
        },

        clone: function (value) {
            return JSON.parse(JSON.stringify(value && typeof value === 'object' ? value : {}));
        },

        replaceChildren: function (node, children) {
            if (!node) {
                return;
            }
            while (node.firstChild) {
                node.removeChild(node.firstChild);
            }
            children.forEach(function (child) {
                node.appendChild(child);
            });
        }
    };
}());
