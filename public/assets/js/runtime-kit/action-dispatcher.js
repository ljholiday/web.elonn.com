/*
 * Action dispatcher for World-owned commands.
 */
(function () {
    'use strict';

    var common = window.ElonnWorldRuntime.Common;

    window.ElonnWorldRuntime.ActionDispatcher = function (client) {
        function actionCall(state, action) {
            return client.worldCall({
                selectedObjectId: String(state.selectedObjectId || action.target_id || ''),
                selectedCollectionId: String(state.selectedCollectionId || ''),
                runtimeSessionId: String(state.runtimeSessionId || ''),
                intent: String(action.type || 'action'),
                inputText: String(action.label || 'World action.')
            });
        }

        return {
            dispatch: function (state, action) {
                var availability = action && action.availability && typeof action.availability === 'object' ? action.availability : {};
                if (!action) {
                    return Promise.reject(new Error('World action is missing.'));
                }
                if (availability.state !== 'enabled') {
                    return Promise.reject(new Error(common.text(availability.reason, 'World action is not enabled.')));
                }

                return client.dispatchWorldAction(action, actionCall(state, action));
            }
        };
    };
}());
