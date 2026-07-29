<?php

declare(strict_types=1);

/*
 * Web runtime shell for the World Dataset.
 *
 * Web projects the World environment into a browser: Field remains the
 * world-anchored layer, Workspace is the transient current-intent layer, and
 * Carry remains the member-following layer for selected objects and controls.
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
    'continuity-reconciler.js',
    'scene-model.js',
    'adapter-registry.js',
    'adapters/paint-editor.js',
    'web-renderer.js',
    'web-runtime.js',
];
$pageDescription = 'A web runtime projection of canonical World Datasets.';
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

            <form class="query-composer" data-runtime-query-form role="search">
                <label class="visually-hidden" for="runtime-query">World query</label>
                <div class="query-composer__field">
                    <input
                        id="runtime-query"
                        class="query-composer__input"
                        data-runtime-query-input
                        type="search"
                        name="query"
                        autocomplete="off"
                        spellcheck="true"
                        placeholder="Ask or search"
                    >
                    <button
                        class="query-composer__voice"
                        data-runtime-voice
                        type="button"
                        aria-label="Start voice input"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"></path>
                            <path d="M5 11a7 7 0 0 0 14 0"></path>
                            <path d="M12 18v3"></path>
                            <path d="M8 21h8"></path>
                        </svg>
                    </button>
                </div>
            </form>

            <div class="carry-panel-stage" data-runtime-carry-panels></div>

            <section class="workspace-layer" aria-label="Workspace" data-layer-zone="workspace:workspace"></section>

            <div class="runtime-session" data-runtime-session></div>
        </section>

        <noscript>
            <section class="noscript-runtime" aria-labelledby="noscript-heading">
                <h2 id="noscript-heading">World Dataset</h2>
                <?php if (is_array($fallbackDataset)): ?>
                    <p>
                        Server-rendered fallback for
                        <?= htmlspecialchars((string) ($fallbackDataset['id'] ?? 'runtime session'), ENT_QUOTES, 'UTF-8') ?>.
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
    foreach (($dataset['objects'] ?? []) as $object) {
        if (is_array($object) && is_string($object['id'] ?? null)) {
            $objects[$object['id']] = [
                'title' => (string) ($object['name'] ?? $object['title'] ?? 'Object'),
                'type' => (string) ($object['type'] ?? 'object'),
            ];
        }
    }

    $collections = [];
    foreach (($dataset['collections'] ?? []) as $collection) {
        if (!is_array($collection)) {
            continue;
        }
        $content = is_array($collection['content'] ?? null) ? $collection['content'] : [];
        $items = [];
        foreach (($content['items'] ?? []) as $item) {
            $objectId = is_string($item) ? $item : (is_array($item) ? (string) ($item['object_id'] ?? $item['object'] ?? $item['id'] ?? '') : '');
            if (isset($objects[$objectId])) {
                $items[] = $objects[$objectId];
            }
        }
        $collections[] = [
            'title' => (string) ($content['name'] ?? 'Collection'),
            'summary' => (string) ($content['description'] ?? ''),
            'objects' => $items,
        ];
    }

    return $collections;
}
