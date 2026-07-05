<?php

declare(strict_types=1);

/*
 * Web runtime shell for the World Dataset.
 *
 * Web projects the World environment into a browser: Field remains the
 * world-anchored layer, Carry remains the user-anchored workspace, and Findings
 * remain discovered user-anchored objects.
 */
/** @var array{base_url:string} $world */
/** @var array{environment:string, debug:bool, url:string} $app */
/** @var string $title */
/** @var array<string, mixed>|null $fallbackDataset */
$assetVersion = (string) filemtime(BASE_PATH . '/public/assets/css/runtime.css');
$scripts = [
    'common.js',
    'world-client.js',
    'dataset-parser.js',
    'state-indexer.js',
    'action-dispatcher.js',
    'continuity-reconciler.js',
    'scene-model.js',
    'web-renderer.js',
    'web-runtime.js',
];
$pageDescription = 'A web runtime projection of the canonical elonn.world.dataset v1 environment.';
$pageUrl = rtrim($app['url'], '/') . '/';
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
    <?php foreach ($scripts as $script): ?>
        <?php $scriptVersion = (string) filemtime(BASE_PATH . '/public/assets/js/runtime-kit/' . $script); ?>
        <script src="/assets/js/runtime-kit/<?= htmlspecialchars($script, ENT_QUOTES, 'UTF-8') ?>?v=<?= htmlspecialchars($scriptVersion, ENT_QUOTES, 'UTF-8') ?>" defer></script>
    <?php endforeach; ?>
</head>
<body>
    <main
        class="runtime-shell"
        data-world-runtime
        data-world-base-url="<?= htmlspecialchars($world['base_url'], ENT_QUOTES, 'UTF-8') ?>"
        data-runtime-name="web"
    >
        <h1 class="visually-hidden">Elonn Web Runtime</h1>

        <section class="runtime-workspace" aria-label="Elonn runtime workspace">
            <div class="field-projection" data-field-projection tabindex="0" aria-label="Field projection">
                <div class="field-projection__sky" aria-hidden="true"></div>
                <div class="field-projection__grid" aria-hidden="true"></div>
                <div class="field-projection__horizon" aria-hidden="true"></div>
                <div class="field-projection__north" aria-hidden="true"><span>N</span></div>
                <div class="field-projection__objects" data-layer-zone="field:field"></div>
                <p class="field-projection__status" data-runtime-status>Preparing runtime request.</p>
            </div>

            <div class="carry-top" aria-label="Carry top dock" data-layer-zone="carry:top_dock"></div>

            <aside class="carry-panel carry-panel--left" aria-label="Carry left panel" data-layer-zone="carry:left_panel"></aside>
            <aside class="carry-panel carry-panel--right" aria-label="Carry right panel" data-layer-zone="carry:right_panel"></aside>

            <section class="carry-focus" aria-label="Carry main content">
                <div class="carry-focus__context" data-layer-zone="carry:main_content"></div>
                <div data-runtime-focus></div>
                <div class="carry-actions" data-runtime-actions></div>
                <div data-runtime-action-result></div>
                <div class="carry-resources" data-runtime-resources></div>
                <div class="carry-related" data-runtime-related></div>
            </section>

            <section class="finding-overlay" aria-label="Findings" data-layer-zone="findings:findings"></section>

            <nav class="carry-bottom" aria-label="Carry bottom dock" data-layer-zone="carry:bottom_dock"></nav>

            <div class="runtime-session" data-runtime-session></div>
        </section>

        <noscript>
            <section class="noscript-runtime" aria-labelledby="noscript-heading">
                <h2 id="noscript-heading">World Dataset</h2>
                <?php if (is_array($fallbackDataset)): ?>
                    <p>
                        Server-rendered fallback for
                        <?= htmlspecialchars((string) ($fallbackDataset['dataset']['runtime_session_id'] ?? 'runtime session'), ENT_QUOTES, 'UTF-8') ?>.
                        World actions require an interactive runtime.
                    </p>
                    <?php foreach (web_runtime_fallback_collections($fallbackDataset) as $collection): ?>
                        <article class="fallback-collection">
                            <h3><?= htmlspecialchars($collection['title'], ENT_QUOTES, 'UTF-8') ?></h3>
                            <p><?= htmlspecialchars($collection['summary'], ENT_QUOTES, 'UTF-8') ?></p>
                            <ul>
                                <?php foreach ($collection['objects'] as $object): ?>
                                    <li>
                                        <strong><?= htmlspecialchars($object['title'], ENT_QUOTES, 'UTF-8') ?></strong>
                                        <span><?= htmlspecialchars($object['type'], ENT_QUOTES, 'UTF-8') ?></span>
                                    </li>
                                <?php endforeach; ?>
                            </ul>
                        </article>
                    <?php endforeach; ?>
                <?php else: ?>
                    <p>World Dataset fallback is unavailable. Runtime status is available at <a href="/ready">/ready</a>.</p>
                <?php endif; ?>
            </section>
        </noscript>
    </main>
</body>
</html>
<?php

/**
 * @param array<string, mixed> $dataset
 * @return array<int, array{title:string, summary:string, objects:array<int, array{title:string, type:string}>}>
 */
function web_runtime_fallback_collections(array $dataset): array
{
    $objects = [];
    foreach (($dataset['objects']['items'] ?? []) as $object) {
        if (is_array($object) && is_string($object['id'] ?? null)) {
            $objects[$object['id']] = [
                'title' => (string) ($object['title'] ?? 'Object'),
                'type' => (string) ($object['type'] ?? 'object'),
            ];
        }
    }

    $collections = [];
    foreach (($dataset['collections']['items'] ?? []) as $collection) {
        if (!is_array($collection)) {
            continue;
        }
        $items = [];
        foreach (($collection['items'] ?? []) as $item) {
            if (is_array($item) && isset($objects[(string) ($item['object_id'] ?? '')])) {
                $items[] = $objects[(string) $item['object_id']];
            }
        }
        $collections[] = [
            'title' => (string) ($collection['title'] ?? 'Collection'),
            'summary' => (string) ($collection['summary'] ?? ''),
            'objects' => $items,
        ];
    }

    return $collections;
}
