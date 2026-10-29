<?php

namespace Tests\Feature;

use Tests\TestCase;

class LegalPagesTest extends TestCase
{
    public function test_the_privacy_policy_tells_the_truth_about_what_the_site_does(): void
    {
        $html = $this->get(route('privacy'))->assertOk()->getContent();

        // Every cookie and storage key the site really uses is disclosed.
        $this->assertStringContainsString(config('session.cookie'), $html);
        $this->assertStringContainsString('XSRF-TOKEN', $html);
        $this->assertStringContainsString('ilikepdfs:theme', $html);
        $this->assertStringContainsString('ilikepdfs:options:', $html);
        $this->assertStringContainsString('Save for offline use', $html);

        // The server tool, server logs and sessions are explained.
        $this->assertStringContainsString('HTML to PDF', $html);
        $this->assertStringContainsString('does not store it', $html);
        $this->assertStringContainsString('IP address', $html);
        $this->assertStringContainsString('about 2 hours', $html);

        // Promises that match the code.
        $this->assertStringContainsString('no analytics', mb_strtolower($html));
        $this->assertStringContainsString('Your rights', $html);
        $this->assertStringContainsString('Digital Personal Data Protection Act', $html);
        $this->assertStringContainsString('GDPR', $html);
        $this->assertStringContainsString('Last updated:', $html);
        $this->assertSame(1, preg_match_all('#<h1[ >]#', $html));
    }

    public function test_the_policy_matches_the_real_session_settings(): void
    {
        $this->assertSame(120, (int) config('session.lifetime'), 'The policy says about 2 hours; update it if the session lifetime changes.');
    }

    public function test_the_site_really_sets_only_the_disclosed_cookies_and_loads_nothing_from_others(): void
    {
        $response = $this->get('/')->assertOk();
        $names = collect($response->headers->getCookies())->map(fn ($cookie) => $cookie->getName())->sort()->values()->all();

        $this->assertEquals(collect([config('session.cookie'), 'XSRF-TOKEN'])->sort()->values()->all(), $names);
        $this->assertDoesNotMatchRegularExpression('/(src|href)="https?:\/\/(?!localhost)/', $response->getContent());
        $this->assertStringNotContainsString('googletagmanager', $response->getContent());
        $this->assertStringNotContainsString('google-analytics', $response->getContent());
    }

    public function test_the_terms_cover_the_important_limits(): void
    {
        $html = $this->get(route('terms'))->assertOk()->getContent();

        foreach (['Your files', 'Check your results', 'Acceptable use', 'No warranty', 'Limit of liability', 'legal, financial or professional advice', 'Unlock PDF only removes a password you already know', 'not a certificate-based digital signature'] as $text) {
            $this->assertStringContainsString($text, $html);
        }

        $this->assertStringContainsString(route('privacy'), $html);
        $this->assertSame(1, preg_match_all('#<h1[ >]#', $html));
    }

    public function test_contact_details_are_shown_only_when_set(): void
    {
        config(['site.email' => null, 'site.owner' => null, 'site.country' => null]);
        $this->get(route('contact'))->assertOk()->assertSee('Contact details are being set up');
        $this->get(route('privacy'))->assertOk()->assertDontSee('mailto:');
        $this->get(route('terms'))->assertOk()->assertDontSee('Governing law');

        config(['site.email' => 'hello@example.com', 'site.owner' => 'A. Owner', 'site.country' => 'India']);
        $this->get(route('contact'))->assertOk()->assertSee('mailto:hello@example.com', false)->assertSee('A. Owner');
        $this->get(route('privacy'))->assertSee('mailto:hello@example.com', false)->assertSee('run by A. Owner');
        $this->get(route('terms'))->assertSee('Governing law')->assertSee('laws of India');
        $this->get(route('about'))->assertSee('Who runs it?');
    }

    public function test_the_contact_email_cannot_inject_markup(): void
    {
        config(['site.email' => '"><script>alert(1)</script>', 'site.owner' => '<b>x</b>']);

        $html = $this->get(route('contact'))->getContent();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $html);
        $this->assertStringNotContainsString('<b>x</b>', $html);
    }

    public function test_the_about_page_credits_the_open_source_it_uses(): void
    {
        $html = $this->get(route('about'))->assertOk()->getContent();

        foreach (['pdf-lib', 'PDF.js', 'Tesseract.js', 'libheif-js', 'Dompdf', 'LGPL', 'Apache-2.0', 'MIT'] as $text) {
            $this->assertStringContainsString($text, $html);
        }

        $this->assertStringContainsString('id="credits"', $html);
    }

    public function test_every_page_links_to_the_legal_pages(): void
    {
        foreach (['/', '/hi', '/merge-pdf', '/hi/merge-pdf'] as $path) {
            $html = $this->get($path)->getContent();

            $this->assertStringContainsString('href="'.route('privacy').'"', $html, "$path has no privacy link");
            $this->assertStringContainsString('href="'.route('terms').'"', $html, "$path has no terms link");
            $this->assertStringContainsString('href="'.route('contact').'"', $html, "$path has no contact link");
        }
    }

    public function test_the_legal_pages_are_indexable_and_in_the_sitemap(): void
    {
        foreach (['privacy', 'terms', 'contact', 'about'] as $name) {
            $this->get(route($name))->assertOk()->assertSee('index, follow', false);
            $this->assertStringContainsString(route($name), $this->get('/sitemap.xml')->getContent());
        }
    }
}
