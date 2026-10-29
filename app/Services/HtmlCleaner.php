<?php

namespace App\Services;

/**
 * Removes the parts of a web page that a PDF never needs but that make real
 * pages huge: scripts, embedded frames, comments, inline SVG icons and giant
 * inline pictures.
 */
class HtmlCleaner
{
    /** Data pictures longer than this are dropped from the page. */
    private const MAX_DATA_URI = 300_000;

    public function clean(string $html): string
    {
        $steps = [
            '#<script\b[^>]*>.*?</script\s*>#is' => '',
            '#<noscript\b[^>]*>.*?</noscript\s*>#is' => '',
            '#<iframe\b[^>]*>.*?</iframe\s*>#is' => '',
            '#<svg\b[^>]*>.*?</svg\s*>#is' => '',
            '#<!--(?!\[if).*?-->#s' => '',
            '#<(?:link|meta)\b[^>]*>#i' => '',
        ];

        foreach ($steps as $pattern => $replacement) {
            $result = preg_replace($pattern, $replacement, $html);

            // preg_* returns null when a pattern hits PCRE limits; keep what we had.
            $html = $result ?? $html;
        }

        $result = preg_replace_callback(
            '#\bsrc\s*=\s*(["\'])(data:[^"\']*)\1#i',
            fn (array $match): string => strlen($match[2]) > self::MAX_DATA_URI ? 'src=""' : $match[0],
            $html,
        );

        return $result ?? $html;
    }
}
