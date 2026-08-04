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
            workspace: root.querySelector('[data-layer-zone="workspace:workspace"]'),
            field: root.querySelector('[data-layer-zone="field:field"]'),
            carryPanels: root.querySelector('[data-runtime-carry-panels]'),
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
            renderZone(nodes.workspace, zoneMap['workspace:workspace'], 'overlay');
            renderField(nodes.field, zoneMap['field:field']);
            common.replaceChildren(nodes.carryPanels, carryPanelNodes(scene.carryPanels || []));
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
            if (collection.objects.length === 0) {
                list.appendChild(emptyCollectionNotice(collection));
            } else {
                collection.objects.forEach(function (object) {
                    list.appendChild(objectButton(object, mode));
                });
            }
            section.appendChild(header);
            section.appendChild(list);
            return section;
        }

        function emptyCollectionNotice(collection) {
            var notice = document.createElement('p');
            notice.className = 'empty';
            notice.textContent = collection.summary || 'No results.';
            return notice;
        }

        function objectButton(object, mode) {
            var button = document.createElement('button');
            var type = document.createElement('span');
            var title = document.createElement('strong');
            var summary = document.createElement('span');
            var preview = imagePreview(object);
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
            if (preview && mode !== 'compact') {
                button.appendChild(preview);
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

        function imagePreview(object) {
            var resources = Array.isArray(object.resources) ? object.resources : [];
            var image = null;
            resources.some(function (resource) {
                var content = resource && typeof resource.content === 'object' ? resource.content : {};
                var dataUrl = String(content.data_url || '');
                if (dataUrl.indexOf('data:image/') === 0) {
                    image = document.createElement('img');
                    image.className = 'object-preview';
                    image.src = dataUrl;
                    image.alt = '';
                    image.loading = 'lazy';
                    return true;
                }
                return false;
            });

            return image;
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

        function carryPanelNodes(panels) {
            return panels.map(function (panel) {
                var article = document.createElement('article');
                var header = document.createElement('header');
                var title = document.createElement('h2');
                var close = document.createElement('button');
                var content = document.createElement('div');
                var resize = document.createElement('span');
                var type = document.createElement('span');
                var summary = document.createElement('p');

                article.className = 'carry-object-panel';
                article.dataset.carryPanelId = panel.id;
                article.dataset.objectId = panel.object.id;
                article.dataset.collapsed = panel.collapsed ? 'true' : 'false';
                article.style.left = panel.x + 'px';
                article.style.top = panel.y + 'px';
                article.style.width = panel.width + 'px';
                if (!panel.collapsed) {
                    article.style.height = panel.height + 'px';
                }
                article.style.zIndex = String(panel.z || 1);

                title.className = 'carry-object-panel__title';
                title.dataset.carryPanelTitle = panel.id;
                title.textContent = panel.object.title;

                close.className = 'carry-object-panel__close';
                close.type = 'button';
                close.dataset.carryPanelClose = panel.id;
                close.setAttribute('aria-label', 'Close ' + panel.object.title);
                close.textContent = 'x';

                content.className = 'carry-object-panel__content';
                type.className = 'object-type';
                type.textContent = panel.object.type + ' / ' + panel.object.layer;
                summary.textContent = panel.object.summary;

                content.appendChild(type);
                if (panel.object.summary !== '') {
                    content.appendChild(summary);
                }
                content.appendChild(objectSurface(panel.object));

                resize.className = 'carry-object-panel__resize';
                resize.dataset.carryPanelResize = panel.id;
                resize.setAttribute('aria-hidden', 'true');

                header.className = 'carry-object-panel__bar';
                header.dataset.carryPanelTitle = panel.id;
                header.appendChild(title);
                header.appendChild(close);
                article.appendChild(header);
                article.appendChild(content);
                article.appendChild(resize);
                return article;
            });
        }

        function statusNode(row) {
            return metaLine(row.label, row.value);
        }

        function objectSurface(object) {
            if (object.surface && object.surface.mode === 'hosted') {
                return hostedSurface(object);
            }

            return genericPreview(object);
        }

        function hostedSurface(object) {
            var surface = object.surface || {};
            var content = object.content || {};
            var frame = document.createElement('section');
            var preview = document.createElement('div');
            var width = Number(content.width || 0);
            var height = Number(content.height || 0);
            frame.className = 'hosted-object-surface';
            frame.dataset.hostedSurface = 'true';
            frame.dataset.surfaceMode = surface.mode || '';
            frame.dataset.surfaceService = surface.service || '';
            frame.dataset.surfaceKind = surface.kind || '';
            frame.dataset.objectId = object.id || '';
            frame.dataset.sourceResource = String((surface.resources && surface.resources.source) || content.source_resource || '');
            frame.dataset.previewResource = String((surface.resources && surface.resources.preview) || content.preview_resource || '');
            frame.dataset.hostedObject = JSON.stringify(object);
            preview.className = 'hosted-object-surface__preview';
            if (width > 0 && height > 0) {
                preview.style.aspectRatio = String(width) + ' / ' + String(height);
            }
            frame.appendChild(preview);
            return frame;
        }

        function genericPreview(object) {
            var fragment = document.createDocumentFragment();
            fragment.appendChild(metaLine('Visibility', object.visibility || 'default'));
            fragment.appendChild(metaLine('Permissions', permissionsText(object.permissions)));
            return fragment;
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

        return {
            status: status,
            render: render
        };
    };
}());
