/*
 * Pre-auth boundary.
 *
 * World and Conductor require an authenticated member, so the login / register screen cannot
 * come through them. api.elonn owns that screen and serves it as an unauthenticated canonical
 * Dataset; this client fetches it and submits the filled credentials straight back to api.
 * The web runtime renders the Dataset with the same generic renderer it uses for every other
 * operation form -- there is no hand-written login markup here.
 */
(function () {
    'use strict';

    window.ElonnWorldRuntime = window.ElonnWorldRuntime || {};

    window.ElonnWorldRuntime.AuthClient = function (root) {
        var apiBaseUrl = String(root.dataset.apiBaseUrl || '').replace(/\/+$/, '');

        function readJson(response) {
            return response.json().catch(function () {
                return {};
            });
        }

        function loadForm(mode) {
            var query = mode === 'register' ? 'register' : 'login';
            return fetch(apiBaseUrl + '/identity/auth-form?mode=' + query, {
                method: 'GET',
                credentials: 'include',
                headers: {'Accept': 'application/json'}
            }).then(readJson);
        }

        function submit(operation, payload) {
            var path = operation === 'identity.register' ? '/identity/register' : '/identity/login';
            return fetch(apiBaseUrl + path, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Elonn-Runtime': 'web'
                },
                body: JSON.stringify(payload && typeof payload === 'object' ? payload : {})
            }).then(readJson);
        }

        return {
            loadForm: loadForm,
            submit: submit
        };
    };
}());
