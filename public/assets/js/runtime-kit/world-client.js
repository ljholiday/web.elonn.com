/*
 * World client boundary.
 *
 * The browser runtime talks only to POST /world/session and published World
 * action endpoints.
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
                action_dispatch: true
            };
        }

        function sessionRequest(runtimeState) {
            var state = runtimeState && typeof runtimeState === 'object' ? runtimeState : {};
            var body = {
                contract: {
                    name: 'elonn.world.session_request',
                    version: 1
                },
                user_id: 'demo_user',
                context: {
                    intent: 'render_world_dataset',
                    scope: 'reference_fixture'
                },
                runtime: {
                    name: runtimeName,
                    contract: {
                        name: 'elonn.world.dataset',
                        version: 1
                    }
                },
                capabilities: runtimeCapabilities(),
                runtime_state: {}
            };

            if (String(state.selectedObjectId || '') !== '') {
                body.selected_object_id = String(state.selectedObjectId);
                body.runtime_state.selected_object_id = String(state.selectedObjectId);
            }
            if (String(state.selectedCollectionId || '') !== '') {
                body.selected_collection_id = String(state.selectedCollectionId);
                body.runtime_state.selected_collection_id = String(state.selectedCollectionId);
            }
            if (String(state.runtimeSessionId || '') !== '') {
                body.runtime_state.runtime_session_id = String(state.runtimeSessionId);
            }

            return body;
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
            sessionRequest: sessionRequest,

            loadDataset: function (runtimeState) {
                return postJson('/world/session', sessionRequest(runtimeState));
            },

            dispatchWorldAction: function (action, body) {
                return postJson(String(action.endpoint || ''), body);
            }
        };
    };
}());
