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
        var objectLabels = {};

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
            var content = scene.content && typeof scene.content === 'object' ? scene.content : {};
            // Object title-bar labels (back / close) -- keyed 'object' in world-content.json.
            objectLabels = content.object && typeof content.object === 'object' ? content.object : {};
            ensureWorkspacePanel(workspaceOptions);
            updateFloatingPanelChrome(workspacePanelEl, workspaceOptions);
            updateWorkspaceContent(scene.content || {}, workspaceOptions.findScope);
            if (workspaceToggleButton) {
                workspaceToggleButton.textContent = workspaceOptions.collapsed === true ? 'Show' : 'Hide';
            }
            renderWorkspace(nodes.workspace, scene.findings || {collections: [], objects: []}, workspaceOptions);
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

        /*
         * The Results pane: the Findings returned for the current Call (see dev.elonn
         * canonical/layout.md). Only Findings render here -- placed Objects are their own
         * panels. Hidden while collapsed or freshly cleared.
         */
        function renderWorkspace(node, findings, options) {
            var content = [];
            if (!node) {
                return;
            }
            if (options.closed === true || options.collapsed === true || options.emptyVisible === true) {
                common.replaceChildren(node, []);
                return;
            }

            content = collections((findings && findings.collections) || [], 'overlay')
                .concat(objectList((findings && findings.objects) || [], 'overlay'));
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
            var flow = document.createElement('div');
            section.className = 'world-collection world-collection--' + common.text(mode, 'panel') + ' world-sequence';
            section.dataset.collectionId = collection.id;
            section.dataset.selected = collection.selected ? 'true' : 'false';
            // Inside an opened Object panel the replies just flow -- no "Messages" heading, no
            // count line.
            if (mode !== 'object') {
                var header = document.createElement('header');
                var title = document.createElement('h3');
                title.textContent = collection.title;
                header.appendChild(title);
                if (collection.summary !== '' && mode !== 'compact') {
                    var summary = document.createElement('p');
                    summary.textContent = collection.summary;
                    header.appendChild(summary);
                }
                section.appendChild(header);
            }
            flow.className = 'world-sequence-flow';
            if (collection.objects.length === 0) {
                flow.appendChild(emptyCollectionNotice(collection));
            } else {
                // Each member renders as its own row, in Dataset order (parity with xreal
                // CreateSequenceRow). The runtime does not cluster by sender -- that read a
                // Service-specific content key and was not a canonical property of the sequence.
                collection.objects.forEach(function (object) {
                    flow.appendChild(sequenceEntryNode(object, mode));
                });
            }
            section.appendChild(flow);
            return section;
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

        // An "open me" action (a Dashboard's self-open, or a list card's open conversation) is
        // meaningless once the Object is the opened panel's own root -- never draw it as a
        // button inside the panel it would open.
        function opensThisObject(action, object) {
            if (!action || (action.type !== 'open' && action.type !== 'open_object')) {
                return false;
            }
            var invocation = action.operationInvocation && typeof action.operationInvocation === 'object' ? action.operationInvocation : null;
            return !!invocation && String(invocation.object_id || '') === String(object.id || '');
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

        function cardLink(label, text, href) {
            if (externalHref(href)) {
                var ref = externalRef(href, text);
                ref.textContent = label + ': ' + (common.text(text, '') !== '' ? text : domainFromUrl(href));
                return ref;
            }
            var link = document.createElement('a');
            link.className = 'world-object-link';
            link.href = href;
            link.rel = 'noopener noreferrer';
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

        /*
         * One floating panel per panel in state.carryPanels -- an Object World opened on Carry,
         * or one the member pulled out client-side from a Finding. Both use the same
         * floatingPanel() the Results pane uses (drag / resize / collapse / z-order via the
         * generic [data-carry-panel-*] handlers). An opened Object's body leads with its
         * Collections (replies flow first) and puts working actions at the bottom, with a back
         * step in the title bar once it has been navigated into; a pulled-out Finding gets a
         * plain summary + preview.
         */
        function carryPanelNodes(panels) {
            return panels.map(function (panel) {
                var opened = panel.opened === true;
                // Title bar controls (layout.md, Object presentation): back -- only with a
                // navigation history -- then collapse, then close (close is floatingPanel's own).
                var headerActions = [];
                if (opened && Number(panel.depth || 0) > 0) {
                    headerActions.push(objectBackButton(panel.object.id));
                }
                headerActions.push(collapseButton(panel.id, panel.collapsed === true));
                return floatingPanel({
                    id: panel.id,
                    objectId: panel.object.id,
                    className: opened ? 'carry-object-panel--opened' : '',
                    title: common.text(panel.title, panel.object.title),
                    closable: true,
                    collapsed: panel.collapsed,
                    x: panel.x,
                    y: panel.y,
                    width: panel.width,
                    height: panel.height,
                    z: panel.z,
                    headerActions: headerActions,
                    closeLabel: opened && common.text(objectLabels.close_label, '') !== ''
                        ? objectLabels.close_label
                        : 'Close ' + panel.object.title,
                    buildContent: function (content) {
                        if (opened) {
                            content.dataset.originObject = panel.object.id;
                            openedObjectBody(panel).forEach(function (node) {
                                content.appendChild(node);
                            });
                            return;
                        }
                        carryFindingBody(panel.object).forEach(function (node) {
                            content.appendChild(node);
                        });
                    }
                });
            });
        }

        function statusNode(row) {
            return metaLine(row.label, row.value);
        }

        function objectBackButton(objectId) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'carry-object-panel__close world-object__back';
            button.dataset.worldBack = objectId;
            if (common.text(objectLabels.back_label, '') !== '') {
                button.setAttribute('aria-label', objectLabels.back_label);
            }
            button.textContent = '‹';
            return button;
        }

        function collapseButton(panelId, collapsed) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'carry-object-panel__close world-object__collapse';
            button.dataset.carryPanelCollapse = panelId;
            button.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
            button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            button.textContent = collapsed ? '▸' : '▾';
            return button;
        }

        /*
         * An opened Object's body: the content shown inside its container and one place to act
         * on it, nothing else -- no field dump, no counts, no chrome. Collections flow first
         * (a conversation's replies, oldest to newest), working controls (a reply form) at the
         * bottom, the way a conversation reads everywhere else.
         */
        function openedObjectBody(panel) {
            // The Object's own Collections flow first (a conversation's replies, a browse's
            // grouped lists). Its member Objects appear as cards inside those Collections --
            // their actions are not dumped in the footer (a browse list would fill with every
            // row's reply/mute/leave). The exception: a container World marks as navigated
            // INTO one member Object (a conversation opened from a list) -- panel.subject --
            // shows that Object's messages Collection inside it, so its own actions (its reply
            // form) belong here too. The runtime reads panel.subject; it does not match ids.
            // An interpreted web document (Find's find.open result) renders as the document:
            // its structured content tree, with in-document links navigating in place. When a
            // document member is present it IS the body; a standalone video member renders
            // only when no document claims it.
            var members = Array.isArray(panel.memberObjects) ? panel.memberObjects : [];
            var documentMembers = members.filter(isInterpretedDocument);
            if (documentMembers.length > 0) {
                return documentMembers.map(documentNode);
            }
            var mediaMembers = members.filter(function (member) {
                var type = String(member.type || '');
                return type === 'video' || type === 'audio';
            });
            var mediaNodes = mediaMembers.map(mediaObjectNode);

            var contentNodes = collections(panel.collections || [], 'object');
            var actionNodes = actionLinks(panel.object);
            var subject = String(panel.subject || '');
            if (subject !== '') {
                members.forEach(function (member) {
                    if (String(member.id || '') === subject) {
                        actionLinks(member).forEach(function (node) {
                            actionNodes.push(node);
                        });
                    }
                });
            }
            return mediaNodes.concat(contentNodes, actionNodes);
        }

        /*
         * An interpreted web document -- a `document` Object (Find's HTML interpreter; see
         * dev.elonn canonical/html.md). Dispatch on the declared type only; the runtime does
         * not probe content shape to decide what an Object is. documentNode tolerates a
         * missing content tree.
         */
        function isInterpretedDocument(object) {
            return !!object && String(object.type || '') === 'document';
        }

        function documentNode(object) {
            var content = object.content && typeof object.content === 'object' ? object.content : {};
            var article = document.createElement('article');
            article.className = 'web-document';
            contentTreeNodes(Array.isArray(content.content) ? content.content : []).forEach(function (node) {
                article.appendChild(node);
            });
            var source = common.text(content.source, '');
            if (source !== '') {
                article.appendChild(documentSourceLink(source));
            }
            return article;
        }

        /*
         * The document's own source URL -- provenance shown under the interpreted content.
         * An external URL is inert (a runtime never navigates out of the app and never
         * fabricates an Object from a URL string); a same-origin path stays a real link.
         */
        function documentSourceLink(source) {
            if (externalHref(source)) {
                var ref = externalRef(source, source);
                ref.className = 'web-document__source world-object-link--external';
                return ref;
            }
            var link = document.createElement('a');
            link.className = 'web-document__source';
            link.href = source;
            link.rel = 'noopener noreferrer';
            link.appendChild(document.createTextNode(source));
            return link;
        }

        function contentTreeNodes(treeNodes) {
            var out = [];
            (Array.isArray(treeNodes) ? treeNodes : []).forEach(function (node) {
                if (!node || typeof node !== 'object') {
                    return;
                }
                var kind = String(node.node || '');
                if (kind === 'heading') {
                    var level = Math.min(6, Math.max(1, Number(node.level || 2) + 2));
                    var heading = document.createElement('h' + level);
                    heading.className = 'web-document__heading';
                    heading.appendChild(document.createTextNode(common.text(node.text, '')));
                    out.push(heading);
                } else if (kind === 'paragraph') {
                    out.push(documentParagraph(node));
                } else if (kind === 'section') {
                    var section = document.createElement('section');
                    section.className = 'web-document__section';
                    contentTreeNodes(Array.isArray(node.content) ? node.content : []).forEach(function (child) {
                        section.appendChild(child);
                    });
                    out.push(section);
                } else if (kind === 'media') {
                    var media = documentMedia(node);
                    if (media) {
                        out.push(media);
                    }
                }
            });
            return out;
        }

        function documentParagraph(node) {
            var paragraph = document.createElement('p');
            paragraph.className = 'web-document__p';
            var text = common.text(node.text, '');
            var links = Array.isArray(node.links) ? node.links : [];
            if (links.length === 0) {
                paragraph.appendChild(document.createTextNode(text));
                return paragraph;
            }
            // Splice each link's own text back into the paragraph as an anchor; plain text
            // between. A plain click navigates the document in place (data-operation-invocation
            // + the panel's data-origin-object); the href keeps open-in-new-tab honest.
            var remaining = text;
            links.forEach(function (link) {
                var label = common.text(link.text, '');
                var at = label !== '' ? remaining.indexOf(label) : -1;
                if (at === -1) {
                    return;
                }
                var anchor = documentAnchor(link, label);
                if (!anchor) {
                    return;
                }
                if (at > 0) {
                    paragraph.appendChild(document.createTextNode(remaining.slice(0, at)));
                }
                paragraph.appendChild(anchor);
                remaining = remaining.slice(at + label.length);
            });
            if (remaining !== '') {
                paragraph.appendChild(document.createTextNode(remaining));
            }
            return paragraph;
        }

        /*
         * An in-document link. The invocation that follows it is authored by the Service in the
         * link descriptor (link.invocation) -- the runtime copies it, it never names a Service.
         * The panel's data-origin-object makes World navigate the document in place.
         */
        function documentAnchor(link, label) {
            var href = common.text(link.href, '');
            var invocation = link.invocation && typeof link.invocation === 'object' ? link.invocation : null;
            if (href === '' || !invocation) {
                return null;
            }
            var anchor = document.createElement('a');
            anchor.className = 'web-document__link';
            anchor.href = href;
            anchor.dataset.operationInvocation = JSON.stringify(invocation);
            anchor.appendChild(document.createTextNode(label));
            return anchor;
        }

        function documentMedia(node) {
            var kind = String(node.kind || '');
            if (kind === 'image') {
                var src = common.text(node.src, '');
                if (src === '') {
                    return null;
                }
                var image = document.createElement('img');
                image.className = 'web-document__image';
                image.src = src;
                image.alt = common.text(node.alt, '');
                image.loading = 'lazy';
                return image;
            }
            if (kind === 'video' || kind === 'audio' || kind === 'embed') {
                var source = common.text(node.source, '');
                if (source === '') {
                    return null;
                }
                if (String(node.playback || '') === 'native') {
                    var element = document.createElement(kind === 'audio' ? 'audio' : 'video');
                    element.className = 'web-video__native';
                    element.src = source;
                    element.controls = true;
                    element.preload = 'none';
                    return element;
                }
                return embedFrame(source, node.aspect);
            }
            return null;
        }

        /*
         * A promoted media Object (a `video` or `audio` from the interpreted document). An
         * external provider (YouTube) renders as its embed; native playback renders as a
         * real <video>/<audio> element from the source; anything else falls back to opening
         * the source URL as a runtime Object.
         */
        function mediaObjectNode(object) {
            var content = object.content && typeof object.content === 'object' ? object.content : {};
            var frame = document.createElement('div');
            frame.className = 'web-video';
            var title = common.text(content.title, common.text(object.title, ''));
            if (title !== '') {
                var heading = document.createElement('h4');
                heading.className = 'web-video__title';
                heading.appendChild(document.createTextNode(title));
                frame.appendChild(heading);
            }
            var embedSource = videoEmbedSource(content);
            var source = common.text(content.source, '');
            if (embedSource !== '') {
                frame.appendChild(embedFrame(embedSource, content.aspect));
            } else if (String(content.playback || '') === 'native' && source !== '') {
                var kind = String(object.type || '') === 'audio' ? 'audio' : 'video';
                var element = document.createElement(kind);
                element.className = 'web-video__native';
                element.src = source;
                element.controls = true;
                element.preload = 'none';
                frame.appendChild(element);
            } else if (source !== '') {
                frame.appendChild(documentSourceLink(source));
            }
            return frame;
        }

        function videoEmbedSource(content) {
            if (String(content.provider || '') === 'YouTube' && common.text(content.provider_id, '') !== '') {
                return 'https://www.youtube.com/embed/' + encodeURIComponent(content.provider_id);
            }
            var source = common.text(content.source, '');
            if (source.indexOf('youtube.com/embed/') !== -1 || source.indexOf('youtube-nocookie.com/embed/') !== -1) {
                return source;
            }
            return '';
        }

        function embedFrame(source, aspect) {
            var wrap = document.createElement('div');
            wrap.className = 'web-document__embed';
            wrap.style.aspectRatio = (typeof aspect === 'string' && aspect.indexOf(':') !== -1)
                ? aspect.replace(':', ' / ')
                : '16 / 9';
            var frame = document.createElement('iframe');
            frame.src = source;
            frame.loading = 'lazy';
            frame.setAttribute('allowfullscreen', '');
            frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            wrap.appendChild(frame);
            return wrap;
        }

        /*
         * The body of a Finding pulled onto Carry (a result with no open operation). Its
         * content and one place to act on it -- no field dump, no counts, no Visibility /
         * Permissions rows -- the same rule an opened Object body follows (see layout.md,
         * Object presentation). A hosted Object keeps its editor surface.
         */
        function carryFindingBody(object) {
            if (object.surface && object.surface.mode === 'hosted') {
                return [hostedSurface(object)];
            }
            var nodes = [];
            if (common.text(object.summary, '') !== '') {
                var summary = document.createElement('p');
                summary.className = 'object-summary';
                summary.textContent = object.summary;
                nodes.push(summary);
            }
            containedObjectNodes(object).forEach(function (node) { nodes.push(node); });
            resourceLinks(object).forEach(function (link) { nodes.push(link); });
            actionLinks(object).forEach(function (link) { nodes.push(link); });
            return nodes;
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

        function humanizeKey(key) {
            return String(key || '').split('_').filter(Boolean).map(function (word) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            }).join(' ');
        }

        function resourceLinks(object) {
            return (Array.isArray(object.resources) ? object.resources : []).filter(function (resource) {
                return common.text(resource.href, '') !== '';
            }).map(function (resource) {
                return linkLine('Resource', resource.label, resource.href, object.id);
            });
        }

        function actionNode(action, object) {
            if (action.operationInvocation && typeof action.operationInvocation === 'object') {
                if (hasModelArguments(action.operationInvocation)) {
                    return operationForm(action, object);
                }
                return operationLine('Action', action.label, action.operationInvocation);
            }
            return linkLine('Action', action.label, action.href, object.id);
        }

        function actionButton(action) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'dashboard-action';
            button.dataset.operationInvocation = JSON.stringify(action.operationInvocation);
            // action.label is already resolved (scene-model applies the fallback); no literal here.
            button.textContent = action.label;
            return button;
        }

        function actionLinks(object) {
            var candidates = (Array.isArray(object.actions) ? object.actions : []).filter(function (action) {
                return !opensThisObject(action, object);
            });
            var enabled = candidates.filter(function (action) {
                return action.availability
                    && action.availability.state === 'enabled'
                    && (common.text(action.href, '') !== '' || (action.operationInvocation && typeof action.operationInvocation === 'object'));
            });
            // A non-enabled action is World's call (Composer::withNormalisedAvailability), not
            // the runtime's to re-derive or silently drop: render it disabled, with World's reason.
            var blocked = candidates.filter(function (action) {
                return !action.availability || action.availability.state !== 'enabled';
            });

            var nodes = enabledActionNodes(enabled, object);
            blocked.forEach(function (action) {
                nodes.push(disabledActionNode(action));
            });
            return nodes;
        }

        function disabledActionNode(action) {
            var row = document.createElement('p');
            row.className = 'meta-line meta-line--blocked';
            var strong = document.createElement('strong');
            strong.textContent = action.label;
            row.appendChild(strong);
            var reason = common.text(action.availability && action.availability.reason, '');
            if (reason !== '') {
                var detail = document.createElement('span');
                detail.textContent = reason;
                row.appendChild(detail);
            }
            return row;
        }

        function enabledActionNodes(actions, object) {
            var grouped = actions.some(function (action) {
                return common.text(action.group, '') !== '';
            });
            if (!grouped) {
                return actions.map(function (action) {
                    return actionNode(action, object);
                });
            }

            // Lay grouped Dashboard actions out as one row per group, in the order the groups
            // first appear in the Dataset -- that order is the Service's own (its Contract
            // entrypoints, carried through Conductor). The runtime imposes no group vocabulary
            // or sequence of its own. A row's actions become compact one-tap buttons when they
            // need no input; one that still needs a value keeps its full form.
            var buckets = {};
            var order = [];
            actions.forEach(function (action) {
                var key = common.text(action.group, '') || 'other';
                if (!buckets[key]) {
                    buckets[key] = [];
                    order.push(key);
                }
                buckets[key].push(action);
            });
            var nodes = [];
            order.forEach(function (key) {
                var bucket = buckets[key];
                if (!bucket || bucket.length === 0) {
                    return;
                }
                var row = document.createElement('div');
                row.className = 'dashboard-action-row';
                row.dataset.actionGroup = key;
                bucket.forEach(function (action) {
                    var canOneTap = action.operationInvocation
                        && typeof action.operationInvocation === 'object'
                        && !hasModelArguments(action.operationInvocation);
                    row.appendChild(canOneTap ? actionButton(action) : actionNode(action, object));
                });
                nodes.push(row);
            });
            return nodes;
        }

        function hasModelArguments(operationInvocation) {
            var args = operationInvocation.arguments;
            return !!args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length > 0;
        }

        function operationLine(label, text, operationInvocation) {
            var row = document.createElement('p');
            var button = document.createElement('button');
            row.className = 'meta-line';
            button.type = 'button';
            button.dataset.operationInvocation = JSON.stringify(operationInvocation);
            button.textContent = common.text(text, common.text(label, ''));
            // A generic "Action" caption is noise -- the button's own label already says what
            // it does. Only prepend a caption when the caller gave a real one.
            if (common.text(label, '') !== '' && label !== 'Action') {
                var strong = document.createElement('strong');
                strong.textContent = label;
                row.appendChild(strong);
            }
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
            } else if (type === 'password') {
                // A secret field (e.g. the auth-form password): masked, never prefilled, and
                // hinted for the right password manager behaviour by field name.
                input = document.createElement('input');
                input.type = 'password';
                input.autocomplete = key === 'password' ? 'current-password' : 'new-password';
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
            var link;
            row.className = 'meta-line';
            strong.textContent = label;
            if (externalHref(href)) {
                link = externalRef(href, common.text(text, href));
            } else {
                link = document.createElement('a');
                link.textContent = common.text(text, href);
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

        // A bare external URL with no Service-authored operation to follow it. A runtime
        // never navigates the member outside the app (dev.elonn canonical/layout.md) and
        // never fabricates an Object from a URL string (canonical/dataset.md), so it shows
        // the reference inert -- the domain, with the full URL on hover.
        function externalRef(href, text) {
            var span = document.createElement('span');
            span.className = 'world-object-link world-object-link--external';
            span.title = href;
            var shown = common.text(text, '');
            span.textContent = shown !== '' ? shown : domainFromUrl(href);
            return span;
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

        return {
            status: status,
            render: render
        };
    };
}());
