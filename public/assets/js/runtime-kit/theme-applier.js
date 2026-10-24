(function () {
    'use strict';

    /*
     * Applies the member's effective theme (World Dataset context.theme -- see
     * decision.member_theming_design_token_system_corrected_20261023 on agents.elonn.com) as CSS
     * custom properties on the document root. Generic over whatever tokens the server sends: a
     * new token api.elonn adds later needs no change here, since every key in `tokens` becomes a
     * CSS variable automatically, named and unit-converted by its own category/type.
     *
     * Unit conversion is deliberately per-token, not purely per-type, because the same `relative`
     * type means different CSS units in different categories: spacing/radius/typography scale
     * values are proportions of the page's root font size (rem), but a border's thickness is a
     * literal pixel count (a "thin" 1-unit border rendered at 1rem would be absurdly thick), and
     * line-height is conventionally unitless in CSS (an absolute rem value would stop it tracking
     * an element's own font-size).
     */

    function cssVariableName(tokenKey) {
        var parts = String(tokenKey).split('.');
        var category = parts.shift().replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        var rest = parts.join('-');
        return '--' + category + (rest !== '' ? '-' + rest : '');
    }

    function cssVariableValue(tokenKey, token) {
        var type = token.type;
        var value = token.value;

        if (type === 'color' || type === 'font_family') {
            return String(value);
        }
        if (type === 'weight') {
            return String(value);
        }
        if (type === 'keyword') {
            // "full" is the one keyword value in the v1 schema: fully rounded, independent of
            // element size. 9999px is this Runtime's own existing convention for that (see
            // runtime.css's prior literal 999px pill-shape radii).
            return value === 'full' ? '9999px' : String(value);
        }
        if (type === 'relative') {
            if (tokenKey.indexOf('borderWidth.') === 0) {
                return value + 'px';
            }
            if (tokenKey === 'typography.line_height') {
                return String(value);
            }
            return value + 'rem';
        }
        return String(value);
    }

    /**
     * @param {Element} target the element to set custom properties on (normally document.documentElement)
     * @param {{theme?: string, scale?: string, tokens?: Object<string, {value: *, type: string}>}} theme
     */
    function apply(target, theme) {
        if (!target || !theme || typeof theme !== 'object') {
            return;
        }

        var tokens = theme.tokens && typeof theme.tokens === 'object' ? theme.tokens : {};
        Object.keys(tokens).forEach(function (key) {
            var token = tokens[key];
            if (!token || typeof token !== 'object') {
                return;
            }
            target.style.setProperty(cssVariableName(key), cssVariableValue(key, token));
        });

        if (typeof theme.theme === 'string' && theme.theme !== '') {
            target.setAttribute('data-theme', theme.theme);
        }
        if (typeof theme.scale === 'string' && theme.scale !== '') {
            target.setAttribute('data-theme-scale', theme.scale);
        }
    }

    window.ElonnWorldRuntime = window.ElonnWorldRuntime || {};
    window.ElonnWorldRuntime.ThemeApplier = {
        apply: apply,
        cssVariableName: cssVariableName,
        cssVariableValue: cssVariableValue
    };
}());
