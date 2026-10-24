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
            space: root.querySelector('[data-layer-zone="space:space"]'),
            carryPanels: root.querySelector('[data-runtime-carry-panels]'),
            workspaceMount: root.querySelector('[data-workspace-panel-mount]'),
            statusRows: root.querySelector('[data-runtime-session]')
        };
        var workspacePanelEl = null;
        var workspaceToggleButton = null;
        var objectLabels = {};
        // The flat, Dataset-level Resource map (scene.resourcesById) a content.body media
        // node's `resource_or_object_ref` resolves against directly -- never only the
        // focused Object's own narrower `resources[]` ref list (dev.elonn canonical/
        // object.md, Content body; the same resolution Unity/AndroidXR already do).
        var resourcesById = {};

        function status(message, state) {
            if (!nodes.status) {
                return;
            }
            nodes.status.textContent = message;
            nodes.status.dataset.state = common.text(state, 'neutral');
        }

        function render(scene, options) {
            resourcesById = scene.resourcesById && typeof scene.resourcesById === 'object' ? scene.resourcesById : {};
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
            renderSpace(nodes.space, zoneMap['space:space']);
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
         * panels. Hidden while collapsed or freshly cleared. Rendered in the exact order
         * scene.findings lists them -- oldest first, newest last (2026-10-14: Entry moved to
         * the bottom, so a fresh result belongs at the end, next to it), collections and
         * objects interleaved as World ordered them -- never bucketed into a collections-block
         * then an objects-block,
         * which would silently bury a fresh result under older ones of a different kind.
         */
        function renderWorkspace(node, findings, options) {
            if (!node) {
                return;
            }
            if (options.closed === true || options.collapsed === true || options.emptyVisible === true) {
                common.replaceChildren(node, []);
                return;
            }

            var content = (Array.isArray(findings) ? findings : []).map(function (finding) {
                return finding.kind === 'collection' ? collectionNodeFor(finding.collection, 'overlay') : objectButton(finding.object, 'overlay');
            });
            common.replaceChildren(node, content);
        }

        function collectionNodeFor(collection, mode) {
            if (collection.type === 'sequence') {
                return sequenceNode(collection, mode);
            }
            if (collection.type === 'roster') {
                return rosterNode(collection, mode);
            }
            return collectionNode(collection, mode);
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
                    // Entry sits at the bottom, chat-input style (decision 2026-10-14):
                    // results flow first, Entry last, so new results land next to where the
                    // member is looking right after they typed, not up top out of view.
                    content.appendChild(resultsNode);
                    content.appendChild(queryFormNode(options.content || {}));
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

        function renderSpace(node, zone) {
            if (!node) {
                return;
            }
            if (!zone) {
                common.replaceChildren(node, []);
                return;
            }
            // A Space Placement names exactly one Object, never a Collection
            // (dev.elonn canonical/placement.md, Placement identity) -- zone.objects is the
            // whole list.
            common.replaceChildren(node, (zone.objects || []).map(spaceMarker));
        }

        function collections(items, mode) {
            return items.map(function (collection) {
                return collectionNodeFor(collection, mode);
            });
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

        // The first paragraph/heading text in a content.body node array (object.md, Content
        // body), document order -- a conversation message's own text, e.g. Also accepts a
        // bare string directly (never produced by a canonical Service, but a cheap safety net
        // against anything that still emits the pre-canonical flat-string shape). A media-only
        // body (Find's web_result thumbnail node, an oEmbed video's poster image) has no text
        // node at all and correctly returns ''.
        function firstBodyText(body) {
            if (typeof body === 'string') {
                return body;
            }
            var node = firstMatchingBodyNode(Array.isArray(body) ? body : [], function (candidate) {
                var kind = String(candidate.node || '');
                return (kind === 'paragraph' || kind === 'heading') && common.text(candidate.text, '') !== '';
            });
            return node ? common.text(node.text, '') : '';
        }

        /*
         * The one shared rule for what a compact Object card (grid, sequence row, roster row
         * alike) shows as its condensed text, so the three never drift into independent
         * partial reimplementations of the same canonical presentation contract again (the
         * exact gap that let sequenceEntryNode()'s own ad hoc content.body handling regress
         * unnoticed). object.summary is the canonical condensed account (object.md, Canonical
         * text fields) and wins whenever a Service actually populated it; a Service that
         * deliberately leaves summary blank because content.body already IS the Object's only
         * real content (e.g. a conversation message, whose own documented reasoning is that no
         * condensed account distinct from its body exists) has no fabricated fallback invented
         * here, only the body's own first real text, the same
         * text a full body render would show first. Neither exists -> blank, same as today.
         */
        function compactBodyText(object) {
            var summary = common.text(object && object.summary, '');
            if (summary !== '') {
                return summary;
            }
            var content = object && object.content && typeof object.content === 'object' ? object.content : {};
            return firstBodyText(content.body);
        }

        function sequenceEntryNode(object, mode) {
            var content = object.content && typeof object.content === 'object' ? object.content : {};
            var entry = document.createElement('button');
            var main = document.createElement('span');
            var body = document.createElement('span');
            var time = document.createElement('span');
            // content.body is the canonical content-node array (object.md, Content body), not
            // a flat string -- coercing it directly (the old common.text(content.body, ...)
            // read) stringified the array itself ("[object Object]") the moment any producer
            // other than a flat string populated it, which is every producer now. Whether this
            // entry carries its own body TEXT (a conversation message's real text) is judged
            // from content.body alone, independently of compactBodyText()'s summary-first
            // text below -- a Find result with a real summary but a media-only body (no text
            // node at all) must still show its title normally, the same as before.
            var hasOwnBody = firstBodyText(content.body) !== '';
            entry.type = 'button';
            entry.className = 'world-sequence-entry';
            entry.dataset.objectId = object.id;
            entry.dataset.objectType = object.type;
            entry.setAttribute('aria-pressed', object.selected ? 'true' : 'false');
            main.className = 'world-sequence-entry__main';
            // An entry with no own content.body text (a generic result-object sequence, e.g.
            // Find's web results, falling back to object.summary below) shows its title first
            // -- a conversation message (its own body text present) already carries everything
            // in its own body, so no separate title line is added for it.
            if (!hasOwnBody && common.text(object.title, '') !== '') {
                var title = document.createElement('strong');
                title.className = 'world-sequence-entry__title';
                title.textContent = object.title;
                main.appendChild(title);
            }
            body.className = 'world-sequence-entry__body';
            body.textContent = compactBodyText(object);
            main.appendChild(body);
            var preview = sequenceEntryLinkPreview(object, content);
            if (preview) {
                main.appendChild(preview);
            }
            sequenceEntryChips(object).forEach(function (chip) {
                main.appendChild(chip);
            });
            cardLinks(object).forEach(function (link) {
                main.appendChild(link);
            });
            entry.appendChild(main);
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

        /*
         * A visual marker for each of this sequence entry's own Actions (e.g. a
         * pasted link's Open action) -- the row itself already dispatches the
         * matching Action when clicked (the generic [data-object-id] handler,
         * via World's hoisted dataset.actions), this only makes that
         * discoverable. Label text is the Action's own canonical label
         * (World/Messages content, per dev.elonn canonical/action.md) --
         * never authored here.
         */
        function sequenceEntryChips(object) {
            return (Array.isArray(object.actions) ? object.actions : [])
                .filter(function (action) {
                    return common.text(action.label, '') !== '';
                })
                .map(function (action) {
                    var chip = document.createElement('span');
                    chip.className = 'world-sequence-entry__chip';
                    chip.textContent = common.text(action.label, '');
                    return chip;
                });
        }

        /*
         * A pasted link's own preview card (thumbnail + title), shown inline in a
         * message/reply row before the member taps it -- content.link_preview_title and the
         * preview image's own media node in content.body are set upstream, server-side, when
         * the owning Service resolves the link eagerly (once, ahead of the member ever
         * opening it). Reuses imagePreview()'s own image-Resource lookup -- the exact same
         * "no special trust for an externally-sourced image" treatment objectButton()
         * already gives one. Absent for a message with no link, or one not yet (or never)
         * resolved -- degrades to nothing, never a broken/empty card.
         */
        function sequenceEntryLinkPreview(object, content) {
            var title = common.text(content.link_preview_title, '');
            var image = imagePreview(object);
            if (title === '' && !image) {
                return null;
            }
            var card = document.createElement('span');
            card.className = 'world-sequence-entry__preview';
            if (image) {
                image.className = 'world-sequence-entry__preview-image';
                card.appendChild(image);
            }
            if (title !== '') {
                var titleEl = document.createElement('strong');
                titleEl.className = 'world-sequence-entry__preview-title';
                titleEl.textContent = title;
                card.appendChild(titleEl);
            }
            return card;
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
            // Same shared preview/text contract objectButton() and sequenceEntryNode() use --
            // a roster member (a community member, an event guest) is exactly as entitled to
            // its own avatar/preview image and compactBodyText() fallback as any other compact
            // card; leaving this renderer with neither, as it did before, was the same kind of
            // drift that let sequenceEntryNode()'s own divergent content.body handling regress
            // unnoticed.
            var preview = object.format === 'drawing_surface' ? drawingSurfacePreviewImage(object) : imagePreview(object);
            entry.type = 'button';
            entry.className = 'world-roster-entry';
            entry.dataset.objectId = object.id;
            entry.dataset.objectType = object.type;
            entry.setAttribute('aria-pressed', object.selected ? 'true' : 'false');
            if (preview && mode !== 'compact') {
                entry.appendChild(preview);
            }
            name.className = 'world-roster-entry__name';
            name.textContent = object.title;
            entry.appendChild(name);
            var metaText = compactBodyText(object);
            if (metaText !== '' && mode !== 'compact') {
                meta.className = 'world-roster-entry__meta';
                meta.textContent = metaText;
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
            var preview = object.format === 'drawing_surface' ? drawingSurfacePreviewImage(object) : imagePreview(object);
            wrapper.className = 'world-object-entry';
            button.type = 'button';
            button.className = 'world-object world-object--' + common.text(mode, 'panel');
            button.dataset.objectId = object.id;
            button.dataset.objectType = object.type;
            button.setAttribute('aria-pressed', object.selected ? 'true' : 'false');
            // compactBodyText(): object.summary when a Service populated it, else the first
            // real text in content.body (a Service that leaves summary deliberately blank
            // because content.body already is the Object's only real content, e.g. a
            // message). The same shared rule sequenceEntryNode()/rosterEntryNode() use, so a
            // blank-summary Object looks right in every compact context, not only the one that
            // happened to need it first.
            var summaryText = compactBodyText(object);
            type.className = 'object-type';
            type.textContent = object.type;
            title.textContent = object.title;
            summary.className = 'object-summary';
            summary.textContent = summaryText;
            if (mode !== 'compact') {
                button.appendChild(type);
            }
            if (preview && mode !== 'compact') {
                button.appendChild(preview);
            }
            button.appendChild(title);
            if (summaryText !== '' && mode !== 'compact') {
                button.appendChild(summary);
            }
            if (mode !== 'compact') {
                cardLinks(object).forEach(function (link) {
                    button.appendChild(link);
                });
            }
            if (object.availability.state !== 'enabled') {
                button.appendChild(badge(object.availability.state));
            }
            wrapper.appendChild(button);
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

        // A Resource may carry a source URI (dev.elonn canonical/resource.md); an Action never
        // does (there is no URL on an Action -- canonical/action.md), so only Resources are
        // a candidate here. Shown as the reference's own label (or its domain when it has
        // none) -- never prefixed ("Source: ..."); the reference reads on its own.
        function cardLinks(object) {
            var links = [];
            firstHref(object.resources, links, object.id);
            return links;
        }

        function firstHref(items, output, objectId) {
            (Array.isArray(items) ? items : []).some(function (item) {
                var href = common.text(item && item.source, '');
                if (href === '') {
                    return false;
                }
                output.push(cardLink(common.text(item.label, href), href, objectId));
                return true;
            });
        }

        function cardLink(text, href) {
            if (externalHref(href)) {
                return externalRef(href, text);
            }
            var link = document.createElement('a');
            link.className = 'world-object-link';
            link.href = href;
            link.rel = 'noopener noreferrer';
            link.textContent = text;
            return link;
        }

        /*
         * A compact Object card's preview image (dev.elonn canonical/object.md, Content
         * body; decision.thumbnail_is_a_media_node_not_a_canonical_field_20261024): the
         * Resource the first eligible image media node in content.body names, in document
         * order. Never a Service-specific field (content.thumbnail/content.thumbnail_url),
         * and never inferred by scanning the Object's Resources for one that merely looks
         * like an image -- a `drawing_surface` Object's own preview_resource mechanism is a
         * separate, already-canonical "Recognized content format" (resource.md, Preview
         * presentation) this function does not touch; see drawingSurfacePreviewImage().
         * No eligible media node -> no preview, same as before.
         */
        function imagePreview(object) {
            var resource = firstEligibleImageMediaResource(object);
            if (!resource) {
                return null;
            }
            var content = resource.content && typeof resource.content === 'object' ? resource.content : {};
            var dataUrl = String(content.data_url || '');
            var externalUrl = common.text(resource.source, '');
            var src = dataUrl.indexOf('data:image/') === 0 ? dataUrl : externalUrl;
            if (src === '') {
                return null;
            }
            var image = document.createElement('img');
            image.className = 'object-preview';
            image.src = src;
            image.alt = common.text(content.label, common.text(resource.label, ''));
            image.loading = 'lazy';
            return image;
        }

        function firstEligibleImageMediaResource(object) {
            var content = object && object.content && typeof object.content === 'object' ? object.content : {};
            var body = Array.isArray(content.body) ? content.body : [];
            var node = firstImageMediaNode(body);
            if (!node) {
                return null;
            }
            return resourcesById[String(node.resource_or_object_ref || '')] || null;
        }

        function firstImageMediaNode(nodes) {
            return firstMatchingBodyNode(nodes, function (node) {
                return String(node.node || '') === 'media' && String(node.kind || '') === 'image';
            });
        }

        /*
         * The one traversal every "find the first X in content.body" need shares -- depth-
         * first, document order, recursing through group/section/list exactly as
         * contentTreeNodes() does for a full body render. A compact card never hand-rolls its
         * own partial walk of the content-node vocabulary (object.md, Content body); it asks
         * this for the first node matching what it needs (an image media node, a text node,
         * anything else later) so every such need stays consistent with what a full body
         * render would show first, and with each other -- the exact drift that let
         * firstImageMediaNode() support `list` while an earlier, independent text-only walker
         * here did not.
         */
        function firstMatchingBodyNode(nodes, predicate) {
            var found = null;
            (Array.isArray(nodes) ? nodes : []).some(function (node) {
                if (!node || typeof node !== 'object') {
                    return false;
                }
                if (predicate(node)) {
                    found = node;
                    return true;
                }
                var kind = String(node.node || '');
                if (kind === 'group' || kind === 'section') {
                    found = firstMatchingBodyNode(Array.isArray(node.content) ? node.content : [], predicate);
                    return found !== null;
                }
                if (kind === 'list') {
                    var items = Array.isArray(node.items) ? node.items : [];
                    return items.some(function (item) {
                        found = firstMatchingBodyNode(item && typeof item === 'object' && Array.isArray(item.content) ? item.content : [], predicate);
                        return found !== null;
                    });
                }
                return false;
            });
            return found;
        }

        // A `drawing_surface` Object's own preview_resource image (resource.md, Preview
        // presentation; object.md, Recognized content format: drawing_surface) -- the exact
        // same lookup hostedSurface() uses for the opened/carried panel, reused here so the
        // compact grid card (objectButton()) shows the identical preview rather than falling
        // through to content.body, which a drawing_surface Object never populates.
        function drawingSurfacePreviewImage(object) {
            var previewResource = drawingResource(object, 'drawing.preview');
            var dataUrl = previewResource && previewResource.content ? String(previewResource.content.data_url || '') : '';
            if (dataUrl === '') {
                return null;
            }
            var image = document.createElement('img');
            image.className = 'object-preview';
            image.src = dataUrl;
            image.alt = common.text(object.title, '');
            image.loading = 'lazy';
            return image;
        }

        function spaceMarker(object, index) {
            var marker = document.createElement('button');
            var target = document.createElement('span');
            var dot = document.createElement('span');
            var label = document.createElement('span');
            var type = document.createElement('span');
            var title = document.createElement('strong');
            var position = fieldPosition(index);
            marker.type = 'button';
            marker.className = 'space-marker';
            marker.dataset.objectId = object.id;
            marker.style.left = position.left + '%';
            marker.style.top = position.top + '%';
            target.className = 'space-marker__target';
            dot.className = 'space-marker__dot';
            label.className = 'space-marker__label';
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
            // An Object whose content.format is drawing_surface (dev.elonn canonical/object.md,
            // Recognized content format: drawing_surface) keeps its current marks preview plus
            // its own Actions -- same rule carryFindingBody already follows for a
            // pulled-but-not-opened Finding. Service-neutral: this renders identically for any
            // Service's drawing surface, not just Paint's.
            if (panel.object.format === 'drawing_surface') {
                return [hostedSurface(panel.object)].concat(actionLinks(panel.object));
            }
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
                // Which region is focused is World's own state (context.objects[id].region --
                // dev.elonn canonical/context.md, Recognized detail: region focus), carried here
                // as panel.region. The runtime reads it; it does not track a region focus itself.
                var focusedRegion = String(panel.region || '');
                return documentMembers.map(function (member) {
                    return documentNode(member, focusedRegion);
                });
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
            // Whether this Object has real content to show is its own question, answered
            // from media/Collections alone -- never from whether it also has an Action.
            // An Action (e.g. Maps' 'Save to field') is a control, not content: folding
            // actionNodes into this check (as a single bodyNodes list once did) meant any
            // actionable Object with nothing else to show rendered as a bare button, its
            // own summary silently dropped. A plain payload Object with no document, no
            // member Collections, no member Objects -- action or not -- has no other body
            // content to show; its own content.body (any Object, any Service -- dev.elonn
            // canonical/object.md, Content body) or else its summary IS the content in that
            // case, not indexing metadata to suppress. Summary (when shown) precedes Actions,
            // same ordering carryFindingBody already uses and the 'controls at the bottom'
            // convention this file follows throughout (e.g. an Action rendered as a form by
            // actionLinks()/operationForm() -- a reply is an ordinary such Action, not a
            // special case; dev.elonn canonical/object.md, the generic Finding-and-reply model).
            //
            // summary and body are NOT a strict either/or (object.md, Content body: the
            // canonical text fields "remain separate, top-level, and unaffected by body").
            // decision.summary_is_descriptive_not_a_content_excerpt_20261024: summary is an
            // optional descriptive field, never a derived content excerpt -- a legitimate
            // summary and a real body may coexist, and a Runtime never suppresses either based
            // solely on the presence of the other. summary renders first when present, then
            // the Object's own content.body when present -- always additive, regardless of
            // whether body also carries its own real text. (A Service whose body duplicated
            // summary verbatim, e.g. mind.elonn.local's former bug, is a producer-side defect
            // fixed at the source -- never a reason for a Runtime to guess and suppress.)
            var bodyNodes = mediaNodes.concat(contentNodes);
            if (bodyNodes.length === 0) {
                var summaryText = common.text(panel.object.summary, '');
                if (summaryText !== '') {
                    var summaryNode = document.createElement('p');
                    summaryNode.className = 'carry-object-panel__summary';
                    summaryNode.textContent = summaryText;
                    bodyNodes.push(summaryNode);
                }
                var ownBody = canonicalBodyNodes(panel.object);
                if (ownBody) {
                    bodyNodes = bodyNodes.concat(ownBody);
                }
            }
            return bodyNodes.concat(actionNodes);
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

        /*
         * A freshly opened or freshly followed-to document always presents its region list
         * first (canonical/html.md, Region navigation) -- never straight to a region's content,
         * regardless of how the member got here. `focusedRegion` is World's own state for this
         * container (context.objects[id].region, dev.elonn canonical/context.md), passed down
         * from openedObjectBody as panel.region -- the runtime reads it, it does not decide or
         * remember which region is shown. Focusing a region displays it within this same
         * article; the panel's ordinary back control (present once its depth > 0 -- focusing a
         * region is a real World Dataset navigation step) returns to the list.
         */
        function documentNode(object, focusedRegion) {
            var content = object.content && typeof object.content === 'object' ? object.content : {};
            var regions = Array.isArray(content.regions) ? content.regions : [];
            var article = document.createElement('article');
            article.className = 'web-document';

            var selected = String(focusedRegion || '');
            var selectedRegion = null;
            regions.forEach(function (region) {
                if (region && String(region.key || '') === selected) {
                    selectedRegion = region;
                }
            });

            if (regions.length > 1 && selectedRegion) {
                contentTreeNodes(Array.isArray(selectedRegion.content) ? selectedRegion.content : []).forEach(function (node) {
                    article.appendChild(node);
                });
            } else if (regions.length > 1) {
                article.appendChild(regionListNode(regions));
            } else {
                // No landmark structure at all: one main region, shown directly -- a region
                // list of one entry has nothing to choose between.
                contentTreeNodes(regionContentByKey(regions, 'main')).forEach(function (node) {
                    article.appendChild(node);
                });
            }

            var source = common.text(content.source, '');
            if (source !== '') {
                article.appendChild(documentSourceLink(source));
            }
            return article;
        }

        function regionContentByKey(regions, key) {
            var match = regions.filter(function (region) {
                return region && String(region.key || '') === key;
            })[0];
            return match && Array.isArray(match.content) ? match.content : [];
        }

        var REGION_LABELS = {
            header: 'Header',
            navigation: 'Navigation',
            main: 'Main content',
            sidebar: 'Sidebar',
            secondary_sidebar: 'Secondary sidebar',
            footer: 'Footer'
        };

        function regionLabel(key) {
            return REGION_LABELS[key] || key;
        }

        /*
         * Each item carries only the target region key. The container to focus it on is
         * resolved at click time from the ancestor [data-origin-object] (web-runtime.js,
         * originObjectFor) -- the same way every other in-panel action already resolves it,
         * rather than repeating the container id onto every button here.
         */
        function regionListNode(regions) {
            var list = document.createElement('ul');
            list.className = 'web-document__regions';
            regions.forEach(function (region) {
                var key = String(region.key || '');
                var item = document.createElement('li');
                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'web-document__region-item';
                button.dataset.focusRegion = key;
                button.appendChild(document.createTextNode(regionLabel(key)));
                item.appendChild(button);
                list.appendChild(item);
            });
            return list;
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

        /*
         * An Object's own content.body (dev.elonn canonical/object.md, Content body) -- the
         * same canonical content-node vocabulary documentNode() renders for an interpreted
         * document's region, generalized to any Object of any Service that populates `body`
         * directly rather than through Find's regions structure (world dataset refactor step
         * 4: Mind, the first Service pilot). Null when there is no body to show, so callers
         * fall back to their own existing rule (e.g. the bare summary) instead of rendering
         * an empty wrapper.
         */
        function canonicalBodyNodes(object) {
            var content = object && object.content && typeof object.content === 'object' ? object.content : {};
            var body = Array.isArray(content.body) ? content.body : [];
            if (body.length === 0) {
                return null;
            }
            return contentTreeNodes(body);
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
                } else if (kind === 'group') {
                    var group = document.createElement('div');
                    group.className = 'web-document__group';
                    contentTreeNodes(Array.isArray(node.content) ? node.content : []).forEach(function (child) {
                        group.appendChild(child);
                    });
                    out.push(group);
                } else if (kind === 'list') {
                    var list = documentList(node);
                    if (list) {
                        out.push(list);
                    }
                }
            });
            return out;
        }

        /*
         * A `list` content node (object.md, Content body): `ordered` picks the element, and
         * each item's own `content` is this same node vocabulary, recursed -- a nested list
         * stays a real nested <ol>/<ul>, not a flattened run of <li>s.
         */
        function documentList(node) {
            var items = Array.isArray(node.items) ? node.items : [];
            if (items.length === 0) {
                return null;
            }
            var list = document.createElement(node.ordered ? 'ol' : 'ul');
            list.className = 'web-document__list';
            items.forEach(function (item) {
                var li = document.createElement('li');
                contentTreeNodes(Array.isArray(item && item.content) ? item.content : []).forEach(function (child) {
                    li.appendChild(child);
                });
                list.appendChild(li);
            });
            return list;
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

        /*
         * A `media` content node (object.md, Content body). The node's own
         * `resource_or_object_ref` id is only a reference -- never a URL to trust directly. It
         * resolves against the Dataset's flat resource map (resourcesById), never only the
         * owning Object's own narrower `resources[]` ref list -- the same resolution Unity/
         * AndroidXR already do, and the same Elonn-constructed, provider-table-vetted boundary
         * mediaObjectNode() already enforces for a promoted media Object (decision.oembed_
         * provider_table_execution_boundary_20260912). A node whose reference does not resolve
         * renders nothing -- it never falls back to a raw `src`/`source` field on the node
         * itself, which would let interpreted source content (html.md) point this Runtime at
         * an arbitrary, unvetted URL.
         */
        function documentMedia(node) {
            var kind = String(node.kind || '');
            var resource = resourcesById[String(node.resource_or_object_ref || '')] || null;
            var source = resource ? common.text(resource.source, '') : '';
            if (source === '') {
                return null;
            }
            if (kind === 'image') {
                var image = document.createElement('img');
                image.className = 'web-document__image';
                image.src = source;
                image.alt = common.text(node.alt, '');
                image.loading = 'lazy';
                return image;
            }
            if (kind === 'video' || kind === 'audio' || kind === 'embed') {
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
         * A promoted media Object (a `video` or `audio` from an interpreted document or an
         * oEmbed provider match -- dev.elonn canonical/oembed.md). The runtime never knows
         * which provider this is or constructs a provider URL itself: an executable embed
         * URL exists only because Elonn's own provider policy vetted it and Find placed it
         * on an `embed`-kind Resource (decision.oembed_provider_table_execution_boundary_
         * 20260912 -- "the entire executable URL is constructed by Elonn", not a Runtime).
         * This realizes that Resource as an iframe; native playback renders as a real
         * <video>/<audio> element from the source; anything else falls back to a plain link.
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
            var embedSource = embedResourceHref(object, content);
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
            } else {
                // No playable surface here (dev.elonn canonical/html.md, Compatibility) --
                // show what this Runtime can: the thumbnail Find already resolved (now a
                // media node in content.body, decision.thumbnail_is_a_media_node_not_a_
                // canonical_field_20261024 -- the same imagePreview() every other compact
                // card uses, not a thumbnail-specific lookup), plus a plain link to the
                // source (decision.embed_is_a_resource_capability_not_a_video_capability_
                // 20260913 -- playback is a capability, not guaranteed).
                var thumbnail = imagePreview(object);
                if (thumbnail) {
                    thumbnail.className = 'web-video__thumbnail';
                    frame.appendChild(thumbnail);
                }
                if (source !== '') {
                    frame.appendChild(documentSourceLink(source));
                }
            }
            return frame;
        }

        /*
         * The Object's own `embed`-kind Resource -- the canonical, Elonn-constructed
         * executable URL (dev.elonn canonical/oembed.md), found by content.resource when the
         * Object names one, else the first embed-kind Resource it carries. Never derived from
         * content.provider/provider_id: that would make this Runtime re-implement provider
         * policy that belongs solely to Find. Falls back to content.source (already an
         * Elonn-constructed URL when present, per the same policy) only if no Resource
         * carries it -- never to anything reconstructed here.
         */
        function embedResourceHref(object, content) {
            var resources = Array.isArray(object.resources) ? object.resources : [];
            var namedId = String(content.resource || '');
            var named = null;
            var firstEmbed = null;
            resources.forEach(function (resource) {
                if (namedId !== '' && String(resource.id || '') === namedId) {
                    named = resource;
                }
                if (!firstEmbed && String(resource.kind || '') === 'embed') {
                    firstEmbed = resource;
                }
            });
            var resource = named || firstEmbed;
            var href = resource ? common.text(resource.source, '') : '';
            return href !== '' ? href : common.text(content.source, '');
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
            if (object.format === 'drawing_surface') {
                return [hostedSurface(object)].concat(actionLinks(object));
            }
            var nodes = [];
            if (common.text(object.title, '') !== '') {
                var title = document.createElement('strong');
                title.textContent = object.title;
                nodes.push(title);
            }
            // compactBodyText(): object.summary when a Service populated it, else the first
            // real text in content.body -- the same shared rule objectButton()/
            // sequenceEntryNode()/rosterEntryNode() use (record 702), so a carried Finding's
            // body reads the same way a grid/sequence card already does.
            var summaryText = compactBodyText(object);
            if (summaryText !== '') {
                var summary = document.createElement('p');
                summary.className = 'object-summary';
                summary.textContent = summaryText;
                nodes.push(summary);
            }
            var preview = imagePreview(object);
            if (preview) {
                nodes.push(preview);
            }
            containedObjectNodes(object).forEach(function (node) { nodes.push(node); });
            resourceLinks(object).forEach(function (link) { nodes.push(link); });
            actionLinks(object).forEach(function (link) { nodes.push(link); });
            return nodes;
        }

        // Renders a drawing_surface Object's current marks generically -- from its
        // preview_resource image alone (dev.elonn canonical/resource.md, Preview presentation).
        // It does not know or care which Service produced the Object. Capturing a *new* mark is
        // a separate concern, handled entirely by the drawing_operation argument input (see
        // drawingOperationInput) on whichever Action the owning Service declares for editing.
        function hostedSurface(object) {
            var content = object.content || {};
            var frame = document.createElement('section');
            var preview = document.createElement('div');
            var width = Number(content.width || 0);
            var height = Number(content.height || 0);
            var previewResource = drawingResource(object, 'drawing.preview');
            var dataUrl = previewResource ? String((previewResource.content && previewResource.content.data_url) || '') : '';
            frame.className = 'hosted-object-surface';
            frame.dataset.objectId = object.id || '';
            preview.className = 'hosted-object-surface__preview';
            if (width > 0 && height > 0) {
                preview.style.aspectRatio = String(width) + ' / ' + String(height);
            }
            if (dataUrl !== '') {
                var image = document.createElement('img');
                image.className = 'hosted-object-surface__image';
                image.src = dataUrl;
                image.alt = common.text(object.title, 'Drawing');
                preview.appendChild(image);
            }
            frame.appendChild(preview);
            return frame;
        }

        // Finds an Object's Resource of the given content.kind (dev.elonn canonical/resource.md
        // and drawing-operation.md) -- e.g. 'drawing.marks' for the current operations, or
        // 'drawing.preview' for a static preview image. Service-neutral: any Service's Resource
        // carrying this kind is found the same way.
        function drawingResource(object, kind) {
            var resources = Array.isArray(object.resources) ? object.resources : [];
            var match = null;
            resources.some(function (resource) {
                if (String(resource.kind || '') === kind) {
                    match = resource;
                    return true;
                }
                return false;
            });
            return match;
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
            // compactBodyText()/imagePreview(): the same shared rule objectButton()/
            // sequenceEntryNode()/rosterEntryNode() use (record 702), so a contained Object's
            // own button reads and previews the same way every other compact card does.
            var summaryText = compactBodyText(object);
            var preview = imagePreview(object);
            button.type = 'button';
            button.className = 'object-decomposition__object';
            button.dataset.objectId = object.id;
            type.className = 'object-type';
            type.textContent = object.type;
            if (preview) {
                button.appendChild(preview);
            }
            title.textContent = object.title;
            summary.className = 'object-summary';
            summary.textContent = summaryText;
            button.appendChild(type);
            button.appendChild(title);
            if (summaryText !== '') {
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
                // An image Resource already renders visually via imagePreview() above --
                // showing it again here would be a dead text link to its own image URL.
                return common.text(resource.source, '') !== '' && String(resource.kind || '') !== 'image';
            }).map(function (resource) {
                return linkLine('Resource', resource.label, resource.source, object.id);
            });
        }

        // Only reachable for an action actionLinks already filtered to carry a real
        // operation_invocation -- there is no URL on an Action to fall back to (dev.elonn
        // canonical/action.md, "Invocation and availability"; World's ServiceDatasetValidator
        // rejects any Action without one).
        function actionNode(action, object) {
            if (hasModelArguments(action.operationInvocation)) {
                return operationForm(action, object);
            }
            return operationLine('Action', action.label, action.operationInvocation);
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
                    && action.operationInvocation && typeof action.operationInvocation === 'object';
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
            // Read by submitOperationForm for its status message ("Draw saved.", etc). Carried
            // here rather than read off the submit button's own text, since a self-submitting
            // field (drawing_operation) renders no button at all.
            form.dataset.operationLabel = common.text(action.submitLabel, action.label);

            fields.className = 'operation-form__fields';
            var renderedTypes = [];
            Object.keys(args).forEach(function (key) {
                var spec = args[key];
                if (!spec || UNSUPPORTED_ARGUMENT_TYPES.indexOf(spec.type) !== -1) {
                    return;
                }
                renderedTypes.push(common.text(spec.type, 'string'));
                fields.appendChild(operationFormField(key, spec, content[key], object));
            });

            // A drawing_operation field submits itself the instant a stroke completes (see
            // drawingOperationInput) -- when every rendered field is one, a separate submit
            // control has nothing left to do: clicking it either resubmits the same stroke
            // again or, with nothing drawn yet, submits empty and the Service rejects it. Any
            // other field (or a mix) keeps the ordinary submit button.
            var allSelfSubmitting = renderedTypes.length > 0 && renderedTypes.every(function (type) {
                return type === 'drawing_operation';
            });

            submit.type = 'submit';
            submit.className = 'operation-form__submit';
            submit.textContent = common.text(action.submitLabel, action.label);

            status.className = 'operation-form__status';
            status.dataset.operationFormStatus = 'true';

            form.appendChild(fields);
            if (!allSelfSubmitting) {
                form.appendChild(submit);
            }
            form.appendChild(status);
            return form;
        }

        function operationFormField(key, spec, currentValue, object) {
            // A <label> with no `for` implicitly activates its first labelable descendant on
            // any click inside it -- correct when it wraps exactly one control, wrong once it
            // wraps several. A drawing_operation field wraps a color input, a width input, AND
            // a canvas, so a <label> here would pop the color picker on every canvas click; use
            // a plain <div> instead. Every other field still wraps a single real control.
            var isMultiControl = common.text(spec && spec.type, 'string') === 'drawing_operation';
            var wrapper = document.createElement(isMultiControl ? 'div' : 'label');
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
            wrapper.appendChild(operationFormInput(key, spec, currentValue, object));
            return wrapper;
        }

        // A Contract's datetime values are naive wall-clock strings ("2026-09-20 10:00:00" or
        // "2026-09-20T10:00:00", no zone) -- <input type="datetime-local"> requires exactly
        // "YYYY-MM-DDTHH:mm". This re-shapes the same digits rather than round-tripping through
        // Date, which would silently shift the clock time by the browser's own timezone offset.
        function datetimeLocalValue(value) {
            var text = common.text(value, '');
            var match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(text);
            return match ? match[1] + 'T' + match[2] : '';
        }

        function operationFormInput(key, spec, currentValue, object) {
            var type = common.text(spec.type, 'string');
            var enumValues = Array.isArray(spec.enum) ? spec.enum : null;
            var constraints = spec && spec.constraints && typeof spec.constraints === 'object' ? spec.constraints : {};
            var format = common.text(constraints.format, '');
            var hasDefault = Object.prototype.hasOwnProperty.call(spec, 'default');
            var value = (currentValue !== undefined && currentValue !== null) ? currentValue : (hasDefault ? spec.default : '');
            var input;

            if (type === 'drawing_operation') {
                // A structured record, not a form-native value -- built and returned whole
                // (see drawingOperationInput), bypassing the plain <input> trailer below.
                return drawingOperationInput(key, spec, object);
            }

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
            } else if (type === 'datetime') {
                input = document.createElement('input');
                input.type = 'datetime-local';
                input.value = datetimeLocalValue(value);
            } else if (type === 'string' && format === 'markdown') {
                input = document.createElement('textarea');
                input.rows = 18;
                input.value = common.text(value, '');
                input.wrap = 'soft';
                input.spellcheck = true;
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = common.text(value, '');
            }

            input.name = key;
            if (spec.required === true) {
                input.required = true;
            }
            if (Number.isInteger(constraints.max_length) && constraints.max_length > 0) {
                input.maxLength = constraints.max_length;
            }
            return input;
        }

        // Renders a drawing_operation argument as a live freehand drawing surface (dev.elonn
        // canonical guides/contract-authoring-guide.md, Operation Argument Schemas) -- pre-filled
        // with the target Object's existing marks, capturing pointer input as the member draws.
        // The Object's own owning Service is never consulted here: this works identically for
        // any Service's operation that declares a drawing_operation argument.
        function drawingOperationInput(key, spec, object) {
            var content = (object && object.content) || {};
            var width = Number(content.width || 1024) || 1024;
            var height = Number(content.height || 768) || 768;
            var graphicsResource = drawingResource(object || {}, 'graphics.svg');
            var svgMarkup = graphicsResource && graphicsResource.content && typeof graphicsResource.content.svg === 'string'
                ? graphicsResource.content.svg
                : '';
            var wrapper = document.createElement('div');
            var toolbar = document.createElement('div');
            var color = document.createElement('input');
            var strokeWidth = document.createElement('input');
            var canvas = document.createElement('canvas');
            var hidden = document.createElement('input');
            var drawingContext = null;
            var activePointerId = null;
            var points = [];

            wrapper.className = 'drawing-surface-input';
            toolbar.className = 'drawing-surface-input__tools';

            color.type = 'color';
            color.value = '#000000';
            color.className = 'drawing-surface-input__color';
            color.setAttribute('aria-label', 'Pencil color');

            strokeWidth.type = 'range';
            strokeWidth.min = '1';
            strokeWidth.max = '48';
            strokeWidth.step = '1';
            strokeWidth.value = '4';
            strokeWidth.className = 'drawing-surface-input__width';
            strokeWidth.setAttribute('aria-label', 'Pencil width');

            canvas.className = 'drawing-surface-input__canvas';
            canvas.width = width;
            canvas.height = height;
            canvas.style.aspectRatio = String(width) + ' / ' + String(height);
            canvas.setAttribute('aria-label', 'Draw here');
            canvas.tabIndex = 0;

            hidden.type = 'hidden';
            hidden.name = key;
            hidden.dataset.jsonField = 'true';
            if (spec && spec.required === true) {
                hidden.required = true;
            }

            toolbar.appendChild(color);
            toolbar.appendChild(strokeWidth);
            wrapper.appendChild(toolbar);
            wrapper.appendChild(canvas);
            wrapper.appendChild(hidden);

            // The surface's already-committed marks are rendered from graphics_resource -- a
            // graphics.svg Resource conforming to the platform SVG Profile (dev.elonn
            // canonical/svg-profile.md) -- not replayed point-by-point from drawing.marks. This
            // Runtime renders that markup; it does not reconstruct graphics semantics from
            // Paint's (or any Service's) own operations data (svg-profile.md, Ownership). Only
            // the stroke currently being drawn (not yet submitted, and so not yet reflected in
            // graphics_resource) is rendered locally below, as transient interaction feedback.
            drawingContext = canvas.getContext ? canvas.getContext('2d') : null;
            if (drawingContext && svgMarkup !== '') {
                var graphicsImage = new Image();
                graphicsImage.onload = function () {
                    if (drawingContext) {
                        drawingContext.drawImage(graphicsImage, 0, 0, canvas.width, canvas.height);
                    }
                };
                graphicsImage.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
            }

            canvas.addEventListener('pointerdown', function (event) {
                if (!drawingContext || event.button !== 0) {
                    return;
                }
                activePointerId = event.pointerId;
                points = [canvasPoint(event, canvas)];
                canvas.setPointerCapture(event.pointerId);
                event.preventDefault();
            });
            canvas.addEventListener('pointermove', function (event) {
                if (activePointerId !== event.pointerId) {
                    return;
                }
                var next = canvasPoint(event, canvas);
                points.push(next);
                drawStrokeOperation(drawingContext, {
                    style: {color: color.value, width: Number(strokeWidth.value || 4)},
                    geometry: {points: points.slice(-2)}
                });
                event.preventDefault();
            });
            canvas.addEventListener('pointerup', function (event) {
                if (activePointerId !== event.pointerId) {
                    return;
                }
                activePointerId = null;
                var simplified = simplifyPoints(points);
                points = [];
                if (simplified.length < 2) {
                    event.preventDefault();
                    return;
                }
                hidden.value = JSON.stringify({
                    tool: 'pencil',
                    style: {color: color.value, width: Number(strokeWidth.value || 4)},
                    geometry: {points: simplified}
                });
                // A completed stroke submits itself immediately, the same way this surface
                // saved before the generic form pipeline existed -- a drawing_operation field
                // captures one discrete mark per gesture, not a value a member reviews and
                // submits later alongside other fields. Without this, drawing a second stroke
                // before pressing the form's own submit button would silently discard the
                // first one (the hidden field only ever holds the latest stroke).
                var form = wrapper.closest ? wrapper.closest('form') : null;
                if (form && typeof form.requestSubmit === 'function') {
                    form.requestSubmit();
                }
                event.preventDefault();
            });
            canvas.addEventListener('pointercancel', function () {
                activePointerId = null;
                points = [];
            });

            return wrapper;
        }

        function canvasPoint(event, canvas) {
            var rect = canvas.getBoundingClientRect();
            var x = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * canvas.width : 0;
            var y = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * canvas.height : 0;
            return {
                x: Math.min(Math.max(x, 0), canvas.width),
                y: Math.min(Math.max(y, 0), canvas.height)
            };
        }

        function simplifyPoints(points) {
            var output = [];
            points.forEach(function (item) {
                var previous = output[output.length - 1] || null;
                if (!previous || Math.abs(previous.x - item.x) >= 0.5 || Math.abs(previous.y - item.y) >= 0.5) {
                    output.push({
                        x: Math.round(item.x * 100) / 100,
                        y: Math.round(item.y * 100) / 100
                    });
                }
            });
            return output;
        }

        // Draws one Drawing Operation (dev.elonn canonical/drawing-operation.md) onto a 2D
        // context -- the member's own stroke while it is still in progress and has no
        // graphics_resource projection yet (see drawingOperationInput). Already-committed marks
        // are never drawn this way; they render from graphics_resource's SVG markup instead.
        function drawStrokeOperation(context, operation) {
            var style = (operation && operation.style) || {};
            var geometry = (operation && operation.geometry) || {};
            var points = Array.isArray(geometry.points) ? geometry.points : [];
            if (points.length < 2) {
                return;
            }
            context.save();
            context.strokeStyle = String(style.color || '#000000');
            context.lineWidth = Number(style.width || 4);
            context.lineCap = 'round';
            context.lineJoin = 'round';
            context.beginPath();
            context.moveTo(Number(points[0].x || 0), Number(points[0].y || 0));
            points.slice(1).forEach(function (item) {
                context.lineTo(Number(item.x || 0), Number(item.y || 0));
            });
            context.stroke();
            context.restore();
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
