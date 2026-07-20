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

if ($path === '/login' && $method === 'GET') {
    if (web_runtime_current_identity($config['api']) !== null) {
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

if ($path === '/world/call' && $method === 'POST') {
    $identity = web_runtime_current_identity($config['api']);
    if ($identity === null) {
        web_runtime_json([
            'errors' => [[
                'code' => 'web.auth_required',
                'class' => 'auth',
                'message' => 'Authenticated member session is required.',
            ]],
        ], 401);
        return;
    }

    $call = web_runtime_json_input();
    if ($call === null) {
        web_runtime_json([
            'errors' => [[
                'code' => 'web.invalid_call_json',
                'class' => 'contract',
                'message' => 'World Call request body must be a JSON object.',
            ]],
        ], 400);
        return;
    }

    $response = web_runtime_world_call(
        $config['world'],
        $config['service_auth']['world'],
        $identity,
        $call
    );
    web_runtime_json($response['json'], $response['status']);
    return;
}

if ($path !== '/' && $path !== '/runtime-dataset') {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not Found';
    return;
}

$identity = web_runtime_current_identity($config['api']);
if ($identity === null) {
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
$fallbackDataset = web_runtime_fallback_dataset($config['world'], $config['service_auth']['world'], $identity);

require BASE_PATH . '/templates/runtime.php';

/**
 * @param array{base_url:string} $world
 * @return array<string, mixed>|null
 */
function web_runtime_fallback_dataset(array $world, array $serviceAuth, array $identity): ?array
{
    $call = [
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
    ];

    $response = web_runtime_world_call($world, $serviceAuth, $identity, $call, 2);
    $payload = $response['json'];
    if ($response['status'] < 200 || $response['status'] >= 300 || !is_array($payload)) {
        return null;
    }

    if (($payload['type'] ?? '') !== 'world' || !array_key_exists('errors', $payload)) {
        return null;
    }

    return $payload;
}

/**
 * @param array{base_url:string} $world
 * @param array{service_name:string, token:string} $serviceAuth
 * @param array{id:string, email:string, username:string|null, display_name:string|null} $identity
 * @param array<string, mixed> $call
 * @return array{status:int,json:mixed}
 */
function web_runtime_world_call(array $world, array $serviceAuth, array $identity, array $call, int $timeoutSeconds = 8): array
{
    $body = json_encode($call, JSON_UNESCAPED_SLASHES);
    if (!is_string($body)) {
        return [
            'status' => 500,
            'json' => [
                'errors' => [[
                    'code' => 'web.world_call_encoding_failed',
                    'class' => 'processing',
                    'message' => 'Web could not encode the World Call.',
                ]],
            ],
        ];
    }

    $token = trim((string) ($serviceAuth['token'] ?? ''));
    if ($token === '') {
        return [
            'status' => 503,
            'json' => [
                'errors' => [[
                    'code' => 'web.world_service_auth_not_configured',
                    'class' => 'configuration',
                    'message' => 'World service authentication is not configured.',
                ]],
            ],
        ];
    }

    $headers = [
        'Accept: application/json',
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token,
        'X-Elonn-Service: ' . trim((string) ($serviceAuth['service_name'] ?? 'web.elonn')),
        'X-Elonn-Service-Token: ' . $token,
        'X-Elonn-Member-Id: ' . $identity['id'],
        'X-Elonn-Member-Email: ' . $identity['email'],
    ];
    if (is_string($identity['display_name']) && $identity['display_name'] !== '') {
        $headers[] = 'X-Elonn-Member-Display-Name: ' . $identity['display_name'];
    }

    $response = @file_get_contents(rtrim($world['base_url'], '/') . '/world/call', false, stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => $headers,
            'content' => $body,
            'timeout' => $timeoutSeconds,
            'ignore_errors' => true,
        ],
    ]));

    $status = 0;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $matches) === 1) {
            $status = (int) $matches[1];
            break;
        }
    }

    if (!is_string($response) || $response === '') {
        return [
            'status' => $status > 0 ? $status : 502,
            'json' => [
                'errors' => [[
                    'code' => 'web.world_unavailable',
                    'class' => 'dependency',
                    'message' => 'World endpoint is unavailable.',
                ]],
            ],
        ];
    }

    return [
        'status' => $status > 0 ? $status : 502,
        'json' => json_decode($response, true),
    ];
}

/**
 * @return array<string, mixed>|null
 */
function web_runtime_json_input(): ?array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return null;
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function web_runtime_json(mixed $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) ?: '{}';
}

/**
 * @param array{base_url:string} $api
 * @return array{id:string, email:string, username:string|null, display_name:string|null}|null
 */
function web_runtime_current_identity(array $api): ?array
{
    $token = web_runtime_auth_token();
    if ($token === null) {
        return null;
    }

    $response = web_runtime_api_request($api, 'GET', '/identity/me', null, $token);
    if ($response['status'] !== 200 || !is_array($response['json'])) {
        return null;
    }

    $id = $response['json']['id'] ?? null;
    $email = $response['json']['email'] ?? null;
    if ((!is_string($id) && !is_int($id)) || !is_string($email)) {
        return null;
    }

    $username = $response['json']['username'] ?? null;
    $displayName = $response['json']['display_name'] ?? null;
    return [
        'id' => (string) $id,
        'email' => $email,
        'username' => is_string($username) ? $username : null,
        'display_name' => is_string($displayName) ? $displayName : null,
    ];
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

function web_runtime_redirect(string $path): void
{
    http_response_code(303);
    header('Location: ' . $path);
}
