<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class SeoTest extends TestCase
{
    /**
     * @return array<string, array{string}>
     */
    public static function slugs(): array
    {
        $config = require __DIR__.'/../../config/tools.php';

        return collect(array_keys($config))->mapWithKeys(fn (string $slug): array => [$slug => [$slug]])->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function schemas(string $html): array
    {
        preg_match_all('#<script type="application/ld\+json">(.*?)</script>#s', $html, $matches);

        return array_map(fn (string $json): array => json_decode($json, true, 512, JSON_THROW_ON_ERROR), $matches[1]);
    }

    private function meta(string $html, string $attribute, string $name): ?string
    {
        preg_match('#<meta '.$attribute.'="'.preg_quote($name, '#').'" content="([^"]*)"#', $html, $match);

        return isset($match[1]) ? html_entity_decode($match[1]) : null;
    }

    #[DataProvider('slugs')]
    public function test_every_tool_page_has_complete_search_tags(string $slug): void
    {
        $html = $this->get(route("tools.$slug"))->assertOk()->getContent();

        preg_match('#<title>(.*?)</title>#', $html, $title);
        $title = html_entity_decode($title[1]);
        $description = $this->meta($html, 'name', 'description');

        $this->assertLessThanOrEqual(60, mb_strlen($title), "Title too long for $slug: $title");
        $this->assertGreaterThanOrEqual(30, mb_strlen($title));
        $this->assertStringContainsString(config("tools.$slug.name"), $title);
        $this->assertGreaterThanOrEqual(100, mb_strlen($description), "Description too short for $slug");
        $this->assertLessThanOrEqual(160, mb_strlen($description), "Description too long for $slug");

        $this->assertStringContainsString('<link rel="canonical" href="'.route("tools.$slug").'">', $html);
        $this->assertStringContainsString('index, follow', $html);
        $this->assertSame($title, $this->meta($html, 'property', 'og:title'));
        $this->assertSame($description, $this->meta($html, 'property', 'og:description'));
        $this->assertSame(route("tools.$slug"), $this->meta($html, 'property', 'og:url'));
        $this->assertSame(asset('og-default.png'), $this->meta($html, 'property', 'og:image'));
        $this->assertSame('summary_large_image', $this->meta($html, 'name', 'twitter:card'));
        $this->assertSame(1, preg_match_all('#<h1[ >]#', $html), "$slug must have exactly one h1");
    }

    #[DataProvider('slugs')]
    public function test_every_tool_page_has_valid_structured_data_and_answers(string $slug): void
    {
        $html = $this->get(route("tools.$slug"))->assertOk()->getContent();
        $schemas = collect($this->schemas($html))->keyBy('@type');

        $this->assertEqualsCanonicalizing(['WebApplication', 'BreadcrumbList', 'FAQPage', 'HowTo'], $schemas->keys()->all());
        $this->assertTrue($schemas['WebApplication']['isAccessibleForFree']);
        $this->assertSame('0', $schemas['WebApplication']['offers']['price']);
        $this->assertCount(3, $schemas['BreadcrumbList']['itemListElement']);
        $this->assertGreaterThanOrEqual(5, count($schemas['FAQPage']['mainEntity']));
        $this->assertCount(3, $schemas['HowTo']['step']);
        $this->assertArrayNotHasKey('aggregateRating', $schemas['WebApplication'], 'No made-up ratings');

        $this->assertStringContainsString('What is '.e(config("tools.$slug.name")).'?', $html);
        $this->assertStringContainsString('kaise kare', $html);
        $this->assertStringContainsString('class="related"', $html);
        $this->assertGreaterThanOrEqual(5, substr_count($html, 'href="'.url('/'), 0));
    }

    public function test_titles_and_descriptions_are_unique_across_tools(): void
    {
        $titles = [];
        $descriptions = [];

        foreach (array_keys(config('tools')) as $slug) {
            $html = $this->get(route("tools.$slug"))->getContent();
            preg_match('#<title>(.*?)</title>#', $html, $title);
            $titles[] = $title[1];
            $descriptions[] = $this->meta($html, 'name', 'description');
        }

        $this->assertSame($titles, array_values(array_unique($titles)));
        $this->assertSame($descriptions, array_values(array_unique($descriptions)));
    }

    public function test_the_home_page_is_optimised(): void
    {
        $html = $this->get('/')->assertOk()->getContent();

        preg_match('#<title>(.*?)</title>#', $html, $title);
        $this->assertLessThanOrEqual(60, mb_strlen(html_entity_decode($title[1])));
        $this->assertGreaterThanOrEqual(120, mb_strlen($this->meta($html, 'name', 'description')));
        $this->assertLessThanOrEqual(160, mb_strlen($this->meta($html, 'name', 'description')));
        $this->assertSame(1, preg_match_all('#<h1[ >]#', $html));

        $types = array_column($this->schemas($html), '@type');
        $this->assertEqualsCanonicalizing(['WebSite', 'Organization', 'ItemList', 'FAQPage'], $types);
        $list = collect($this->schemas($html))->firstWhere('@type', 'ItemList');
        $this->assertSame(count(config('tools')), $list['numberOfItems']);
        $this->assertStringContainsString('What can you do with ilikepdfs?', $html);
    }

    public function test_the_sitemap_lists_every_page_once_in_both_languages_with_alternates(): void
    {
        $response = $this->get('/sitemap.xml')->assertOk();
        $this->assertStringContainsString('application/xml', $response->headers->get('Content-Type'));

        $xml = simplexml_load_string($response->getContent());
        $xml->registerXPathNamespace('x', 'http://www.sitemaps.org/schemas/sitemap/0.9');
        $urls = [];

        foreach ($xml->url as $entry) {
            $urls[] = (string) $entry->loc;
            $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', (string) $entry->lastmod);
        }

        $slugs = array_keys(config('tools'));
        $expected = array_merge(
            [route('home'), route('hi.home')],
            array_map(fn (string $slug) => route("tools.$slug"), $slugs),
            array_map(fn (string $slug) => route("hi.tools.$slug"), $slugs),
            [route('about'), route('privacy'), route('terms'), route('contact')],
        );

        $this->assertEqualsCanonicalizing($expected, $urls);
        $this->assertSame($urls, array_values(array_unique($urls)));
        $this->assertSame(2 * (count($slugs) + 1) + 4, count($urls));
        $this->assertStringContainsString('hreflang="hi" href="'.route('hi.tools.merge-pdf').'"', $response->getContent());
        $this->assertStringContainsString('hreflang="x-default" href="'.route('tools.merge-pdf').'"', $response->getContent());
    }

    public function test_robots_allows_crawling_and_points_to_the_sitemap(): void
    {
        $body = $this->get('/robots.txt')->assertOk()->getContent();

        $this->assertStringContainsString('User-agent: *', $body);
        $this->assertStringContainsString('Allow: /', $body);
        $this->assertStringNotContainsString('Disallow: /', $body);
        $this->assertStringContainsString('Sitemap: '.url('sitemap.xml'), $body);
        $this->assertFileDoesNotExist(public_path('robots.txt'));
    }

    public function test_about_and_privacy_pages_exist_and_are_honest_about_the_server_tool(): void
    {
        $this->get(route('about'))->assertOk()->assertSee('Only HTML to PDF', false)->assertSee('About ilikepdfs');
        $this->get(route('privacy'))->assertOk()->assertSee('HTML to PDF', false)->assertSee('does not store it', false);
    }

    public function test_no_competitor_brand_or_hidden_keywords_appear_anywhere(): void
    {
        $pages = ['/', '/hi', '/about', '/privacy', '/terms', '/contact', '/sitemap.xml', '/robots.txt', '/offline-assets.json', '/manifest.webmanifest'];

        foreach (array_keys(config('tools')) as $slug) {
            $pages[] = route("tools.$slug", [], false);
            $pages[] = route("hi.tools.$slug", [], false);
        }

        foreach ($pages as $page) {
            $body = mb_strtolower($this->get($page)->getContent());

            $this->assertStringNotContainsString('ilovepdf', $body, "$page mentions a competitor brand");
            $this->assertStringNotContainsString('i love pdf', $body, "$page mentions a competitor brand");
            $this->assertStringNotContainsString('<meta name="keywords"', $body, "$page uses the obsolete keywords tag");
            $this->assertDoesNotMatchRegularExpression('/display:\s*none|visibility:\s*hidden|font-size:\s*0/', $body, "$page hides text");
            $this->assertStringNotContainsString('ilove', str_replace('failover', '', $body), "$page mentions a competitor brand");
        }

        $this->assertStringNotContainsString('ilovepdf', mb_strtolower((string) file_get_contents(config_path('seo.php'))));
    }
}
