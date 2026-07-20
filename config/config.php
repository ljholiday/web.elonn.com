<?php

declare(strict_types=1);

/*
 * Web runtime configuration.
 *
 * This file is the only deployment environment reader for the browser runtime.
 * The runtime consumes normalized API and World endpoints. Authentication
 * remains API-owned while the web runtime owns the browser login surface.
 */
$local = str_contains((string) ($_SERVER['HTTP_HOST'] ?? ''), 'elonn.local');

return [
    'app' => [
        'environment' => web_string_config('APP_ENV', 'production'),
        'debug' => web_bool_config('APP_DEBUG', false),
        'url' => rtrim(web_string_config('APP_URL', $local ? 'https://web.elonn.local' : 'https://web.elonn.com'), '/'),
    ],
    'auth' => [
        'cookie_domain' => web_string_config('ELONN_COOKIE_DOMAIN', $local ? '.elonn.local' : '.elonn.com'),
    ],
    'api' => [
        'base_url' => rtrim(web_string_config('ELONN_API_BASE_URL', $local ? 'https://api.elonn.local' : 'https://api.elonn.com'), '/'),
    ],
    'world' => [
        'base_url' => rtrim(web_string_config('ELONN_WORLD_BASE_URL', $local ? 'https://world.elonn.local' : 'https://world.elonn.com'), '/'),
    ],
];

function web_string_config(string $key, string $default = ''): string
{
    $value = $_SERVER[$key] ?? $_ENV[$key] ?? $default;
    return trim((string) $value);
}

function web_bool_config(string $key, bool $default): bool
{
    $value = $_SERVER[$key] ?? $_ENV[$key] ?? $default;
    if (is_bool($value)) {
        return $value;
    }

    return filter_var($value, FILTER_VALIDATE_BOOL);
}
