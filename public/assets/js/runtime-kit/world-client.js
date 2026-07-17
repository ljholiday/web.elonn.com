/*
 * World client boundary.
 *
 * The browser runtime talks only to POST /world/call.
 */
(function () {
    'use strict';

    window.ElonnWorldRuntime = window.ElonnWorldRuntime || {};

    window.ElonnWorldRuntime.WorldClient = function (root) {
        var baseUrl = String(root.dataset.worldBaseUrl || '').replace(/\/+$/, '');
        var runtimeName = String(root.dataset.runtimeName || 'web');

        function endpoint(path) {
            var value = String(path || '');
            if (value.indexOf('/world/') !== 0) {
                throw new Error('Runtime refused a non-World endpoint.');
            }
            return baseUrl + value;
        }

        function runtimeCapabilities() {
            return {
                screen: true,
                pointer: true,
                keyboard: true,
                touch: 'ontouchstart' in window,
                spatial_markers: false,
                field_view: true,
                voice: false,
                collections: true,
                resources: true,
                action_dispatch: false
            };
        }

        function worldCall(runtimeState) {
            var state = runtimeState && typeof runtimeState === 'object' ? runtimeState : {};
            var call = {
                id: 'call:runtime:web:' + String(Date.now()),
                content: {
                    runtime: {
                        id: runtimeName,
                        session_id: String(state.runtimeSessionId || ''),
                        locale: String(navigator.language || ''),
                        timezone: typeof Intl !== 'undefined' && Intl.DateTimeFormat
                            ? String(Intl.DateTimeFormat().resolvedOptions().timeZone || '')
                            : '',
                        capabilities: runtimeCapabilities()
                    },
                    input: {
                        type: 'text',
                        text: String(state.inputText || 'Open my world.')
                    },
                    intent: String(state.intent || 'overview'),
                    capabilities: runtimeCapabilities()
                },
                context: {
                    scope: String(state.scope || 'default'),
                    runtime_state: {},
                    focus: {}
                }
            };

            if (String(state.selectedObjectId || '') !== '') {
                call.context.focus.object_id = String(state.selectedObjectId);
            }
            if (String(state.selectedCollectionId || '') !== '') {
                call.context.runtime_state.selected_collection_id = String(state.selectedCollectionId);
            }
            if (String(state.runtimeSessionId || '') !== '') {
                call.context.runtime_state.runtime_session_id = String(state.runtimeSessionId);
            }

            return call;
        }

        function postJson(path, body) {
            return fetch(endpoint(path), {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body && typeof body === 'object' ? body : {})
            }).then(function (response) {
                return response.json().then(function (payload) {
                    if (!response.ok) {
                        var message = payload && payload.error ? String(payload.error) : 'World request failed: ' + String(response.status);
                        var error = new Error(message);
                        error.payload = payload;
                        throw error;
                    }
                    return payload;
                });
            });
        }

        return {
            worldCall: worldCall,

            loadDataset: function (runtimeState) {
                return postJson('/world/call', worldCall(runtimeState));
            },

            dispatchWorldAction: function (action, body) {
                return postJson('/world/call', body);
            }
        };
    };
}());
