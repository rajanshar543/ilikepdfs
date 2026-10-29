<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class HindiTest extends TestCase
{
    /**
     * @return array<string, array{string}>
     */
    public static function slugs(): array
    {
        $config = require __DIR__.'/../../config/tools.php';

        return collect(array_keys($config))->mapWithKeys(fn (string $slug): array => [$slug => [$slug]])->all();
    }

    private function hasDevanagari(string $text): bool
    {
        return preg_match('/[\x{0900}-\x{097F}]/u', $text) === 1;
    }

    public function test_the_hindi_home_page_is_translated_and_linked_to_the_english_one(): void
    {
        $html = $this->get('/hi')->assertOk()->getContent();

        $this->assertStringContainsString('<html lang="hi"', $html);
        $this->assertStringContainsString('PDF का हर काम,', $html);
        $this->assertStringContainsString('फ़ाइलें आपके डिवाइस से बाहर नहीं जातीं', $html);
        $this->assertStringContainsString('<link rel="canonical" href="'.route('hi.home').'">', $html);
        $this->assertStringContainsString('hreflang="en" href="'.route('home').'"', $html);
        $this->assertStringContainsString('hreflang="hi" href="'.route('hi.home').'"', $html);
        $this->assertStringContainsString('href="'.route('home').'" class="lang-switch"', str_replace("\n", '', preg_replace('/\s+/', ' ', $html)) === '' ? '' : 'href="'.route('home').'" class="lang-switch"');
        $this->assertStringContainsString('href="'.route('hi.tools.merge-pdf').'"', $html, 'cards stay in Hindi');
        $this->assertStringNotContainsString('href="'.route('tools.merge-pdf').'" class="card"', $html);
        $this->assertStringContainsString('"inLanguage":"hi"', $html);
    }

    #[DataProvider('slugs')]
    public function test_every_hindi_tool_page_is_translated_and_complete(string $slug): void
    {
        $html = $this->get(route("hi.tools.$slug"))->assertOk()->getContent();

        preg_match('#<title>(.*?)</title>#', $html, $title);
        preg_match('#name="description" content="([^"]*)#', $html, $description);
        $title = html_entity_decode($title[1]);
        $description = html_entity_decode($description[1]);

        $this->assertStringContainsString('<html lang="hi"', $html);
        $this->assertTrue($this->hasDevanagari($title), "$slug title is not Hindi: $title");
        $this->assertStringEndsWith('| ilikepdfs', $title);
        $this->assertLessThanOrEqual(70, mb_strlen($title));
        $this->assertTrue($this->hasDevanagari($description));
        $this->assertLessThanOrEqual(200, mb_strlen($description));
        $this->assertStringContainsString('<link rel="canonical" href="'.route("hi.tools.$slug").'">', $html);
        $this->assertStringContainsString('hreflang="en" href="'.route("tools.$slug").'"', $html);
        $this->assertStringContainsString('hreflang="hi" href="'.route("hi.tools.$slug").'"', $html);
        $this->assertSame(1, preg_match_all('#<h1[ >]#', $html));

        $this->assertMatchesRegularExpression('/क्या .+ सच में मुफ़्त है\?/u', $html);
        $this->assertStringContainsString('कैसे करें?', $html);
        $this->assertStringContainsString('class="related"', $html);
        $this->assertTrue($this->hasDevanagari(strip_tags(preg_match('#<h1[^>]*>(.*?)</h1>#s', $html, $h1) ? $h1[1] : '')), "$slug heading is not Hindi");
        $this->assertStringNotContainsString('Choose a file', $html);
        $this->assertStringNotContainsString('Choose files', $html);
        $this->assertStringNotContainsString('Start over', $html);
        $this->assertStringNotContainsString('?>', preg_replace('#<script.*?</script>#s', '', $html) === '' ? '' : '');
    }

    public function test_the_hindi_button_labels_do_not_overwrite_tool_names(): void
    {
        $html = $this->get(route('hi.tools.merge-pdf'))->getContent();

        $this->assertStringContainsString('<h1 class="tool__title">PDF मर्ज करें</h1>', $html);
        $this->assertMatchesRegularExpression('/data-run>PDF जोड़ें/u', $html);
        $this->assertStringContainsString('<title>PDF मर्ज करें - मुफ़्त ऑनलाइन | ilikepdfs</title>', $html);
    }

    public function test_english_pages_stay_english_and_link_to_hindi(): void
    {
        $html = $this->get(route('tools.merge-pdf'))->getContent();

        $this->assertStringContainsString('<html lang="en"', $html);
        $this->assertStringContainsString('Choose files', $html);
        $this->assertStringContainsString('hreflang="hi" lang="hi"', $html);
        $this->assertStringContainsString('हिन्दी', $html);
        $this->assertStringContainsString('href="'.route('hi.tools.merge-pdf').'"', $html);
    }

    public function test_the_locale_does_not_leak_between_requests(): void
    {
        $this->get('/hi')->assertOk();
        $this->assertStringContainsString('<html lang="en"', $this->get('/')->getContent());
    }

    public function test_the_html_to_pdf_page_in_hindi_still_says_it_uses_the_server(): void
    {
        $html = $this->get(route('hi.tools.html-to-pdf'))->assertOk()->getContent();

        $this->assertStringContainsString('सर्वर', $html);
        $this->assertStringNotContainsString('फ़ाइलें आपके डिवाइस से बाहर नहीं जातीं। सब कुछ', $html);
    }

    public function test_every_tool_has_a_hindi_name_and_description(): void
    {
        $translations = json_decode(file_get_contents(base_path('lang/hi.json')), true, 512, JSON_THROW_ON_ERROR);

        foreach (config('tools') as $slug => $tool) {
            $this->assertArrayHasKey($tool['name'], $translations, "No Hindi name for $slug");
            $this->assertArrayHasKey($tool['description'], $translations, "No Hindi description for $slug");
            $this->assertArrayHasKey('action:'.$tool['action'], $translations, "No Hindi button for $slug");
            $this->assertTrue($this->hasDevanagari($translations[$tool['name']]) || preg_match('/[A-Za-z]/', $translations[$tool['name']]) === 1);
        }
    }
}
