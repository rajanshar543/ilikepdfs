<?php

namespace App\Services;

interface HostResolver
{
    /**
     * Every IPv4 and IPv6 address a host name points to.
     *
     * @return list<string>
     */
    public function resolve(string $host): array;
}
