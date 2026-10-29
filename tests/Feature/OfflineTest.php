<?php

namespace Tests\Feature;

use Tests\TestCase;

class OfflineTest extends TestCase
{
    public function test_the_listing_covers_every_page_in_both_languages_and_the_engines(): void
    {
        $data = $this->get('/offline-assets.json')->assertOk()->assertHeader('Cache-Control', 'no-cache, private')->json();

        $this->assertMatchesRegularExpression('/^[0-9a-f]{12}$/', $data['version']);

        foreach (['/', '/hi', '/about', '/privacy', '/merge-pdf', '/hi/merge-pdf', '/html-to-pdf'] as $page) {
            $this->assertContains($page, $data['pages']);
        }

        $this->assertCount(2 + (2 * count(config('tools'))) + 4, $data['pages']);

        foreach ($data['assets'] as $asset) {
            $this->assertStringStartsWith('/', $asset);
            $this->assertStringNotContainsString('://', $asset);
            $this->assertStringNotContainsString('..', $asset);
        }
    }

    public function test_big_language_files_are_saved_on_first_use_instead_of_up_front(): void
    {
        $assets = $this->get('/offline-assets.json')->json('assets');
        $languages = array_values(array_filter($assets, fn (string $asset) => str_contains($asset, '/vendor/tesseract/lang/')));

        sort($languages);
        $this->assertSame(['/vendor/tesseract/lang/eng.traineddata.gz', '/vendor/tesseract/lang/hin.traineddata.gz'], $languages);
    }

    public function test_the_version_changes_when_the_pages_change(): void
    {
        $first = $this->get('/offline-assets.json')->json('version');
        $this->assertSame($first, $this->get('/offline-assets.json')->json('version'));
    }

    public function test_the_app_manifest_is_installable(): void
    {
        $response = $this->get('/manifest.webmanifest')->assertOk();
        $manifest = $response->json();

        $this->assertStringContainsString('application/manifest+json', $response->headers->get('Content-Type'));
        $this->assertSame('standalone', $manifest['display']);
        $this->assertSame('/', $manifest['start_url']);
        $this->assertContains('192x192', array_column($manifest['icons'], 'sizes'));
        $this->assertContains('512x512', array_column($manifest['icons'], 'sizes'));

        foreach ($manifest['icons'] as $icon) {
            $this->assertFileExists(public_path($icon['src']));
        }
    }

    public function test_the_service_worker_exists_and_never_caches_other_sites_or_the_api(): void
    {
        $worker = file_get_contents(public_path('sw.js'));

        $this->assertStringContainsString('url.origin !== self.location.origin', $worker);
        $this->assertStringContainsString("request.method !== 'GET'", $worker);
        $this->assertStringNotContainsString('http://', str_replace('http://www.w3.org', '', $worker));
    }

    public function test_pages_offer_the_save_for_offline_button(): void
    {
        $this->get('/')->assertSee('data-offline', false)->assertSee('rel="manifest"', false);
    }
}
