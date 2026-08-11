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
    $target = web_runtime_https_redirect_target($config['app']['url']);
    if ($target !== null) {
        http_response_code(308);
        header('Location: ' . $target);
        exit;
    }
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

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
            'api' => $config['api']['base_url'],
            'world' => $config['world']['base_url'],
        ],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    return;
}

if ($path === '/metrics') {
    $startedAt = microtime(true);
    if (!web_runtime_service_authenticated($config, 'admin.elonn')) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'errors' => [[
                'code' => 'web.service_auth_failed',
                'class' => 'auth',
                'message' => 'Authenticated admin service request is required.',
            ]],
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        return;
    }

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'contract_version' => '1.0',
        'service' => 'web.elonn',
        'status' => 'ok',
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        'response_time_ms' => round((microtime(true) - $startedAt) * 1000, 2),
        'custom_metrics' => [
            'api_base_url_configured' => $config['api']['base_url'] !== '',
            'world_base_url_configured' => $config['world']['base_url'] !== '',
        ],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    return;
}

if ($path === '/login' && $method === 'GET') {
    if (web_runtime_auth_token() !== null) {
        web_runtime_redirect('/');
        return;
    }

    $title = 'Log in to Elonn Web';
    $app = $config['app'];
    $api = $config['api'];
    $world = $config['world'];
    $canonicalPath = $path;
    $error = web_runtime_login_error($_GET['error'] ?? null);
    $old = [];

    require BASE_PATH . '/templates/login.php';
    return;
}

if ($path === '/login' && $method === 'POST') {
    $email = web_runtime_normalize_email($_POST['email'] ?? null);
    $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';

    if ($email === null || $password === '') {
        $title = 'Log in to Elonn Web';
        $app = $config['app'];
        $api = $config['api'];
        $world = $config['world'];
        $canonicalPath = $path;
        $error = 'Email and password are required.';
        $old = ['email' => is_string($_POST['email'] ?? null) ? (string) $_POST['email'] : ''];

        http_response_code(400);
        require BASE_PATH . '/templates/login.php';
        return;
    }

    $login = web_runtime_api_login($config['api'], $email, $password);
    if (!$login['ok'] || !isset($login['token'], $login['expires_at'])) {
        $title = 'Log in to Elonn Web';
        $app = $config['app'];
        $api = $config['api'];
        $world = $config['world'];
        $canonicalPath = $path;
        $error = 'Invalid email or password.';
        $old = ['email' => $email];

        http_response_code(401);
        require BASE_PATH . '/templates/login.php';
        return;
    }

    web_runtime_set_auth_cookie($login['token'], $login['expires_at'], $config['auth']['cookie_domain']);
    web_runtime_redirect('/');
    return;
}

if ($path === '/logout' && $method === 'POST') {
    $token = web_runtime_auth_token();
    if ($token !== null) {
        web_runtime_api_logout($config['api'], $token);
    }
    web_runtime_clear_auth_cookie($config['auth']['cookie_domain']);
    web_runtime_redirect('/login');
    return;
}

if ($path !== '/' && $path !== '/runtime-dataset') {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not Found';
    return;
}

if (web_runtime_auth_token() === null) {
    $title = 'Log in to Elonn Web';
    $app = $config['app'];
    $api = $config['api'];
    $world = $config['world'];
    $canonicalPath = $path;
    $error = null;
    $old = [];

    require BASE_PATH . '/templates/login.php';
    return;
}

$title = 'Elonn Web';
$app = $config['app'];
$world = $config['world'];
$canonicalPath = $path;
$fallbackDataset = web_runtime_fallback_dataset($world, web_runtime_auth_token());

require BASE_PATH . '/templates/runtime.php';

/**
 * @param array{base_url:string} $world
 * @return array<string, mixed>|null
 */
