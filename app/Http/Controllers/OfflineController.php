<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;

/**
 * Tells the service worker what to keep for offline use: every page, plus the
 * scripts, styles, fonts and engines the tools need.
 */
class OfflineController extends Controller
{
    /** Bigger, rarely needed language files are saved the first time they are used instead. */
    private const OPTIONAL = ['#/vendor/tesseract/lang/(?!eng|hin)#'];

    public function assets(): JsonResponse
    {
        $slugs = collect(config('tools'))->keys();
        $pages = collect(['/', '/about', '/privacy', '/terms', '/contact', '/hi'])
            ->merge($slugs->map(fn (string $slug): string => '/'.$slug))
            ->merge($slugs->map(fn (string $slug): string => '/hi/'.$slug))
            ->all();

        $assets = $this->files(public_path('build'), '/build')
            ->merge($this->files(public_path('vendor'), '/vendor'))
            ->reject(fn (string $url): bool => $this->isOptional($url))
            ->merge(['/favicon.svg', '/og-default.png'])
            ->values()
            ->all();

        return response()->json([
            'version' => substr(sha1(json_encode([$assets, $pages])), 0, 12),
            'pages' => $pages,
            'assets' => $assets,
        ])->header('Cache-Control', 'no-cache');
    }

    public function manifest(): JsonResponse
    {
        return response()->json([
            'name' => config('seo.site.name').' - Free PDF & image tools',
            'short_name' => config('seo.site.name'),
            'description' => config('seo.site.tagline'),
            'start_url' => '/',
            'scope' => '/',
            'display' => 'standalone',
            'background_color' => '#ffffff',
            'theme_color' => '#2563eb',
            'icons' => [
                ['src' => '/icons/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => '/icons/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => '/icons/icon-maskable-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
            ],
        ], 200, ['Content-Type' => 'application/manifest+json']);
    }

    /**
     * @return Collection<int, string>
     */
    private function files(string $directory, string $prefix)
    {
        if (! File::isDirectory($directory)) {
            return collect();
        }

        return collect(File::allFiles($directory))
            ->map(fn (\SplFileInfo $file): string => $prefix.'/'.str_replace(DIRECTORY_SEPARATOR, '/', $file->getRelativePathname()))
            ->reject(fn (string $url): bool => str_ends_with($url, '.map') || str_ends_with($url, '/.vite/manifest.json') || str_ends_with($url, '.DS_Store'))
            ->sort()
            ->values();
    }

    private function isOptional(string $url): bool
    {
        foreach (self::OPTIONAL as $pattern) {
            if (preg_match($pattern, $url) === 1) {
                return true;
            }
        }

        return false;
    }
}
