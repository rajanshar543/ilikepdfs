<?php

namespace Tests\Feature;

use Tests\TestCase;

class SecurityHeadersTest extends TestCase
{
    public function test_pages_send_hardening_headers(): void
    {
        $response = $this->get(route('tools.merge-pdf'))->assertOk();

        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('X-Frame-Options', 'DENY');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->assertHeader('Cross-Origin-Opener-Policy', 'same-origin');
        $this->assertStringContainsString('camera=()', $response->headers->get('Permissions-Policy'));
    }

    public function test_csp_stops_documents_from_being_sent_elsewhere(): void
    {
        $csp = $this->get('/')->headers->get('Content-Security-Policy');

        $this->assertStringContainsString("default-src 'self'", $csp);
        $this->assertStringContainsString("connect-src 'self' blob: data:", $csp);
        $this->assertStringContainsString("script-src 'self' 'wasm-unsafe-eval'", $csp);
        $this->assertStringContainsString("object-src 'none'", $csp);
        $this->assertStringContainsString("frame-ancestors 'none'", $csp);
        $this->assertStringContainsString("form-action 'self'", $csp);
        $this->assertStringNotContainsString("'unsafe-eval'", $csp);
        $this->assertDoesNotMatchRegularExpression('/script-src[^;]*(unsafe-inline|https?:)/', $csp);
        $this->assertDoesNotMatchRegularExpression('/connect-src[^;]*https?:/', $csp);
    }

    public function test_hsts_is_only_sent_over_https(): void
    {
        $this->get('/')->assertHeaderMissing('Strict-Transport-Security');

        $this->get('https://localhost/')->assertHeader('Strict-Transport-Security');
    }

    public function test_pages_do_not_load_third_party_resources(): void
    {
        foreach (['/', '/merge-pdf', '/image-to-text'] as $path) {
            $html = $this->get($path)->getContent();

            $this->assertDoesNotMatchRegularExpression('/(src|href)="https?:\/\/(?!localhost)/', $html, "External resource on $path");
        }
    }
}
