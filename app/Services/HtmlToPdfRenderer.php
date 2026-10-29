<?php

namespace App\Services;

use App\Exceptions\PageTooLargeException;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\File;

/**
 * Turns HTML into a PDF with Dompdf, locked down: no remote files, no PHP, no
 * scripts, and no access to the server's files.
 */
class HtmlToPdfRenderer
{
    /** What Dompdf is given, after cleaning. Larger pages take too long to lay out. */
    public const MAX_CHARS = 3_000_000;

    private const MARGINS = ['none' => '0', 'small' => '12mm', 'normal' => '20mm'];

    /**
     * @param  array{pageSize?: string, orientation?: string, margin?: string}  $options
     */
    public function render(string $html, array $options = []): string
    {
        File::ensureDirectoryExists(storage_path('app/dompdf'));

        $html = app(HtmlCleaner::class)->clean($html);

        if (strlen($html) > self::MAX_CHARS) {
            throw new PageTooLargeException('This page is still too large after removing scripts and icons. Paste only the part you need.');
        }

        $dompdf = new Dompdf($this->secureOptions());

        $margin = self::MARGINS[$options['margin'] ?? 'normal'] ?? self::MARGINS['normal'];
        $html = $this->withPageRules($html, $margin);

        $dompdf->loadHtml($html, 'UTF-8');
        $dompdf->setPaper($options['pageSize'] ?? 'a4', $options['orientation'] ?? 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }

    public function secureOptions(): Options
    {
        $options = new Options;
        $options->set('isRemoteEnabled', false);
        $options->set('isPhpEnabled', false);
        $options->set('isJavascriptEnabled', false);
        $options->set('isHtml5ParserEnabled', true);
        $options->set('chroot', [storage_path('app/dompdf')]);
        $options->set('allowedProtocols', ['data://' => ['rules' => []]]);
        $options->set('tempDir', storage_path('app/dompdf'));
        $options->set('defaultFont', 'DejaVu Sans');

        return $options;
    }

    private function withPageRules(string $html, string $margin): string
    {
        $rule = "<style>@page { margin: {$margin}; }</style>";

        return preg_match('/<head[^>]*>/i', $html) === 1
            ? preg_replace('/<head[^>]*>/i', '$0'.$rule, $html, 1)
            : $rule.$html;
    }
}
