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
            workspace: null,
            field: root.querySelector('[data-layer-zone="field:field"]'),
            carryPanels: root.querySelector('[data-runtime-carry-panels]'),
            workspaceMount: root.querySelector('[data-workspace-panel-mount]'),
            statusRows: root.querySelector('[data-runtime-session]')
        };
        var workspacePanelEl = null;
        var workspaceToggleButton = null;

        function status(message, state) {
            if (!nodes.status) {
                return;
            }
            nodes.status.textContent = message;
            nodes.status.dataset.state = common.text(state, 'neutral');
        }

        function render(scene, options) {
            options = options && typeof options === 'object' ? options : {};
            var workspaceOptions = options.workspace || {};
            var zoneMap = zonesByKey(scene.layers || []);
            ensureWorkspacePanel(workspaceOptions);
            updateFloatingPanelChrome(workspacePanelEl, workspaceOptions);
            updateWorkspaceContent(scene.content || {}, workspaceOptions.findScope);
            if (workspaceToggleButton) {
                workspaceToggleButton.textContent = workspaceOptions.collapsed === true ? 'Show' : 'Hide';
            }
            renderWorkspace(nodes.workspace, zoneMap['workspace:workspace'], zoneMap['carry:carry'], workspaceOptions);
            renderField(nodes.field, zoneMap['field:field']);
            common.replaceChildren(nodes.carryPanels, carryPanelNodes(scene.carryPanels || []));
            common.replaceChildren(nodes.statusRows, (scene.status || []).map(statusNode));
        }

        /*
         * Built exactly once, the first time real panel state (position/size) is available --
         * never rebuilt on subsequent renders, unlike carry panels, because it hosts the live
         * query input; replaceChildren-ing it every render would drop focus and in-progress text.
         */
        function ensureWorkspacePanel(options) {
            var built = null;
            if (workspacePanelEl || !nodes.workspaceMount) {
                return;
            }
            built = workspacePanelNode(options);
            workspacePanelEl = built.article;
            workspaceToggleButton = built.toggleButton;
            nodes.workspace = built.resultsNode;
            nodes.workspaceMount.appendChild(workspacePanelEl);
        }

        /*
         * The workspace panel is built exactly once (see ensureWorkspacePanel), so title,
         * placeholder, and scope options -- all sourced from the World Dataset's
         * context.content, not hardcoded here -- would otherwise be frozen at whatever
         * SceneModel.loading()'s empty content was during that first build. Re-applied on
         * every render instead, the same way updateFloatingPanelChrome() re-applies
         * geometry every render despite the panel structure itself only existing once.
         */
        function updateWorkspaceContent(content, currentScope) {
            var find = content.find && typeof content.find === 'object' ? content.find : {};
            var titleNode = null;
            var input = null;
            var clearButton = null;
            var scopeGroup = null;
            if (!workspacePanelEl) {
                return;
            }
            titleNode = workspacePanelEl.querySelector('.carry-object-panel__title');
            if (titleNode) {
                titleNode.textContent = common.text(find.title, 'Find');
            }
            input = workspacePanelEl.querySelector('[data-runtime-query-input]');
            if (input) {
                input.placeholder = common.text(find.placeholder, 'Ask or search');
            }
            clearButton = workspacePanelEl.querySelector('[data-workspace-results-clear]');
            if (clearButton) {
                clearButton.textContent = common.text(find.clear_label, 'Clear');
            }
            scopeGroup = workspacePanelEl.querySelector('[data-runtime-find-scope-group]');
            if (scopeGroup) {
                common.replaceChildren(scopeGroup, scopeButtonNodes(find, currentScope));
            }
        }

        function scopeButtonNodes(find, currentScope) {
            var scope = find.scope && typeof find.scope === 'object' ? find.scope : {};
            var options = Array.isArray(scope.enum) ? scope.enum : [];
            var active = common.text(currentScope, scope.default);
            return options.map(function (value) {
                var button = panelButton({
                    label: humanizeKey(value),
                    dataset: 'runtimeFindScope',
                    datasetValue: value,
                    className: 'workspace-results-panel__scope'
                });
                button.dataset.active = String(value) === String(active) ? 'true' : 'false';
                return button;
            });
        }

        function renderWorkspace(node, zone, selfZone, options) {
            var content = [];
            if (!node) {
                return;
            }
            if (options.closed === true || options.collapsed === true || options.emptyVisible === true) {
                common.replaceChildren(node, []);
                return;
            }

            content = objectList((selfZone && selfZone.objects) || [], 'overlay');
            if (zone) {
                content = content.concat(collections(zone.collections || [], 'overlay')).concat(objectList(zone.objects || [], 'overlay'));
            }
            if (content.length === 0) {
                common.replaceChildren(node, []);
                return;
            }

            common.replaceChildren(node, content);
        }

        function panelHeader(config) {
            config = config && typeof config === 'object' ? config : {};
            var header = document.createElement('header');
            var title = document.createElement('h2');
            var actions = document.createElement('div');
            var close = config.closable === false ? null : panelButton({
                label: 'x',
                dataset: config.closeDataset,
                datasetValue: config.closeDatasetValue,
                ariaLabel: config.closeLabel
            });

            header.className = ['carry-object-panel__bar', common.text(config.barClass, '')].filter(Boolean).join(' ');
            setDataset(header, config.headerDataset, config.headerDatasetValue);
            title.className = 'carry-object-panel__title';
            setDataset(title, config.titleDataset, config.titleDatasetValue);
            title.textContent = common.text(config.title, 'Object');
            actions.className = 'carry-object-panel__actions';

            (Array.isArray(config.actions) ? config.actions : []).forEach(function (action) {
                actions.appendChild(action);
            });
            if (close) {
                actions.appendChild(close);
            }
            header.appendChild(title);
            header.appendChild(actions);
            return header;
        }

        /*
         * Shared by every floating layer in the runtime -- carried objects and the workspace
         * results panel alike get identical fixed sizing (persisted per panelId, driven by
         * options.x/y/width/height/collapsed/z), the same tap-header-to-collapse and drag (via
         * the generic [data-carry-panel-title]/[data-carry-panel-resize] handlers in
         * web-runtime.js), and the same resize handle. panelId is either a real World object id
         * or a fixed pseudo-id like "workspace-results"; both are just keys the runtime's panel
         * state store resolves generically. Mirrors xreal.elonn.app's CreateFloatingPanel, which
         * uses the same single-function-for-every-panel shape for the identical reason.
         */
        function floatingPanel(config) {
            config = config && typeof config === 'object' ? config : {};
            var article = document.createElement('article');
            var content = document.createElement('div');
            var resize = document.createElement('span');

            article.className = ['carry-object-panel', common.text(config.className, '')].filter(Boolean).join(' ');
            article.dataset.carryPanelId = config.id;
            if (config.objectId) {
                article.dataset.objectId = config.objectId;
            }

            content.className = ['carry-object-panel__content', common.text(config.contentClassName, '')].filter(Boolean).join(' ');
            if (typeof config.buildContent === 'function') {
                config.buildContent(content);
            }

            resize.className = 'carry-object-panel__resize';
            resize.dataset.carryPanelResize = config.id;
            resize.setAttribute('aria-hidden', 'true');

            article.appendChild(panelHeader({
                title: config.title,
                barClass: config.barClass,
                headerDataset: 'carryPanelTitle',
                headerDatasetValue: config.id,
                titleDataset: 'carryPanelTitle',
                titleDatasetValue: config.id,
                actions: config.headerActions || [],
                closable: config.closable !== false,
                closeDataset: 'carryPanelClose',
                closeDatasetValue: config.id,
                closeLabel: config.closeLabel || ('Close ' + common.text(config.title, 'panel'))
            }));
            article.appendChild(content);
            article.appendChild(resize);
            updateFloatingPanelChrome(article, config);
            return article;
        }

        /*
         * Applies position/size/collapse/z-order -- the only parts of a floating panel that
         * change after it exists. Called once at construction (via floatingPanel()) and again on
         * every render for panels built once and reused (the workspace panel); carry panels are
         * rebuilt fresh each render so their initial construction call is the only one they need.
         */
        function updateFloatingPanelChrome(article, options) {
            options = options && typeof options === 'object' ? options : {};
            if (!article) {
                return;
            }
            article.dataset.collapsed = options.collapsed === true ? 'true' : 'false';
            if (typeof options.x === 'number') {
                article.style.left = options.x + 'px';
            }
            if (typeof options.y === 'number') {
                article.style.top = options.y + 'px';
            }
            if (typeof options.width === 'number') {
                article.style.width = options.width + 'px';
            }
            if (options.collapsed === true) {
                article.style.height = '';
            } else if (typeof options.height === 'number') {
                article.style.height = options.height + 'px';
            }
            article.style.zIndex = String(options.z || 1);
        }

        /*
         * The workspace results panel, built through the exact same floatingPanel() every carry
         * panel uses -- not a second, hand-rolled container. Not closable (there is always
         * exactly one; collapsing hides it, nothing removes it). The live query form lives in
         * content, not the header, so header-drag never conflicts with typing or the Voice/Clear
         * buttons -- the same separation xreal's CreateFloatingPanel already uses for its
         * "query-results" panel.
         */
        function workspacePanelNode(options) {
            var content = options.content && typeof options.content === 'object' ? options.content : {};
            var find = content.find && typeof content.find === 'object' ? content.find : {};
            var resultsNode = document.createElement('div');
            var clearButton = panelButton({
                label: common.text(find.clear_label, 'Clear'),
                dataset: 'workspaceResultsClear',
                datasetValue: 'true',
                className: 'workspace-results-panel__clear',
                ariaLabel: 'Clear results'
            });
            var toggleButton = panelButton({
                label: options.collapsed === true ? 'Show' : 'Hide',
                dataset: 'workspaceResultsToggle',
                datasetValue: 'true',
                className: 'workspace-results-panel__toggle',
                ariaLabel: 'Toggle workspace results'
            });
            var article = floatingPanel({
                id: 'workspace-results',
                className: 'workspace-results-panel',
                barClass: 'workspace-results-panel__bar',
                contentClassName: 'workspace-results-panel__content',
                title: common.text(find.title, 'Find'),
                closable: false,
                collapsed: options.collapsed === true,
                x: options.x,
                y: options.y,
                width: options.width,
                height: options.height,
                z: options.z,
                headerActions: [clearButton, toggleButton],
                buildContent: function (content) {
                    resultsNode.className = 'workspace-results-panel__list';
                    resultsNode.dataset.workspaceResultsContent = 'true';
                    content.appendChild(queryFormNode(options.content || {}));
                    content.appendChild(resultsNode);
                }
            });
            return {article: article, resultsNode: resultsNode, toggleButton: toggleButton};
        }

        function queryFormNode(content) {
            var find = content.find && typeof content.find === 'object' ? content.find : {};
            var form = document.createElement('form');
            var label = document.createElement('label');
            var field = document.createElement('div');
            var input = document.createElement('input');
            var voice = document.createElement('button');
            var voiceIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            var actions = document.createElement('div');
            var scopeGroup = document.createElement('div');

            form.className = 'query-composer';
            form.setAttribute('data-runtime-query-form', '');
            form.setAttribute('role', 'search');

            label.className = 'visually-hidden';
            label.setAttribute('for', 'runtime-query');
            label.textContent = 'World query';

            field.className = 'query-composer__field';
            input.id = 'runtime-query';
            input.className = 'query-composer__input';
            input.setAttribute('data-runtime-query-input', '');
            input.type = 'search';
            input.name = 'query';
            input.autocomplete = 'off';
            input.spellcheck = true;
            input.placeholder = common.text(find.placeholder, 'Ask or search');

            voice.type = 'button';
            voice.className = 'query-composer__voice';
            voice.setAttribute('data-runtime-voice', '');
            voice.setAttribute('aria-label', 'Start voice input');
            voiceIcon.setAttribute('viewBox', '0 0 24 24');
            voiceIcon.setAttribute('aria-hidden', 'true');
            voiceIcon.setAttribute('focusable', 'false');
            voiceIcon.innerHTML =
                '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"></path>' +
                '<path d="M5 11a7 7 0 0 0 14 0"></path>' +
                '<path d="M12 18v3"></path>' +
                '<path d="M8 21h8"></path>';
            voice.appendChild(voiceIcon);

            field.appendChild(input);
            field.appendChild(voice);

            actions.className = 'carry-object-panel__actions';

            scopeGroup.className = 'workspace-results-panel__scope-group';
            scopeGroup.setAttribute('data-runtime-find-scope-group', '');
            scopeButtonNodes(find, find.scope && find.scope.default).forEach(function (button) {
                scopeGroup.appendChild(button);
            });
            actions.appendChild(scopeGroup);

            form.appendChild(label);
            form.appendChild(field);
            form.appendChild(actions);
            return form;
        }

        function panelButton(config) {
            config = config && typeof config === 'object' ? config : {};
            var button = document.createElement('button');
            button.type = 'button';
            button.className = ['carry-object-panel__close', common.text(config.className, '')].filter(Boolean).join(' ');
            setDataset(button, config.dataset, config.datasetValue);
            if (common.text(config.ariaLabel, '') !== '') {
                button.setAttribute('aria-label', config.ariaLabel);
            }
            button.textContent = common.text(config.label, 'x');
            return button;
        }

        function setDataset(node, key, value) {
            key = common.text(key, '');
            if (key !== '') {
                node.dataset[key] = common.text(value, '');
            }
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
                if (collection.type === 'sequence') {
                    return sequenceNode(collection, mode);
                }
                if (collection.type === 'roster') {
                    return rosterNode(collection, mode);
                }
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
            if (collection.summary !== '' && mode !== 'compact' && collection.objects.length > 0) {
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

        /*
         * Renders a canonical `sequence` Collection (an ordered, related flow of Objects -- a
         * conversation's replies, a thread's messages) as a grouped, chronological flow instead
         * of the generic result-grid `collectionNode()` uses for everything else. Each entry
         * stays its own addressable Object (own id, own data-object-id, click/select/carry works
         * exactly like objectButton()) -- sequence only changes how the group is laid out, not
         * what each member is.
         */
        function sequenceNode(collection, mode) {
            var section = document.createElement('section');
            var header = document.createElement('header');
            var title = document.createElement('h3');
            var summary = document.createElement('p');
            var flow = document.createElement('div');
            section.className = 'world-collection world-collection--' + common.text(mode, 'panel') + ' world-sequence';
            section.dataset.collectionId = collection.id;
            section.dataset.selected = collection.selected ? 'true' : 'false';
            title.textContent = collection.title;
            summary.textContent = collection.summary;
            header.appendChild(title);
            if (collection.summary !== '' && mode !== 'compact') {
                header.appendChild(summary);
            }
            flow.className = 'world-sequence-flow';
            if (collection.objects.length === 0) {
                flow.appendChild(emptyCollectionNotice(collection));
            } else {
                sequenceGroups(collection.objects).forEach(function (group) {
                    flow.appendChild(sequenceGroupNode(group, mode));
                });
            }
            section.appendChild(header);
            section.appendChild(flow);
            return section;
        }

        /*
         * Groups already-ordered sequence members by consecutive same origin (sender/author) --
         * a display grouping only, not a canonical property of the sequence itself.
         */
        function sequenceGroups(objects) {
            var groups = [];
            objects.forEach(function (object) {
                var origin = sequenceOrigin(object);
                var current = groups.length > 0 ? groups[groups.length - 1] : null;
                if (current && current.origin === origin) {
                    current.objects.push(object);
                    return;
                }
                groups.push({origin: origin, objects: [object]});
            });
            return groups;
        }

        function sequenceOrigin(object) {
            var content = object.content && typeof object.content === 'object' ? object.content : {};
            return common.text(content.sender_identity_user_id || content.author_identity_user_id, object.title);
        }

        function sequenceGroupNode(group, mode) {
            var wrapper = document.createElement('div');
            var label = document.createElement('strong');
            wrapper.className = 'world-sequence-group';
            label.className = 'world-sequence-group__origin';
            label.textContent = group.objects[0].title;
            wrapper.appendChild(label);
            group.objects.forEach(function (object) {
                wrapper.appendChild(sequenceEntryNode(object, mode));
            });
            return wrapper;
        }

        function sequenceEntryNode(object, mode) {
            var content = object.content && typeof object.content === 'object' ? object.content : {};
            var entry = document.createElement('button');
            var body = document.createElement('span');
            var time = document.createElement('span');
            entry.type = 'button';
            entry.className = 'world-sequence-entry';
            entry.dataset.objectId = object.id;
            entry.dataset.objectType = object.type;
            entry.dataset.layer = object.layer;
            entry.setAttribute('aria-pressed', object.selected ? 'true' : 'false');
            body.className = 'world-sequence-entry__body';
            body.textContent = common.text(content.body, object.summary);
            entry.appendChild(body);
            if (mode !== 'compact') {
                time.className = 'world-sequence-entry__time';
                time.textContent = sequenceTimeLabel(content.created_at);
                entry.appendChild(time);
            }
            if (object.availability.state !== 'enabled') {
                entry.appendChild(badge(object.availability.state));
            }
            return entry;
        }

        function sequenceTimeLabel(createdAt) {
            var value = common.text(createdAt, '');
            if (value === '') {
                return '';
            }
            var parsed = new Date(value.indexOf('T') === -1 ? value.replace(' ', 'T') : value);
            if (isNaN(parsed.getTime())) {
                return '';
            }
            return parsed.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
        }

        /*
         * Renders a canonical `roster` Collection (a participant list -- a conversation's
         * participants, a community's members, an event's guests) as a compact list of people
         * instead of the generic result-grid `collectionNode()` uses. Each entry stays its own
         * addressable Object (own id, own data-object-id, click/select/carry works exactly like
         * objectButton()) -- roster only changes how the group is laid out. Role / RSVP / circle
         * text rides in each member Object's own title and summary; no literal chrome here.
         */
        function rosterNode(collection, mode) {
            var section = document.createElement('section');
            var header = document.createElement('header');
            var title = document.createElement('h3');
            var summary = document.createElement('p');
            var list = document.createElement('div');
            section.className = 'world-collection world-roster';
            section.dataset.collectionId = collection.id;
            section.dataset.selected = collection.selected ? 'true' : 'false';
            title.textContent = collection.title;
            summary.textContent = collection.summary;
            header.appendChild(title);
            if (collection.summary !== '' && mode !== 'compact' && collection.objects.length > 0) {
                header.appendChild(summary);
            }
            list.className = 'world-roster-list';
            if (collection.objects.length === 0) {
                list.appendChild(emptyCollectionNotice(collection));
            } else {
                collection.objects.forEach(function (object) {
                    list.appendChild(rosterEntryNode(object, mode));
                });
            }
            section.appendChild(header);
            section.appendChild(list);
            return section;
        }

        function rosterEntryNode(object, mode) {
            var entry = document.createElement('button');
            var name = document.createElement('span');
            var meta = document.createElement('span');
            entry.type = 'button';
            entry.className = 'world-roster-entry';
            entry.dataset.objectId = object.id;
            entry.dataset.objectType = object.type;
            entry.dataset.layer = object.layer;
            entry.setAttribute('aria-pressed', object.selected ? 'true' : 'false');
            name.className = 'world-roster-entry__name';
            name.textContent = object.title;
            entry.appendChild(name);
            if (object.summary !== '' && mode !== 'compact') {
                meta.className = 'world-roster-entry__meta';
                meta.textContent = object.summary;
                entry.appendChild(meta);
            }
            if (object.availability.state !== 'enabled') {
                entry.appendChild(badge(object.availability.state));
            }
            return entry;
        }

        function emptyCollectionNotice(collection) {
            var notice = document.createElement('p');
            notice.className = 'empty';
            notice.textContent = collection.summary || 'No results.';
            return notice;
        }

        function objectButton(object, mode) {
            var wrapper = document.createElement('div');
            var button = document.createElement('button');
            var type = document.createElement('span');
            var title = document.createElement('strong');
            var summary = document.createElement('span');
            var preview = imagePreview(object);
            wrapper.className = 'world-object-entry';
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
            wrapper.appendChild(button);
            if (mode !== 'compact') {
                cardLinks(object).forEach(function (link) {
                    wrapper.appendChild(link);
                });
            }
            return wrapper;
        }

        function cardLinks(object) {
            var links = [];
            firstHref(object.resources, 'Source', links, object.id);
            firstHref(object.actions, 'Action', links, object.id);
            return links;
        }

        function firstHref(items, label, output, objectId) {
            (Array.isArray(items) ? items : []).some(function (item) {
                var href = common.text(item && item.href, '');
                if (href === '') {
                    return false;
                }
                output.push(cardLink(label, common.text(item.label, href), href, objectId));
                return true;
            });
        }

        function cardLink(label, text, href, objectId) {
            var link = externalHref(href) ? document.createElement('button') : document.createElement('a');
            link.className = 'world-object-link';
            if (externalHref(href)) {
                link.type = 'button';
                link.className += ' world-object-link--runtime';
                link.dataset.runtimeUrl = href;
                link.dataset.runtimeUrlLabel = common.text(text, href);
                link.dataset.runtimeUrlParent = common.text(objectId, '');
                link.title = href;
            } else {
                link.href = href;
                link.rel = 'noopener noreferrer';
            }
            link.textContent = label + ': ' + text;
            return link;
        }

        function imagePreview(object) {
            var resources = Array.isArray(object.resources) ? object.resources : [];
            var image = null;
            resources.some(function (resource) {
                var content = resource && typeof resource.content === 'object' ? resource.content : {};
                var dataUrl = String(content.data_url || '');
                var externalUrl = (content.kind === 'image') ? String(content.href || content.url || '') : '';
                var src = dataUrl.indexOf('data:image/') === 0 ? dataUrl : externalUrl;
                if (src === '') {
                    return false;
                }
                image = document.createElement('img');
                image.className = 'object-preview';
                image.src = src;
                image.alt = common.text(content.label, '');
                image.loading = 'lazy';
                return true;
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
                return floatingPanel({
                    id: panel.id,
                    objectId: panel.object.id,
                    title: panel.object.title,
                    closable: true,
                    collapsed: panel.collapsed,
                    x: panel.x,
                    y: panel.y,
                    width: panel.width,
                    height: panel.height,
                    z: panel.z,
                    closeLabel: 'Close ' + panel.object.title,
                    buildContent: function (content) {
                        var type = document.createElement('span');
                        var summary = document.createElement('p');
                        type.className = 'object-type';
                        type.textContent = panel.object.type + ' / ' + panel.object.layer;
                        summary.textContent = panel.object.summary;
                        content.appendChild(type);
                        if (panel.object.summary !== '') {
                            content.appendChild(summary);
                        }
                        content.appendChild(objectSurface(panel.object));
                    }
                });
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
            var segment = segmentNode(object);
            var website = segment ? null : websiteDocument(object);
            var editableKeys = editableFieldKeys(object);
            if (segment) {
                fragment.appendChild(segment);
            } else if (website) {
                fragment.appendChild(websiteNode(website, object));
            }
            containedObjectNodes(object).forEach(function (node) {
                fragment.appendChild(node);
            });
            detailRows(object).forEach(function (row) {
                fragment.appendChild(metaLine(row.label, row.value));
            });
            remainingContentRows(object, editableKeys).forEach(function (row) {
                fragment.appendChild(metaLine(row.label, row.value));
            });
            resourceLinks(object).forEach(function (link) {
                fragment.appendChild(link);
            });
            if (!website) {
                actionLinks(object).forEach(function (link) {
                    fragment.appendChild(link);
                });
            }
            if (object.visibility !== '') {
                fragment.appendChild(metaLine('Visibility', object.visibility));
            }
            fragment.appendChild(metaLine('Permissions', permissionsText(object.permissions)));
            return fragment;
        }

        function websiteDocument(object) {
            var match = null;
            if (isDecomposedObject(object)) {
                return null;
            }
            (Array.isArray(object.resources) ? object.resources : []).some(function (resource) {
                var content = resource && typeof resource.content === 'object' ? resource.content : {};
                if (resource.kind === 'website.document' || content.kind === 'website.document') {
                    match = content;
                    return true;
                }
                return false;
            });
            return match;
        }

        function segmentNode(object) {
            var content = object.content && typeof object.content === 'object' ? object.content : {};
            var parts = Array.isArray(content.parts) ? content.parts : [];
            var section = null;
            var title = null;
            var list = null;
            if (!isDecomposedObject(object) || parts.length === 0) {
                return null;
            }
            section = document.createElement('section');
            title = document.createElement('h4');
            list = document.createElement('div');
            section.className = 'object-segment';
            title.textContent = object.title;
            list.className = 'object-segment__parts';
            parts.forEach(function (part) {
                var node = segmentPartNode(part, object);
                if (node) {
                    list.appendChild(node);
                }
            });
            section.appendChild(title);
            if (list.childNodes.length > 0) {
                section.appendChild(list);
            }
            return section;
        }

        function segmentPartNode(part, object) {
            var kind = common.text(part && part.kind, '');
            var title = common.text(part && part.title, '');
            var text = common.text(part && part.text, '');
            var href = common.text(part && part.href, '');
            var node = document.createElement('section');
            var heading = document.createElement('h5');
            var paragraph = document.createElement('p');
            var button = null;
            if (title === '' && text === '' && href === '') {
                return null;
            }
            node.className = 'object-segment__part';
            heading.textContent = title !== '' ? title : (kind !== '' ? kind : 'Part');
            node.appendChild(heading);
            if (text !== '') {
                paragraph.textContent = text;
                node.appendChild(paragraph);
            }
            if (href !== '') {
                button = document.createElement('button');
                button.type = 'button';
                button.dataset.runtimeUrl = href;
                button.dataset.runtimeUrlLabel = title !== '' ? title : domainFromUrl(href);
                button.dataset.runtimeUrlParent = common.text(object && object.id, '');
                button.textContent = button.dataset.runtimeUrlLabel;
                button.title = href;
                node.appendChild(button);
            }
            return node;
        }

        function isDecomposedObject(object) {
            var content = object && typeof object.content === 'object' ? object.content : {};
            return common.text(content.parent_resource_object_id, '') !== '';
        }

        function containedObjectNodes(object) {
            var objects = Array.isArray(object.containedObjects) ? object.containedObjects : [];
            var section = null;
            var title = null;
            var list = null;
            if (objects.length === 0) {
                return [];
            }
            section = document.createElement('section');
            title = document.createElement('h4');
            list = document.createElement('div');
            section.className = 'object-decomposition';
            title.textContent = 'Objects';
            list.className = 'object-decomposition__list';
            objects.forEach(function (child) {
                list.appendChild(containedObjectButton(child));
            });
            section.appendChild(title);
            section.appendChild(list);
            return [section];
        }

        function containedObjectButton(object) {
            var button = document.createElement('button');
            var type = document.createElement('span');
            var title = document.createElement('strong');
            var summary = document.createElement('span');
            button.type = 'button';
            button.className = 'object-decomposition__object';
            button.dataset.objectId = object.id;
            type.className = 'object-type';
            type.textContent = object.type;
            title.textContent = object.title;
            summary.className = 'object-summary';
            summary.textContent = object.summary;
            button.appendChild(type);
            button.appendChild(title);
            if (object.summary !== '') {
                button.appendChild(summary);
            }
            return button;
        }

        function websiteNode(website, object) {
            var article = document.createElement('article');
            var header = document.createElement('header');
            var title = document.createElement('h4');
            var summary = document.createElement('p');
            var domain = document.createElement('p');
            var sections = document.createElement('div');
            article.className = 'website-document';
            title.textContent = common.text(website.title, 'Website');
            summary.textContent = common.text(website.description, '');
            domain.className = 'website-document__domain';
            domain.textContent = common.text(website.domain || domainFromUrl(website.url), '');
            header.appendChild(title);
            if (summary.textContent !== '') {
                header.appendChild(summary);
            }
            if (domain.textContent !== '') {
                header.appendChild(domain);
            }
            sections.className = 'website-document__sections';
            (Array.isArray(website.sections) ? website.sections : []).forEach(function (section) {
                sections.appendChild(websiteSection(section));
            });
            if (sections.childNodes.length === 0 && summary.textContent !== '') {
                sections.appendChild(websiteSection({
                    title: title.textContent,
                    text: summary.textContent
                }));
            }
            article.appendChild(header);
            article.appendChild(sections);
            websiteLinks(website, object).forEach(function (link) {
                article.appendChild(link);
            });
            return article;
        }

        function websiteSection(section) {
            var node = document.createElement('section');
            var title = document.createElement('h5');
            var text = document.createElement('p');
            node.className = 'website-document__section';
            title.textContent = common.text(section && section.title, 'Section');
            text.textContent = common.text(section && section.text, '');
            node.appendChild(title);
            if (text.textContent !== '') {
                node.appendChild(text);
            }
            return node;
        }

        function websiteLinks(website, object) {
            var links = Array.isArray(website.links) ? website.links : [];
            if (links.length === 0) {
                return [];
            }
            var list = document.createElement('ul');
            list.className = 'website-document__links';
            links.slice(0, 8).forEach(function (link) {
                var item = document.createElement('li');
                var button = document.createElement('button');
                var label = common.text(link && link.label, '');
                var href = common.text(link && link.href, '');
                button.type = 'button';
                button.dataset.runtimeUrl = href;
                button.dataset.runtimeUrlLabel = label !== '' ? label : domainFromUrl(href);
                button.dataset.runtimeUrlParent = common.text(object && object.id, '');
                button.textContent = button.dataset.runtimeUrlLabel;
                button.title = href;
                item.appendChild(button);
                list.appendChild(item);
            });
            return [list];
        }

        function detailRows(object) {
            var content = object.content && typeof object.content === 'object' ? object.content : {};
            var rows = [];
            addRow(rows, 'Source', content.source_domain || domainFromUrl(content.source_url || content.canonical_url));
            addRow(rows, 'Rank', content.rank);
            addRow(rows, 'Category', content.category || content.component_type);
            addRow(rows, 'When', content.starts_at || content.due_at || content.last_message_at || content.published_at);
            addRow(rows, 'Location', locationText(content));
            addRow(rows, 'Distance', distanceText(content.distance_meters));
            addRow(rows, 'Messages', content.message_count);
            addRow(rows, 'Participants', content.participant_count);
            if (content.search && typeof content.search === 'object') {
                addRow(rows, 'Match', content.search.why);
            }
            return rows;
        }

        function addRow(rows, label, value) {
            var text = '';
            if (typeof value === 'number' && isFinite(value)) {
                text = String(value);
            } else {
                text = common.text(value, '');
            }
            if (text !== '') {
                rows.push({label: label, value: text});
            }
        }

        var KNOWN_CONTENT_KEYS = [
            'name', 'description',
            'source_domain', 'source_url', 'canonical_url', 'url',
            'rank', 'category', 'component_type',
            'starts_at', 'due_at', 'last_message_at', 'published_at',
            'location', 'address', 'distance_meters',
            'message_count', 'participant_count', 'search', 'parts',
            'parent_resource_object_id', 'parent_object_id',
            'width', 'height', 'source_resource', 'preview_resource'
        ];

        function editableFieldKeys(object) {
            var keys = {};
            (Array.isArray(object.actions) ? object.actions : []).forEach(function (action) {
                var operationInvocation = action.operationInvocation;
                var args = operationInvocation && typeof operationInvocation === 'object' ? operationInvocation.arguments : null;
                if (args && typeof args === 'object' && !Array.isArray(args)) {
                    Object.keys(args).forEach(function (key) {
                        keys[key] = true;
                    });
                }
            });
            return keys;
        }

        function remainingContentRows(object, skipKeys) {
            var content = object.content && typeof object.content === 'object' ? object.content : {};
            var skip = skipKeys && typeof skipKeys === 'object' ? skipKeys : {};
            var rows = [];
            Object.keys(content).forEach(function (key) {
                var value = content[key];
                var text = '';
                if (KNOWN_CONTENT_KEYS.indexOf(key) !== -1 || skip[key]) {
                    return;
                }
                if (typeof value === 'string') {
                    text = value.trim();
                } else if (typeof value === 'number' && isFinite(value)) {
                    text = String(value);
                } else if (typeof value === 'boolean') {
                    text = value ? 'Yes' : 'No';
                } else {
                    return;
                }
                if (text === '' || text === object.title || text === object.summary) {
                    return;
                }
                rows.push({label: humanizeKey(key), value: text});
            });
            return rows;
        }

        function humanizeKey(key) {
            return String(key || '').split('_').filter(Boolean).map(function (word) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            }).join(' ');
        }

        function locationText(content) {
            if (typeof content.location === 'string') {
                return content.location;
            }
            if (content.address && typeof content.address === 'object') {
                return Object.keys(content.address).map(function (key) {
                    return common.text(content.address[key], '');
                }).filter(Boolean).join(', ');
            }
            if (content.location && typeof content.location === 'object') {
                var latitude = common.text(content.location.latitude, '');
                var longitude = common.text(content.location.longitude, '');
                return latitude !== '' && longitude !== '' ? latitude + ', ' + longitude : '';
            }
            return '';
        }

        function distanceText(value) {
            var meters = Number(value || 0);
            if (!isFinite(meters) || meters <= 0) {
                return '';
            }
            return meters >= 1000 ? (meters / 1000).toFixed(1) + ' km' : Math.round(meters) + ' m';
        }

        function resourceLinks(object) {
            return (Array.isArray(object.resources) ? object.resources : []).filter(function (resource) {
                return common.text(resource.href, '') !== ''
                    && resource.kind !== 'website.document'
                    && (resource.content && resource.content.kind) !== 'website.document'
                    && !isDecomposedObject(object);
            }).map(function (resource) {
                return linkLine('Resource', resource.label, resource.href, object.id);
            });
        }

        function actionLinks(object) {
            if (websiteDocument(object)) {
                return [];
            }
            return (Array.isArray(object.actions) ? object.actions : []).filter(function (action) {
                return action.availability
                    && action.availability.state === 'enabled'
                    && (common.text(action.href, '') !== '' || (action.operationInvocation && typeof action.operationInvocation === 'object'));
            }).map(function (action) {
                if (action.operationInvocation && typeof action.operationInvocation === 'object') {
                    if (hasModelArguments(action.operationInvocation)) {
                        return operationForm(action, object);
                    }
                    return operationLine('Action', action.label, action.operationInvocation);
                }

                return linkLine('Action', action.label, action.href, object.id);
            });
        }

        function hasModelArguments(operationInvocation) {
            var args = operationInvocation.arguments;
            return !!args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length > 0;
        }

        function operationLine(label, text, operationInvocation) {
            var row = document.createElement('p');
            var strong = document.createElement('strong');
            var button = document.createElement('button');
            row.className = 'meta-line';
            strong.textContent = label;
            button.type = 'button';
            button.dataset.operationInvocation = JSON.stringify(operationInvocation);
            button.textContent = common.text(text, 'Action');
            row.appendChild(strong);
            row.appendChild(button);
            return row;
        }

        var UNSUPPORTED_ARGUMENT_TYPES = ['array', 'geo_point'];

        function operationForm(action, object) {
            var content = object.content && typeof object.content === 'object' ? object.content : {};
            var args = action.operationInvocation.arguments;
            var baseInvocation = Object.assign({}, action.operationInvocation);
            var form = document.createElement('form');
            var fields = document.createElement('div');
            var submit = document.createElement('button');
            var status = document.createElement('p');
            delete baseInvocation.arguments;

            form.className = 'operation-form';
            form.dataset.operationInvocationForm = 'true';
            form.dataset.operationBase = JSON.stringify(baseInvocation);

            fields.className = 'operation-form__fields';
            Object.keys(args).forEach(function (key) {
                var spec = args[key];
                if (!spec || UNSUPPORTED_ARGUMENT_TYPES.indexOf(spec.type) !== -1) {
                    return;
                }
                fields.appendChild(operationFormField(key, spec, content[key]));
            });

            submit.type = 'submit';
            submit.className = 'operation-form__submit';
            submit.textContent = common.text(action.label, 'Save');

            status.className = 'operation-form__status';
            status.dataset.operationFormStatus = 'true';

            form.appendChild(fields);
            form.appendChild(submit);
            form.appendChild(status);
            return form;
        }

        function operationFormField(key, spec, currentValue) {
            var wrapper = document.createElement('label');
            var labelText = document.createElement('span');
            var helpText = common.text(spec && spec.help, '');
            wrapper.className = 'operation-form__field';
            labelText.className = 'operation-form__label';
            // spec.label is the display copy the owning Service authored in its Contract
            // (resolved from a label_ref); humanizeKey is only the fallback for an unlabelled field.
            labelText.textContent = common.text(spec && spec.label, humanizeKey(key));
            wrapper.appendChild(labelText);
            if (helpText !== '') {
                var help = document.createElement('span');
                help.className = 'operation-form__help';
                help.textContent = helpText;
                wrapper.appendChild(help);
            }
            wrapper.appendChild(operationFormInput(key, spec, currentValue));
            return wrapper;
        }

        function operationFormInput(key, spec, currentValue) {
            var type = common.text(spec.type, 'string');
            var enumValues = Array.isArray(spec.enum) ? spec.enum : null;
            var hasDefault = Object.prototype.hasOwnProperty.call(spec, 'default');
            var value = (currentValue !== undefined && currentValue !== null) ? currentValue : (hasDefault ? spec.default : '');
            var input;

            if (enumValues && type === 'string') {
                var optionLabels = spec && spec.labels && typeof spec.labels === 'object' ? spec.labels : null;
                input = document.createElement('select');
                enumValues.forEach(function (option) {
                    var optionNode = document.createElement('option');
                    optionNode.value = option;
                    optionNode.textContent = common.text(optionLabels && optionLabels[option], humanizeKey(option));
                    optionNode.selected = String(value) === option;
                    input.appendChild(optionNode);
                });
            } else if (type === 'boolean') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = value === true;
            } else if (type === 'integer' || type === 'number') {
                input = document.createElement('input');
                input.type = 'number';
                if (type === 'integer') {
                    input.step = '1';
                }
                input.value = (value === '' || value === null || value === undefined) ? '' : String(value);
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = common.text(value, '');
            }

            input.name = key;
            if (spec.required === true) {
                input.required = true;
            }
            return input;
        }

        function linkLine(label, text, href, objectId) {
            var row = document.createElement('p');
            var strong = document.createElement('strong');
            var link = externalHref(href) ? document.createElement('button') : document.createElement('a');
            row.className = 'meta-line';
            strong.textContent = label;
            link.textContent = common.text(text, href);
            if (externalHref(href)) {
                link.type = 'button';
                link.dataset.runtimeUrl = href;
                link.dataset.runtimeUrlLabel = common.text(text, href);
                link.dataset.runtimeUrlParent = common.text(objectId, '');
                link.title = href;
            } else {
                link.href = href;
                link.rel = 'noopener noreferrer';
            }
            row.appendChild(strong);
            row.appendChild(link);
            return row;
        }

        function externalHref(href) {
            return /^https?:\/\//i.test(common.text(href, ''));
        }

        function domainFromUrl(value) {
            try {
                return value ? (new URL(value, window.location.origin)).hostname : '';
            } catch (error) {
                return '';
            }
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
