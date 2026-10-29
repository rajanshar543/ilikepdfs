<?php

namespace App\Services;

use App\Exceptions\UnsafeUrlException;
use Illuminate\Support\Facades\Http;

/**
 * Downloads a web page for conversion without letting a visitor reach private
 * or internal addresses (SSRF).
 *
 * Every hop of the request is checked: only http/https on the default ports,
 * no credentials in the address, every resolved IP must be public, the
 * connection is pinned to the checked IP (no DNS rebinding), redirects are
 * followed by hand and re-checked, and the body is size and time limited.
 */
class SafeUrlFetcher
{
    public const MAX_BYTES = 5_000_000;

    private const MAX_REDIRECTS = 3;

    public function __construct(private readonly HostResolver $resolver) {}

    public function fetchHtml(string $url): string
    {
        for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
            [$host, $port, $ip, $scheme] = $this->check($url);

            $response = Http::withOptions([
                'allow_redirects' => false,
                'stream' => true,
                'timeout' => 8,
                'connect_timeout' => 4,
                'curl' => [CURLOPT_RESOLVE => ["{$host}:{$port}:{$ip}"]],
            ])->withHeaders([
                'User-Agent' => 'ilikepdfs-html-to-pdf/1.0',
                'Accept' => 'text/html,application/xhtml+xml',
                'Accept-Language' => 'en',
            ])->get($url);

            if ($response->redirect()) {
                $location = $response->header('Location');

                if ($location === '') {
                    throw new UnsafeUrlException('The page redirected without saying where to.');
                }

                $url = $this->absolute($url, $location, $scheme);

                continue;
            }

            if (! $response->successful()) {
                throw new UnsafeUrlException('The page could not be loaded (it answered with an error).');
            }

            $type = strtolower($response->header('Content-Type'));

            if (! str_contains($type, 'text/html') && ! str_contains($type, 'application/xhtml+xml')) {
                throw new UnsafeUrlException('That address is not a web page (HTML).');
            }

            return $this->readLimited($response);
        }

        throw new UnsafeUrlException('The page redirected too many times.');
    }

    /**
     * @return array{0: string, 1: int, 2: string, 3: string} host, port, checked ip, scheme
     */
    public function check(string $url): array
    {
        $parts = parse_url($url);

        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            throw new UnsafeUrlException('Enter a full web address that starts with http:// or https://.');
        }

        $scheme = strtolower($parts['scheme']);

        if (! in_array($scheme, ['http', 'https'], true)) {
            throw new UnsafeUrlException('Only http:// and https:// addresses can be converted.');
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            throw new UnsafeUrlException('Addresses with a user name or password are not allowed.');
        }

        $port = $parts['port'] ?? ($scheme === 'https' ? 443 : 80);

        if (! in_array($port, [80, 443], true)) {
            throw new UnsafeUrlException('Only the standard web ports can be used.');
        }

        $host = trim(strtolower($parts['host']), '[]');

        if ($host === '' || $host === 'localhost' || str_ends_with($host, '.localhost') || str_ends_with($host, '.local') || str_ends_with($host, '.internal')) {
            throw new UnsafeUrlException('That address is not allowed.');
        }

        $addresses = $this->resolver->resolve($host);

        if ($addresses === []) {
            throw new UnsafeUrlException('That web address could not be found.');
        }

        foreach ($addresses as $address) {
            if (! $this->isPublic($address)) {
                throw new UnsafeUrlException('That address is not allowed.');
            }
        }

        return [$host, $port, $addresses[0], $scheme];
    }

    public function isPublic(string $ip): bool
    {
        // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged as the IPv4 address.
        if (preg_match('/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i', $ip, $mapped) === 1) {
            $ip = $mapped[1];
        }

        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }

        // Ranges PHP's flags do not treat as private: carrier-grade NAT and benchmarking.
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
            $long = ip2long($ip);

            foreach (['100.64.0.0/10', '198.18.0.0/15', '192.0.0.0/24'] as $range) {
                [$base, $bits] = explode('/', $range);
                $mask = -1 << (32 - (int) $bits);

                if (($long & $mask) === (ip2long($base) & $mask)) {
                    return false;
                }
            }
        }

        return true;
    }

    private function absolute(string $base, string $location, string $scheme): string
    {
        if (preg_match('#^[a-z][a-z0-9+.-]*://#i', $location) === 1) {
            return $location;
        }

        $parts = parse_url($base);
        $origin = "{$scheme}://{$parts['host']}".(isset($parts['port']) ? ":{$parts['port']}" : '');

        if (str_starts_with($location, '//')) {
            return "{$scheme}:{$location}";
        }

        if (str_starts_with($location, '/')) {
            return $origin.$location;
        }

        $directory = rtrim(dirname($parts['path'] ?? '/'), '/');

        return "{$origin}{$directory}/{$location}";
    }

    private function readLimited($response): string
    {
        $stream = $response->toPsrResponse()->getBody();
        $body = '';

        while (! $stream->eof()) {
            $body .= $stream->read(8192);

            if (strlen($body) > self::MAX_BYTES) {
                throw new UnsafeUrlException('The page is too large to convert.');
            }
        }

        return $body;
    }
}
