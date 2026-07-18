/*
 * Browser projection for the World environment model.
 */
(function () {
    'use strict';

    var common = window.ElonnWorldRuntime.Common;

    window.ElonnWorldRuntime.WebRenderer = function (root) {
        var worldBaseUrl = String(root.dataset.worldBaseUrl || '').replace(/\/+$/, '');
        var nodes = {
            status: root.querySelector('[data-runtime-status]'),
            carryTop: root.querySelector('[data-layer-zone="carry:top_dock"]'),
            carryLeft: root.querySelector('[data-layer-zone="carry:left_panel"]'),
            carryMain: root.querySelector('[data-layer-zone="carry:main_content"]'),
            carryRight: root.querySelector('[data-layer-zone="carry:right_panel"]'),
            carryBottom: root.querySelector('[data-layer-zone="carry:bottom_dock"]'),
            findings: root.querySelector('[data-layer-zone="findings:findings"]'),
            field: root.querySelector('[data-layer-zone="field:field"]'),
            focus: root.querySelector('[data-runtime-focus]'),
            actions: root.querySelector('[data-runtime-actions]'),
            actionResult: root.querySelector('[data-runtime-action-result]'),
            resources: root.querySelector('[data-runtime-resources]'),
            related: root.querySelector('[data-runtime-related]'),
            statusRows: root.querySelector('[data-runtime-session]')
        };

        function status(message, state) {
            if (!nodes.status) {
                return;
            }
            nodes.status.textContent = message;
            nodes.status.dataset.state = common.text(state, 'neutral');
        }

        function render(scene) {
            var zoneMap = zonesByKey(scene.layers || []);
            renderZone(nodes.carryTop, zoneMap['carry:top_dock'], 'compact');
            renderZone(nodes.carryLeft, zoneMap['carry:left_panel'], 'panel');
            renderZone(nodes.carryMain, zoneMap['carry:carry'], 'panel');
            renderZone(nodes.carryRight, zoneMap['carry:right_panel'], 'panel');
            renderZone(nodes.carryBottom, zoneMap['carry:bottom_dock'], 'compact');
            renderZone(nodes.findings, zoneMap['findings:findings'], 'overlay');
            renderField(nodes.field, zoneMap['field:field']);
            common.replaceChildren(nodes.focus, [focusNode(scene.focus)]);
            common.replaceChildren(nodes.actions, actionNodes(scene.actions || []));
            common.replaceChildren(nodes.actionResult, scene.actionResult ? [actionResultNode(scene.actionResult)] : []);
            common.replaceChildren(nodes.resources, resourceNodes(scene.resources || []));
            common.replaceChildren(nodes.related, relatedNodes(scene.related || []));
            common.replaceChildren(nodes.statusRows, (scene.status || []).map(statusNode));
        }

        function zonesByKey(layers) {
            var output = {};
            layers.forEach(function (layer) {
                (layer.zones || []).forEach(function (zone) {
                    output[layer.id + ':' + zone.id] = zone;
                });
            });
            return output;
        }

        function renderZone(node, zone, mode) {
            if (!node) {
                return;
            }
            if (!zone) {
                common.replaceChildren(node, []);
                return;
            }
            common.replaceChildren(node, collections(zone.collections || [], mode).concat(objectList(zone.objects || [], mode)));
        }

        function renderField(node, zone) {
            if (!node) {
                return;
            }
            if (!zone) {
                common.replaceChildren(node, []);
                return;
            }
            var objects = [];
            (zone.collections || []).forEach(function (collection) {
                objects = objects.concat(collection.objects || []);
            });
            objects = objects.concat(zone.objects || []);
            common.replaceChildren(node, objects.map(fieldMarker));
        }

        function collections(items, mode) {
            if (items.length === 0) {
                return [];
            }
            return items.map(function (collection) {
                return collectionNode(collection, mode);
            });
        }

        function objectList(items, mode) {
            if (items.length === 0) {
                return [];
            }
            var list = document.createElement('div');
            list.className = 'world-object-list';
            items.forEach(function (object) {
                list.appendChild(objectButton(object, mode));
            });
            return [list];
        }

        function collectionNode(collection, mode) {
            var section = document.createElement('section');
            var header = document.createElement('header');
            var title = document.createElement('h3');
            var summary = document.createElement('p');
            var list = document.createElement('div');
            section.className = 'world-collection world-collection--' + common.text(mode, 'panel');
            section.dataset.collectionId = collection.id;
            section.dataset.selected = collection.selected ? 'true' : 'false';
            title.textContent = collection.title;
            summary.textContent = collection.summary;
            header.appendChild(title);
            if (collection.summary !== '' && mode !== 'compact') {
                header.appendChild(summary);
            }
            list.className = 'world-object-list';
            collection.objects.forEach(function (object) {
                list.appendChild(objectButton(object, mode));
            });
            section.appendChild(header);
            section.appendChild(list);
            return section;
        }

        function objectButton(object, mode) {
            var button = document.createElement('button');
            var type = document.createElement('span');
            var title = document.createElement('strong');
            var summary = document.createElement('span');
            button.type = 'button';
            button.className = 'world-object world-object--' + common.text(mode, 'panel');
            button.dataset.objectId = object.id;
            button.dataset.objectType = object.type;
            button.dataset.layer = object.layer;
            button.setAttribute('aria-pressed', object.selected ? 'true' : 'false');
            type.className = 'object-type';
            type.textContent = object.type;
            title.textContent = object.title;
            summary.className = 'object-summary';
            summary.textContent = object.summary;
            if (mode !== 'compact') {
                button.appendChild(type);
            }
            button.appendChild(title);
            if (object.summary !== '' && mode !== 'compact') {
                button.appendChild(summary);
            }
            if (object.availability.state !== 'enabled') {
                button.appendChild(badge(object.availability.state));
            }
            return button;
        }

        function fieldMarker(object, index) {
            var marker = document.createElement('button');
            var target = document.createElement('span');
            var dot = document.createElement('span');
            var label = document.createElement('span');
            var type = document.createElement('span');
            var title = document.createElement('strong');
            var position = fieldPosition(index);
            marker.type = 'button';
            marker.className = 'field-marker';
            marker.dataset.objectId = object.id;
            marker.style.left = position.left + '%';
            marker.style.top = position.top + '%';
            target.className = 'field-marker__target';
            dot.className = 'field-marker__dot';
            label.className = 'field-marker__label';
            type.textContent = object.type;
            title.textContent = object.title;
            target.appendChild(dot);
            label.appendChild(type);
            label.appendChild(title);
            marker.appendChild(target);
            marker.appendChild(label);
            return marker;
        }

        function fieldPosition(index) {
            var positions = [
                {left: 58, top: 43},
                {left: 35, top: 55},
                {left: 72, top: 57},
                {left: 48, top: 64},
                {left: 82, top: 45}
            ];
            return positions[index % positions.length];
        }

        function focusNode(object) {
            var article = document.createElement('article');
            var type = document.createElement('span');
            var title = document.createElement('h2');
            var summary = document.createElement('p');
            article.className = 'active-object';
            if (!object || object.kind === 'empty') {
                return emptyNode(object ? object.title : 'No object selected.');
            }
            type.className = 'object-type';
            type.textContent = object.type + ' / ' + object.layer;
            title.textContent = object.title;
            summary.textContent = object.summary;
            article.appendChild(type);
            article.appendChild(title);
            if (object.summary !== '') {
                article.appendChild(summary);
            }
            article.appendChild(metaLine('Visibility', object.visibility || 'default'));
            article.appendChild(metaLine('Permissions', permissionsText(object.permissions)));
            if (object.availability.state !== 'enabled') {
                article.appendChild(metaLine('Availability', availabilityText(object.availability)));
            }
            return article;
        }

        function actionNodes(actions) {
            if (actions.length === 0) {
                return [];
            }
            return actions.map(function (action) {
                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'world-action';
                button.dataset.actionId = action.id;
                button.disabled = action.availability.state !== 'enabled';
                button.textContent = action.label;
                if (button.disabled) {
                    button.title = availabilityText(action.availability);
                }
                return button;
            });
        }

        function resourceNodes(resources) {
            return resources.map(function (resource) {
                var figure = document.createElement('figure');
                var caption = document.createElement('figcaption');
                figure.className = 'world-resource';
                if (resource.href !== '' && (resource.mediaType === 'image' || resource.mediaType.indexOf('image/') === 0)) {
                    var image = document.createElement('img');
                    image.src = resourceUrl(resource.href);
                    image.alt = resource.label;
                    figure.appendChild(image);
                } else if (resource.href !== '') {
                    var link = document.createElement('a');
                    link.href = resourceUrl(resource.href);
                    link.textContent = resource.label;
                    figure.appendChild(link);
                }
                caption.textContent = resource.kind + ' / ' + common.text(resource.mediaType, 'resource');
                figure.appendChild(caption);
                return figure;
            });
        }

        function relatedNodes(related) {
            return related.map(function (entry) {
                var row = document.createElement('div');
                row.className = 'related-object';
                row.appendChild(metaLine(entry.type, entry.object.title));
                row.appendChild(objectButton(entry.object, 'panel'));
                return row;
            });
        }

        function actionResultNode(result) {
            var row = document.createElement('div');
            row.className = 'action-result action-result--' + common.text(result.state, 'neutral');
            row.textContent = common.text(result.message, 'World action returned a result.');
            return row;
        }

        function statusNode(row) {
            return metaLine(row.label, row.value);
        }

        function metaLine(label, value) {
            var row = document.createElement('p');
            var strong = document.createElement('strong');
            var span = document.createElement('span');
            row.className = 'meta-line';
            strong.textContent = label;
            span.textContent = value;
            row.appendChild(strong);
            row.appendChild(span);
            return row;
        }

        function badge(text) {
            var node = document.createElement('span');
            node.className = 'object-badge';
            node.textContent = text;
            return node;
        }

        function permissionsText(permissions) {
            return 'view ' + String(permissions && permissions.canView === true)
                + ' / act ' + String(permissions && permissions.canAct === true)
                + ' / share ' + String(permissions && permissions.canShare === true);
        }

        function availabilityText(availability) {
            var text = availability.state;
            if (availability.reason !== '') {
                text += ' / ' + availability.reason;
            }
            if (availability.requiredCapability !== '') {
                text += ' / requires ' + availability.requiredCapability;
            }
            return text;
        }

        function emptyNode(message) {
            var node = document.createElement('p');
            node.className = 'empty';
            node.textContent = message;
            return node;
        }

        function resourceUrl(href) {
            var value = String(href || '');
            if (value.indexOf('http://') === 0 || value.indexOf('https://') === 0) {
                return value;
            }
            if (value.indexOf('/') === 0) {
                return worldBaseUrl + value;
            }
            return value;
        }

        return {
            status: status,
            render: render
        };
    };
}());