function web_runtime_fallback_dataset(array $world, ?string $token): ?array
{
    $body = json_encode([
        'id' => 'call:runtime:web:fallback',
        'content' => [
            'operation' => 'world.restore',
            'input' => [
                'type' => 'text',
                'text' => 'Restore my world.',
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

    if (!is_string($body) || $token === null) {
        return null;
    }

    $headers = [
        'Accept: application/json',
        'Content-Type: application/json',
        'Cookie: elonn_api_token=' . rawurlencode($token),
    ];

    $response = @file_get_contents(rtrim($world['base_url'], '/') . '/world/call', false, stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => $headers,
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

function web_runtime_auth_token(): ?string
{
    $token = $_COOKIE['elonn_api_token'] ?? null;
    if (!is_string($token)) {
        return null;
    }

    $token = trim($token);
    return $token === '' ? null : $token;
}

function web_runtime_service_authenticated(array $config, string $expectedService): bool
{
    $service = trim((string) ($_SERVER['HTTP_X_ELONN_SERVICE'] ?? ''));
    $token = trim((string) ($_SERVER['HTTP_X_ELONN_SERVICE_TOKEN'] ?? ''));
    $authorization = trim((string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '')));
    if ($token === '' && str_starts_with($authorization, 'Bearer ')) {
        $token = trim(substr($authorization, 7));
    }

    $expected = (string) (($config['service_auth'][$expectedService] ?? '') ?: '');
    return $service === $expectedService
        && $token !== ''
        && $expected !== ''
        && hash_equals($expected, $token);
}

/**
 * @param array{base_url:string} $api
 * @return array{ok:bool,status:int,token?:string,expires_at?:string,error?:string}
 */
function web_runtime_api_login(array $api, string $email, string $password): array
{
    $response = web_runtime_api_request($api, 'POST', '/identity/login', [
        'email' => $email,
        'password' => $password,
    ], null);
    $json = is_array($response['json']) ? $response['json'] : [];

    return [
        'ok' => $response['status'] >= 200 && $response['status'] < 300,
        'status' => $response['status'],
        'token' => is_string($json['token'] ?? null) ? $json['token'] : null,
        'expires_at' => is_string($json['expires_at'] ?? null) ? $json['expires_at'] : null,
        'error' => is_string($json['error'] ?? null) ? $json['error'] : null,
    ];
}

/**
 * @param array{base_url:string} $api
 */
function web_runtime_api_logout(array $api, string $token): void
{
    web_runtime_api_request($api, 'POST', '/identity/logout', [], $token);
}

/**
 * @param array{base_url:string} $api
 * @param array<string, mixed>|null $body
 * @return array{status:int,json:mixed}
 */
function web_runtime_api_request(array $api, string $method, string $path, ?array $body, ?string $token): array
{
    $headers = ['Accept: application/json'];
    $content = '';

    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        $content = json_encode($body, JSON_UNESCAPED_SLASHES) ?: '{}';
    }

    if ($token !== null) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    $raw = @file_get_contents(rtrim($api['base_url'], '/') . $path, false, stream_context_create([
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'content' => $content,
            'ignore_errors' => true,
            'timeout' => 5,
        ],
    ]));

    $status = 0;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $matches) === 1) {
            $status = (int) $matches[1];
            break;
        }
    }

    return [
        'status' => $status,
        'json' => is_string($raw) ? json_decode($raw, true) : null,
    ];
}

function web_runtime_normalize_email(mixed $email): ?string
{
    if (!is_string($email)) {
        return null;
    }

    $email = strtolower(trim($email));
    return filter_var($email, FILTER_VALIDATE_EMAIL) === false ? null : $email;
}

function web_runtime_login_error(mixed $error): ?string
{
    return match ($error) {
        'missing_fields' => 'Email and password are required.',
        'invalid_login' => 'Invalid email or password.',
        default => null,
    };
}

function web_runtime_set_auth_cookie(string $token, string $expiresAt, string $domain): void
{
    setcookie('elonn_api_token', $token, [
        'expires' => strtotime($expiresAt) ?: 0,
        'path' => '/',
        'domain' => $domain,
        'secure' => web_runtime_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function web_runtime_clear_auth_cookie(string $domain): void
{
    setcookie('elonn_api_token', '', [
        'expires' => time() - 3600,
        'path' => '/',
        'domain' => $domain,
        'secure' => web_runtime_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function web_runtime_is_https(): bool
{
    return ($_SERVER['HTTPS'] ?? '') === 'on'
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

function web_runtime_https_redirect_target(string $canonicalUrl): ?string
{
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = is_string($uri) && str_starts_with($uri, '/') ? $uri : '/';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $host = is_string($host) ? strtolower(explode(':', $host, 2)[0]) : '';

    if (in_array($host, ['web.elonn.local', 'web.elonn.com'], true)) {
        return 'https://' . $host . $path;
    }

    $canonical = rtrim($canonicalUrl, '/');
    return $canonical === '' ? null : $canonical . $path;
}

function web_runtime_redirect(string $path): void
{
    http_response_code(303);
    header('Location: ' . $path);
}
