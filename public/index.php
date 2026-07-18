<?php

declare(strict_types=1);

use Dotenv\Dotenv;

define('BASE_PATH', dirname(__DIR__));

require BASE_PATH . '/vendor/autoload.php';

Dotenv::createImmutable(BASE_PATH)->safeLoad();

$config = require BASE_PATH . '/config/config.php';

if (
    (($_SERVER['HTTPS'] ?? '') !== 'on')
    && (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') !== 'https')
) {
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if (is_string($host) && $host !== '') {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        http_response_code(308);
        header('Location: https://' . $host . (is_string($uri) ? $uri : '/'));
        exit;
    }
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if ($path === '/health') {
    header('Content-Type: text/plain; charset=utf-8');
    echo 'ok';
    return;
}

if ($path === '/ready') {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'ready',
        'service' => 'elonn_web_runtime',
        'database' => 'not_required',
        'dependencies' => [
            'world' => $config['world']['base_url'],
        ],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    return;
}

if ($path !== '/' && $path !== '/runtime-dataset') {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not Found';
    return;
}

$title = 'Elonn Web';
$app = $config['app'];
$world = $config['world'];
$canonicalPath = $path;
$fallbackDataset = web_runtime_fallback_dataset($world);

require BASE_PATH . '/templates/runtime.php';

/**
 * @param array{base_url:string} $world
 * @return array<string, mixed>|null
 */
function web_runtime_fallback_dataset(array $world): ?array
{
    $body = json_encode([
        'id' => 'call:runtime:web:fallback',
        'content' => [
            'operation' => 'world.compose',
            'input' => [
                'type' => 'text',
                'text' => 'Open my world.',
            ],
        ],
        'context' => [
            'runtime' => [
                'id' => 'web',
                'locale' => 'en-US',
                'timezone' => '',
                'capabilities' => [
                    'screen' => true,
                    'pointer' => false,
                    'keyboard' => true,
                    'touch' => false,
                    'field_view' => true,
                ],
            ],
            'scope' => 'server_fallback',
            'runtime_state' => [],
        ],
    ], JSON_UNESCAPED_SLASHES);

    if (!is_string($body)) {
        return null;
    }

    $response = @file_get_contents(rtrim($world['base_url'], '/') . '/world/call', false, stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => [
                'Accept: application/json',
                'Content-Type: application/json',
            ],
            'content' => $body,
            'timeout' => 2,
            'ignore_errors' => true,
        ],
    ]));

    if (!is_string($response) || $response === '') {
        return null;
    }

    $payload = json_decode($response, true);
    if (!is_array($payload) || ($payload['type'] ?? '') !== 'world' || !array_key_exists('errors', $payload)) {
        return null;
    }

    return $payload;
}
