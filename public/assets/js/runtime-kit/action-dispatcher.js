/*
 * Action dispatcher for World-owned commands.
 */
(function () {
    'use strict';

    var common = window.ElonnWorldRuntime.Common;

    window.ElonnWorldRuntime.ActionDispatcher = function (client) {
        function actionRequest(state, action) {
            return {
                contract: {
                    name: 'elonn.world.session_request',
                    version: 1
                },
                user_id: 'demo_user',
                selected_object_id: String(state.selectedObjectId || action.target_id || ''),
                selected_collection_id: String(state.selectedCollectionId || ''),
                runtime: {
                    name: 'web',
                    contract: {
                        name: 'elonn.world.dataset',
                        version: 1
                    }
                },
                input: {},
                runtime_state: {
                    selected_object_id: String(state.selectedObjectId || ''),
                    selected_collection_id: String(state.selectedCollectionId || ''),
                    runtime_session_id: String(state.runtimeSessionId || '')
                }
            };
        }

        return {
            dispatch: function (state, action) {
                var availability = action && action.availability && typeof action.availability === 'object' ? action.availability : {};
                if (!action || String(action.endpoint || '').indexOf('/world/actions/') !== 0) {
                    return Promise.reject(new Error('Runtime refused an unpublished World action.'));
                }
                if (availability.state !== 'enabled') {
                    return Promise.reject(new Error(common.text(availability.reason, 'World action is not enabled.')));
                }

                return client.dispatchWorldAction(action, actionRequest(state, action));
            }
        };
    };
}());
