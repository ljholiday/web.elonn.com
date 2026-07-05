/*
 * Shared utilities for runtimes that consume the World Dataset Contract.
 */
(function () {
    'use strict';

    window.ElonnWorldRuntime = window.ElonnWorldRuntime || {};

    window.ElonnWorldRuntime.Common = {
        sectionItems: function (section) {
            return Array.isArray(section && section.items) ? section.items.filter(function (item) {
                return item && typeof item === 'object';
            }) : [];
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
