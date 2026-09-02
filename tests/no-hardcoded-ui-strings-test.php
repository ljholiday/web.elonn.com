<?php

declare(strict_types=1);

/*
 * Mechanical, exceptionless scan for hardcoded display content in the runtime-kit.
 * Modeled on Android Studio's hardcoded-string lint: a fixed, closed list of display
 * sinks (checked into this file), and every literal string reaching one is flagged
 * unconditionally - no per-hit judgment about "is this content or chrome" at scan
 * time. The one human decision is the sink list itself, reviewed here as a whole.
 *
 * Ships with zero entries in $allowlist. An allowlist line is only ever added for a
 * literal that is provably not member-facing language (e.g. a bare symbol used as a
 * glyph, not a word) - never as a way to defer a real violation. Every entry is a
 * single visible, checked-in line naming the exact file and pattern, so it stays
 * debt to burn down rather than a silent carve-out.
 */

$root = dirname(__DIR__);
$template = read_file($root . '/templates/runtime.php');

/** @var array<int, string> $files */
$files = [];
foreach (runtime_scripts($template) as $script) {
    $files[] = $root . '/public/assets/js/runtime-kit/' . $script;
}

$sinks = [
    'textContent assignment' => '/\.textContent\s*=\s*([\'"])((?:(?!\1).)+)\1/',
    'placeholder assignment' => '/\.placeholder\s*=\s*([\'"])((?:(?!\1).)+)\1/',
    'setAttribute(aria-label|title|alt, ...)' => '/\.setAttribute\(\s*[\'"](?:aria-label|title|alt)[\'"]\s*,\s*([\'"])((?:(?!\1).)+)\1/',
    'label:/title:/ariaLabel: object literal key' => '/\b(?:label|title|ariaLabel)\s*:\s*([\'"])((?:(?!\1).)+)\1/',
    'common.text(x, default) fallback literal' => '/common\.text\(\s*[^,()]+,\s*([\'"])((?:(?!\1).)+)\1\s*\)/',
    'renderer.status(...) literal' => '/renderer\.status\(\s*([\'"])((?:(?!\1).)+)\1/',
];

/**
 * Single, visible, checked-in escape hatch - not a silent carve-out. Empty by design;
 * see the file header. Each entry: 'relative/path.js' => ['exact literal', ...].
 *
 * @var array<string, array<int, string>>
 */
$allowlist = [
    // Bare glyphs used as icons on the window chrome, not words: the back chevron and the
    // "pull this into its own window" target marker.
    'public/assets/js/runtime-kit/web-renderer.js' => ['‹', '⧉'],
];

/** @var array<int, string> $violations */
$violations = [];

foreach ($files as $path) {
    $relative = str_replace($root . '/', '', $path);
    $contents = read_file($path);
    if ($contents === '') {
        continue;
    }
    $lines = explode("\n", $contents);
    foreach ($lines as $lineNumber => $line) {
        foreach ($sinks as $sinkName => $pattern) {
            if (preg_match_all($pattern, $line, $matches, PREG_SET_ORDER) === false || $matches === []) {
                continue;
            }
            foreach ($matches as $match) {
                $literal = $match[2];
                $allowed = in_array($literal, $allowlist[$relative] ?? [], true);
                if (!$allowed) {
                    $violations[] = sprintf(
                        '%s:%d [%s] hardcoded literal "%s"',
                        $relative,
                        $lineNumber + 1,
                        $sinkName,
                        $literal
                    );
                }
            }
        }
    }
}

world_assert($violations === [], "Hardcoded UI string(s) found:\n" . implode("\n", $violations));

echo "no-hardcoded-ui-strings-test passed (" . count($files) . " files scanned, " . count($violations) . " hits)\n";

function read_file(string $path): string
{
    $contents = file_get_contents($path);
    return is_string($contents) ? $contents : '';
}

function world_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "Assertion failed: {$message}\n");
        exit(1);
    }
}

/**
 * @return array<int, string>
 */
function runtime_scripts(string $template): array
{
    if (preg_match('/\\$scripts\\s*=\\s*\\[(.*?)\\];/s', $template, $matches) !== 1) {
        return [];
    }

    preg_match_all("/'([^']+\\.js)'/", $matches[1], $scriptMatches);
    return $scriptMatches[1] ?? [];
}
