<?php

namespace Tests\Support;

use App\Services\HostResolver;

/**
 * Resolves host names from a fixed table, so tests never touch real DNS.
 */
class FakeResolver implements HostResolver
{
    /**
     * @param  array<string, list<string>>  $table
     */
    public function __construct(private array $table = []) {}

    public function resolve(string $host): array
    {
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return [$host];
        }

        return $this->table[$host] ?? [];
    }
}
