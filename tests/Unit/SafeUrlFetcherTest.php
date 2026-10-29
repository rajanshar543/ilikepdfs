<?php

namespace Tests\Unit;

use App\Exceptions\UnsafeUrlException;
use App\Services\SafeUrlFetcher;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Support\FakeResolver;

class SafeUrlFetcherTest extends TestCase
{
    private function fetcher(array $table = []): SafeUrlFetcher
    {
        return new SafeUrlFetcher(new FakeResolver($table + ['example.com' => ['93.184.216.34'], 'v6.example.com' => ['2606:2800:220:1:248:1893:25c8:1946']]));
    }

    /**
     * @return array<string, array{string, bool}>
     */
    public static function addresses(): array
    {
        return [
            'public v4' => ['93.184.216.34', true],
            'public v6' => ['2606:2800:220:1:248:1893:25c8:1946', true],
            'loopback' => ['127.0.0.1', false],
            'loopback range' => ['127.9.9.9', false],
            'private 10' => ['10.1.2.3', false],
            'private 172' => ['172.16.0.1', false],
            'private 192' => ['192.168.0.1', false],
            'link local metadata' => ['169.254.169.254', false],
            'this network' => ['0.0.0.0', false],
            'carrier nat' => ['100.64.0.1', false],
            'benchmark' => ['198.18.0.1', false],
            'ietf protocol' => ['192.0.0.8', false],
            'reserved' => ['240.0.0.1', false],
            'ipv6 loopback' => ['::1', false],
            'ipv6 link local' => ['fe80::1', false],
            'ipv6 unique local' => ['fd00::1', false],
            'mapped loopback' => ['::ffff:127.0.0.1', false],
            'mapped private' => ['::ffff:10.0.0.1', false],
            'mapped public' => ['::ffff:93.184.216.34', true],
            'not an ip' => ['hello', false],
        ];
    }

    #[DataProvider('addresses')]
    public function test_it_only_accepts_public_addresses(string $ip, bool $public): void
    {
        $this->assertSame($public, $this->fetcher()->isPublic($ip));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function unsafeUrls(): array
    {
        return [
            'localhost' => ['http://localhost/'],
            'localhost subdomain' => ['http://app.localhost/'],
            'ipv4 loopback' => ['http://127.0.0.1/'],
            'ipv6 loopback' => ['http://[::1]/'],
            'mapped ipv6' => ['http://[::ffff:127.0.0.1]/'],
            'metadata' => ['http://169.254.169.254/latest/meta-data/'],
            'private' => ['https://192.168.1.10/admin'],
            'dotted local' => ['http://printer.local/'],
            'internal' => ['http://db.internal/'],
            'ftp' => ['ftp://example.com/'],
            'file' => ['file:///etc/passwd'],
            'gopher' => ['gopher://example.com/'],
            'javascript' => ['javascript:alert(1)'],
            'credentials' => ['http://user:secret@example.com/'],
            'password only' => ['http://:secret@example.com/'],
            'odd port' => ['http://example.com:8080/'],
            'ssh port' => ['http://example.com:22/'],
            'no scheme' => ['example.com/page'],
            'empty host' => ['http:///page'],
            'garbage' => ['http://'],
            'unresolvable' => ['http://does-not-exist.example/'],
        ];
    }

    #[DataProvider('unsafeUrls')]
    public function test_it_rejects_unsafe_addresses(string $url): void
    {
        $this->expectException(UnsafeUrlException::class);

        $this->fetcher()->check($url);
    }

    public function test_it_rejects_a_name_that_resolves_to_a_private_address(): void
    {
        $this->expectException(UnsafeUrlException::class);

        $this->fetcher(['evil.test' => ['10.0.0.8']])->check('http://evil.test/');
    }

    public function test_it_rejects_a_name_with_any_private_address_among_public_ones(): void
    {
        $this->expectException(UnsafeUrlException::class);

        $this->fetcher(['mixed.test' => ['93.184.216.34', '127.0.0.1']])->check('http://mixed.test/');
    }

    public function test_it_accepts_public_addresses_and_returns_the_checked_ip(): void
    {
        $this->assertSame(['example.com', 443, '93.184.216.34', 'https'], $this->fetcher()->check('https://example.com/page?x=1'));
        $this->assertSame(['example.com', 80, '93.184.216.34', 'http'], $this->fetcher()->check('HTTP://EXAMPLE.COM'));
        $this->assertSame(['v6.example.com', 443, '2606:2800:220:1:248:1893:25c8:1946', 'https'], $this->fetcher()->check('https://v6.example.com/'));
    }
}
