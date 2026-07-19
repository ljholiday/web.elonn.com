<?php

declare(strict_types=1);

$root = dirname(__DIR__);

$_SERVER['REQUEST_URI'] = '/ready';
$_SERVER['HTTP_HOST'] = 'web.elonn.local';
$_SERVER['HTTPS'] = 'on';

ob_start();
require $root . '/public/index.php';
$ready = ob_get_clean();
$readyPayload = json_decode(is_string($ready) ? $ready : '', true);

$template = file_get_contents($root . '/templates/runtime.php') ?: '';
$index = file_get_contents($root . '/public/index.php') ?: '';

$checks = [
    'Ready endpoint identifies the fresh Web runtime' => is_array($readyPayload)
        && ($readyPayload['service'] ?? '') === 'elonn_web_runtime'
        && array_keys($readyPayload['dependencies'] ?? []) === ['world'],
    'Runtime template includes the complete runtime kit' => str_contains($template, "'world-client.js'")
        && str_contains($template, "'dataset-parser.js'")
        && str_contains($template, "'scene-model.js'")
        && str_contains($template, "'web-runtime.js'")
        && str_contains($template, '/assets/js/runtime-kit/'),
    'Runtime template exposes query composer controls' => str_contains($template, 'data-runtime-query-form')
        && str_contains($template, 'data-runtime-query-input')
        && str_contains($template, 'data-runtime-voice'),
    'Public routes do not expose legacy compatibility pages' => !str_contains($index, 'templates/runtime-dataset.php')
        && !str_contains($index, 'data-runtime-shell'),
];

$failed = 0;
foreach ($checks as $label => $passed) {
    echo ($passed ? 'PASS' : 'FAIL') . ': ' . $label . PHP_EOL;
    $failed += $passed ? 0 : 1;
}

exit($failed === 0 ? 0 : 1);
