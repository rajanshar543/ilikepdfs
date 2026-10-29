<?php

namespace Tests\Feature;

use App\Services\HostResolver;
use App\Services\HtmlCleaner;
use App\Services\HtmlToPdfRenderer;
use App\Services\SafeUrlFetcher;
use Illuminate\Http\Client\Request;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\FakeResolver;
use Tests\TestCase;

class HtmlToPdfTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->app->instance(HostResolver::class, new FakeResolver([
            'example.com' => ['93.184.216.34'],
            'other.example.org' => ['93.184.216.35'],
            'evil.test' => ['10.0.0.8'],
        ]));
    }

    private function convert(array $data)
    {
        return $this->postJson(route('tools.html-to-pdf.convert'), $data);
    }

    public function test_the_page_explains_that_this_tool_uses_the_server(): void
    {
        $this->get(route('tools.html-to-pdf'))
            ->assertOk()
            ->assertSee('sent to it to make the PDF')
            ->assertDontSee('never leave your device')
            ->assertSee('csrf-token', false);
    }

    public function test_it_converts_pasted_html_to_a_pdf(): void
    {
        $response = $this->convert(['html' => '<h1>Hello</h1><p>World &amp; friends</p><table><tr><td>A</td><td>B</td></tr></table>', 'pageSize' => 'letter', 'orientation' => 'landscape', 'margin' => 'small']);

        $response->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->assertStringContainsString('attachment', $response->headers->get('Content-Disposition'));
        $this->assertStringStartsWith('%PDF-', $response->getContent());
        $this->assertGreaterThan(800, strlen($response->getContent()));
        // US Letter landscape: 792 x 612 points.
        $this->assertMatchesRegularExpression('/MediaBox \[0\.0+ 0\.0+ 792\.0+ 612\.0+\]/', $response->getContent());
    }

    public function test_the_renderer_is_locked_down(): void
    {
        $options = app(HtmlToPdfRenderer::class)->secureOptions();

        $this->assertFalse($options->getIsRemoteEnabled());
        $this->assertFalse($options->getIsPhpEnabled());
        $this->assertFalse($options->getIsJavascriptEnabled());
        $this->assertSame(['data://' => ['rules' => []]], $options->getAllowedProtocols());
    }

    public function test_html_cannot_read_server_files_or_run_php(): void
    {
        $html = '<img src="file:///etc/hosts"><img src="'.base_path('.env').'"><link rel="stylesheet" href="file:///etc/passwd"><script>document.write("x")</script><?php echo "PHP-RAN"; ?><p>safe</p>';

        $response = $this->convert(['html' => $html]);

        $response->assertOk();
        $this->assertStringNotContainsString('PHP-RAN', $response->getContent());
        $this->assertStringNotContainsString('APP_KEY', $response->getContent());
    }

    public function test_remote_pictures_and_styles_are_never_requested(): void
    {
        Http::fake();

        $this->convert(['html' => '<link rel="stylesheet" href="http://127.0.0.1:9/x.css"><img src="http://169.254.169.254/a.png"><p>hi</p>'])->assertOk();

        Http::assertNothingSent();
    }

    public function test_it_validates_the_request(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);

        $this->convert([])->assertStatus(422)->assertJsonPath('message', 'Paste some HTML, choose an HTML file or enter a web address.');
        $this->convert(['html' => '   ', 'url' => ' '])->assertStatus(422);
        $this->convert(['html' => '<p>x</p>', 'pageSize' => 'a0'])->assertStatus(422);
        $this->convert(['html' => '<p>x</p>', 'orientation' => 'sideways'])->assertStatus(422);
        $this->convert(['html' => '<p>x</p>', 'margin' => 'huge'])->assertStatus(422);
        $this->convert(['html' => str_repeat('x', 8_000_001)])->assertStatus(422);
        $this->convert(['html' => ['array']])->assertStatus(422);
    }

    public function test_it_converts_a_public_web_page(): void
    {
        Http::fake(['https://example.com/*' => Http::response('<html><body><h1>Remote page</h1></body></html>', 200, ['Content-Type' => 'text/html; charset=utf-8'])]);

        $this->convert(['url' => 'https://example.com/page'])
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');

        Http::assertSent(fn (Request $request) => $request->url() === 'https://example.com/page'
            && $request->header('User-Agent')[0] === 'ilikepdfs-html-to-pdf/1.0'
            && ! $request->hasHeader('Cookie')
            && ! $request->hasHeader('Authorization'));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function blockedUrls(): array
    {
        return [
            'loopback' => ['http://127.0.0.1/'],
            'localhost' => ['http://localhost:80/'],
            'metadata' => ['http://169.254.169.254/latest/meta-data/iam/'],
            'private network' => ['http://10.0.0.5/'],
            'ipv6 loopback' => ['http://[::1]/'],
            'mapped' => ['http://[::ffff:7f00:1]/'],
            'name to private ip' => ['http://evil.test/'],
            'file scheme' => ['file:///etc/passwd'],
            'credentials' => ['http://admin:admin@example.com/'],
            'other port' => ['http://example.com:6379/'],
            'unknown host' => ['http://no-such-host.example/'],
        ];
    }

    #[DataProvider('blockedUrls')]
    public function test_it_refuses_to_fetch_private_or_unsafe_addresses(string $url): void
    {
        Http::fake();

        $this->convert(['url' => $url])->assertStatus(422)->assertJsonStructure(['message']);

        Http::assertNothingSent();
    }

    public function test_it_re_checks_every_redirect(): void
    {
        Http::fake(['https://example.com/*' => Http::response('', 302, ['Location' => 'http://169.254.169.254/latest/meta-data/'])]);

        $this->convert(['url' => 'https://example.com/go'])->assertStatus(422)->assertJsonPath('message', 'That address is not allowed.');

        Http::assertSentCount(1);
    }

    public function test_it_follows_a_safe_redirect_and_limits_how_many(): void
    {
        Http::fake([
            'https://example.com/start' => Http::response('', 301, ['Location' => 'https://other.example.org/final']),
            'https://other.example.org/final' => Http::response('<p>Arrived</p>', 200, ['Content-Type' => 'text/html']),
        ]);
        $this->convert(['url' => 'https://example.com/start'])->assertOk();

        Http::fake(['https://example.com/*' => Http::response('', 302, ['Location' => '/again'])]);
        $this->convert(['url' => 'https://example.com/loop'])->assertStatus(422)->assertJsonPath('message', 'The page redirected too many times.');
    }

    public function test_it_rejects_pages_that_are_not_html_too_large_or_failing(): void
    {
        Http::fake(['https://example.com/data.json' => Http::response('{"a":1}', 200, ['Content-Type' => 'application/json'])]);
        $this->convert(['url' => 'https://example.com/data.json'])->assertStatus(422)->assertJsonPath('message', 'That address is not a web page (HTML).');

        Http::fake(['https://example.com/big' => Http::response(str_repeat('a', SafeUrlFetcher::MAX_BYTES + 10), 200, ['Content-Type' => 'text/html'])]);
        $this->convert(['url' => 'https://example.com/big'])->assertStatus(422)->assertJsonPath('message', 'The page is too large to convert.');

        Http::fake(['https://example.com/broken' => Http::response('error', 500, ['Content-Type' => 'text/html'])]);
        $this->convert(['url' => 'https://example.com/broken'])->assertStatus(422);
    }

    public function test_a_big_saved_page_is_cleaned_before_it_is_converted(): void
    {
        // 4 MB of scripts, icons and comments around a short page: fine once cleaned.
        $bloat = '<script>'.str_repeat('var a=1;', 300000).'</script><!--'.str_repeat('c', 800000).'--><svg><path d="'.str_repeat('M0 0L1 1', 100000).'"/></svg>';
        $html = '<html><head>'.$bloat.'</head><body><h1>Short page</h1></body></html>';
        $this->assertGreaterThan(3_000_000, strlen($html));

        $this->convert(['html' => $html])->assertOk()->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_a_page_that_is_still_huge_after_cleaning_gets_a_clear_message(): void
    {
        $this->convert(['html' => '<p>'.str_repeat('word ', 700000).'</p>'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'This page is still too large after removing scripts and icons. Paste only the part you need.');
    }

    public function test_the_cleaner_keeps_content_and_drops_bloat(): void
    {
        $cleaned = app(HtmlCleaner::class)->clean('<!--c--><p>Keep</p><script>x()</script><svg><circle/></svg><iframe src="a"></iframe><img src="data:image/png;base64,'.str_repeat('A', 400000).'"><img src="data:image/png;base64,AAAA"><link rel="x"><noscript>n</noscript>');

        $this->assertStringContainsString('<p>Keep</p>', $cleaned);
        $this->assertStringContainsString('src="data:image/png;base64,AAAA"', $cleaned);
        $this->assertStringNotContainsString('script', $cleaned);
        $this->assertStringNotContainsString('svg', $cleaned);
        $this->assertStringNotContainsString('iframe', $cleaned);
        $this->assertStringNotContainsString('noscript', $cleaned);
        $this->assertStringNotContainsString('AAAAAAAAAA', $cleaned);
    }

    public function test_it_does_not_leak_internal_errors(): void
    {
        $this->mock(HtmlToPdfRenderer::class)->shouldReceive('render')->andThrow(new \RuntimeException('secret path /var/www/x'));

        $response = $this->convert(['html' => '<p>x</p>']);

        $response->assertStatus(422)->assertJsonPath('message', 'The page could not be converted. Try simpler HTML.');
        $this->assertStringNotContainsString('secret', $response->getContent());
    }

    public function test_it_is_rate_limited(): void
    {
        for ($attempt = 0; $attempt < 6; $attempt++) {
            $this->convert(['html' => '<p>x</p>'])->assertOk();
        }

        $this->convert(['html' => '<p>x</p>'])->assertStatus(429);
    }

    public function test_only_post_can_convert(): void
    {
        $this->get('/html-to-pdf?html=%3Cp%3Ex%3C/p%3E')->assertOk()->assertHeader('Content-Type', 'text/html; charset=utf-8');
        $this->put('/html-to-pdf')->assertStatus(405);
    }
}
