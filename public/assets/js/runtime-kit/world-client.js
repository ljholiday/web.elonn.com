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
                touch: false,
                spatial_markers: false,
                field_view: true,
                voice: true,
                collections: true,
                resources: true,
                action_dispatch: true
            };
        }

        function worldCall(runtimeState) {
            var state = runtimeState && typeof runtimeState === 'object' ? runtimeState : {};
            var origin = state.origin && typeof state.origin === 'object' ? state.origin : null;
            var call = {
                id: 'call:runtime:web:' + String(Date.now()),
                content: {
                    operation: String(state.operation || 'world.compose'),
                    input: {
                        type: 'text',
                        text: String(state.inputText || 'Open my world.')
                    }
                },
                context: {
                    runtime: {
                        id: runtimeName,
                        locale: String(navigator.language || ''),
                        timezone: typeof Intl !== 'undefined' && Intl.DateTimeFormat
                            ? String(Intl.DateTimeFormat().resolvedOptions().timeZone || '')
                            : '',
                        capabilities: runtimeCapabilities()
                    },
                    scope: String(state.scope || 'default'),
                    runtime_state: {
                        dataset_id: String(state.runtimeSessionId || ''),
                        selected_object_id: String(state.selectedObjectId || ''),
                        selected_collection_id: String(state.selectedCollectionId || '')
                    },
                    focus: {}
                }
            };

            if (origin && isFinite(Number(origin.latitude)) && isFinite(Number(origin.longitude))) {
                call.content.origin = {
                    latitude: Number(origin.latitude),
                    longitude: Number(origin.longitude)
                };
            }
            if (isFinite(Number(state.radiusMeters)) && Number(state.radiusMeters) > 0) {
                call.content.radius_meters = Math.round(Number(state.radiusMeters));
            }
            if (state.operationInvocation && typeof state.operationInvocation === 'object' && !Array.isArray(state.operationInvocation)) {
                call.content.operation_invocation = state.operationInvocation;
            }
            if (String(state.selectedObjectId || '') !== '') {
                call.context.focus.object_id = String(state.selectedObjectId);
            }
            if (String(state.selectedCollectionId || '') !== '') {
                call.context.runtime_state.selected_collection_id = String(state.selectedCollectionId);
            }
            if (String(state.runtimeSessionId || '') !== '') {
                call.context.runtime_state.dataset_id = String(state.runtimeSessionId);
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
                return response.json().catch(function () {
                    return {};
                }).then(function (payload) {
                    if (!response.ok) {
                        var errors = payload && Array.isArray(payload.errors) ? payload.errors : [];
                        var first = errors[0] && typeof errors[0] === 'object' ? errors[0] : {};
                        var message = first.message ? String(first.message) : 'World request failed: ' + String(response.status);
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
            }
        };
    };
}());
