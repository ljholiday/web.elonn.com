<?php

declare(strict_types=1);

/*
 * Web runtime login shell.
 *
 * The web runtime owns this browser login surface. Submitted credentials are
 * exchanged only with the API identity authority, then the runtime continues
 * with the issued auth token.
 */
/** @var array{environment:string, debug:bool, url:string} $app */
/** @var array{base_url:string} $api */
/** @var array{base_url:string} $world */
/** @var string $title */
/** @var string|null $error */
/** @var array<string, string> $old */
$assetVersion = (string) filemtime(BASE_PATH . '/public/assets/css/runtime.css');
$email = $old['email'] ?? '';
$pageDescription = 'Runtime-owned login for Elonn Web.';
$pageUrl = rtrim($app['url'], '/') . '/login';
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>
    <meta name="description" content="<?= htmlspecialchars($pageDescription, ENT_QUOTES, 'UTF-8') ?>">
    <meta property="og:site_name" content="Elonn">
    <meta property="og:type" content="website">
    <meta property="og:title" content="<?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?>">
    <meta property="og:description" content="<?= htmlspecialchars($pageDescription, ENT_QUOTES, 'UTF-8') ?>">
    <meta property="og:url" content="<?= htmlspecialchars($pageUrl, ENT_QUOTES, 'UTF-8') ?>">
    <link rel="stylesheet" href="/assets/css/runtime.css?v=<?= htmlspecialchars($assetVersion, ENT_QUOTES, 'UTF-8') ?>">
</head>
<body>
    <main class="runtime-login" aria-labelledby="runtime-login-title">
        <div class="runtime-login__field" aria-hidden="true">
            <div class="field-projection__sky"></div>
            <div class="field-projection__grid"></div>
            <div class="field-projection__horizon"></div>
            <div class="field-projection__north"><span>N</span></div>
        </div>

        <section class="runtime-login__panel">
            <p class="runtime-login__eyebrow">Elonn Web</p>
            <h1 id="runtime-login-title">Log in</h1>
            <p class="runtime-login__copy">Enter the web runtime with your Elonn identity.</p>
            <?php if ($error !== null): ?>
                <p class="runtime-login__error"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></p>
            <?php endif; ?>
            <form class="runtime-login__form" method="post" action="/login">
                <label>
                    <span>Email</span>
                    <input name="email" type="email" autocomplete="email" required value="<?= htmlspecialchars($email, ENT_QUOTES, 'UTF-8') ?>">
                </label>
                <label>
                    <span>Password</span>
                    <input name="password" type="password" autocomplete="current-password" required>
                </label>
                <button type="submit">Enter Web</button>
            </form>
        </section>
    </main>
</body>
</html>
