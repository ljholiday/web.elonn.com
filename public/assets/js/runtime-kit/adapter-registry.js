/*
 * Runtime adapter registry for hosted Object surfaces.
 */
(function () {
    'use strict';

    window.ElonnWorldRuntime = window.ElonnWorldRuntime || {};

    window.ElonnWorldRuntime.AdapterRegistry = (function () {
        var adapters = {};

        function key(service, kind) {
            return String(service || '') + '/' + String(kind || '');
        }

        function hostedObject(frame) {
            var value = String(frame.dataset.hostedObject || '');
            if (value === '') {
                return {};
            }
            try {
                value = JSON.parse(value);
            } catch (error) {
                return {};
            }

            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        }

        function adapterFor(frame) {
            return adapters[key(frame.dataset.surfaceService, frame.dataset.surfaceKind)] || null;
        }

        return {
            register: function (service, kind, adapter) {
                if (!adapter || typeof adapter.mount !== 'function') {
                    throw new Error('Runtime adapter must provide mount.');
                }
                adapters[key(service, kind)] = adapter;
            },

            mountAll: function (root, context) {
                root.querySelectorAll('[data-hosted-surface]').forEach(function (frame) {
                    var adapter = adapterFor(frame);
                    if (!adapter || frame.dataset.adapterMounted === 'true') {
                        return;
                    }
                    frame.dataset.adapterMounted = 'true';
                    adapter.mount(frame, hostedObject(frame), context);
                });
            },

            handleResponse: function (payload, runtimeState, context) {
                var command = runtimeState && runtimeState.operationInvocation && typeof runtimeState.operationInvocation === 'object'
                    ? runtimeState.operationInvocation
                    : null;
                var adapter = command ? adapters[key(command.service, command.kind || '')] || adapters[key(command.service, command.surface_kind || '')] : null;
                if (adapter && typeof adapter.handleResponse === 'function') {
                    adapter.handleResponse(payload, command, context);
                }
            }
        };
    }());
}());
