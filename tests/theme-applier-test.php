<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$script = <<<'JS'
const fs = require('fs');
const vm = require('vm');

const root = process.argv[2];
const context = {window: {}};
context.window.ElonnWorldRuntime = {};
vm.createContext(context);

vm.runInContext(fs.readFileSync(`${root}/public/assets/js/runtime-kit/theme-applier.js`, 'utf8'), context, {filename: 'theme-applier.js'});

const ThemeApplier = context.window.ElonnWorldRuntime.ThemeApplier;

// Category naming: a dotted token key becomes a kebab-case CSS custom property, camelCase
// categories (borderWidth) included.
if (ThemeApplier.cssVariableName('color.primary') !== '--color-primary') throw new Error('color.primary did not become --color-primary');
if (ThemeApplier.cssVariableName('borderWidth.thin') !== '--border-width-thin') throw new Error('borderWidth.thin did not become --border-width-thin (camelCase category not kebab-cased)');
if (ThemeApplier.cssVariableName('typography.weight_regular') !== '--typography-weight_regular') throw new Error('multi-segment token name was not preserved after the category');

// Value conversion is per-token, not purely per-type: the same "relative" type means rem for
// spacing/typography/radius, but literal px for borderWidth, and unitless for line_height.
if (ThemeApplier.cssVariableValue('spacing.md', {value: 1, type: 'relative'}) !== '1rem') throw new Error('spacing relative value was not converted to rem');
if (ThemeApplier.cssVariableValue('borderWidth.thin', {value: 1, type: 'relative'}) !== '1px') throw new Error('borderWidth relative value was not converted to px, not rem');
if (ThemeApplier.cssVariableValue('typography.line_height', {value: 1.5, type: 'relative'}) !== '1.5') throw new Error('line_height was not left unitless');
if (ThemeApplier.cssVariableValue('color.primary', {value: '#B8FFF3', type: 'color'}) !== '#B8FFF3') throw new Error('color value was not passed through literally');
if (ThemeApplier.cssVariableValue('radius.full', {value: 'full', type: 'keyword'}) !== '9999px') throw new Error('the "full" keyword did not resolve to 9999px');
if (ThemeApplier.cssVariableValue('typography.weight_bold', {value: 700, type: 'weight'}) !== '700') throw new Error('weight value was not passed through as a plain number string');
if (ThemeApplier.cssVariableValue('typography.family', {value: 'system-ui, sans-serif', type: 'font_family'}) !== 'system-ui, sans-serif') throw new Error('font_family value was not passed through literally');

// apply(): every token in the payload becomes a custom property on the target, plus the two
// data-theme* attributes; absent/malformed theme is a safe no-op (World merges context.theme
// best-effort and a Dataset with no theme -- e.g. the unauthenticated auth-form -- must not throw).
function fakeTarget() {
  const properties = {};
  const attributes = {};
  return {
    style: {setProperty: (name, value) => { properties[name] = value; }},
    setAttribute: (name, value) => { attributes[name] = value; },
    properties,
    attributes
  };
}

const target = fakeTarget();
ThemeApplier.apply(target, {
  theme: 'default',
  version: 1,
  scale: 'md',
  tokens: {
    'color.primary': {value: '#B8FFF3', type: 'color'},
    'spacing.md': {value: 1, type: 'relative'},
    'radius.full': {value: 'full', type: 'keyword'}
  }
});
if (target.properties['--color-primary'] !== '#B8FFF3') throw new Error('apply() did not set --color-primary');
if (target.properties['--spacing-md'] !== '1rem') throw new Error('apply() did not set --spacing-md');
if (target.properties['--radius-full'] !== '9999px') throw new Error('apply() did not set --radius-full');
if (target.attributes['data-theme'] !== 'default') throw new Error('apply() did not set data-theme');
if (target.attributes['data-theme-scale'] !== 'md') throw new Error('apply() did not set data-theme-scale');

const noopTarget = fakeTarget();
ThemeApplier.apply(noopTarget, null);
ThemeApplier.apply(noopTarget, undefined);
ThemeApplier.apply(null, {theme: 'default', tokens: {}});
if (Object.keys(noopTarget.properties).length !== 0) throw new Error('apply() with no theme must not set any property');
if (Object.keys(noopTarget.attributes).length !== 0) throw new Error('apply() with no theme must not set any attribute');
JS;

$temp = tempnam(sys_get_temp_dir(), 'web-theme-applier-');
if (!is_string($temp)) {
    fwrite(STDERR, "Could not create temp file.\n");
    exit(1);
}

file_put_contents($temp, $script);
$command = 'node ' . escapeshellarg($temp) . ' ' . escapeshellarg($root) . ' 2>&1';
exec($command, $output, $status);
unlink($temp);

if ($status !== 0) {
    fwrite(STDERR, implode(PHP_EOL, $output) . PHP_EOL);
    exit(1);
}

echo "PASS: ThemeApplier converts tokens to CSS custom properties, per-token unit rules, safe no-op when theme is absent\n";
