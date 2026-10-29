<?php

namespace App\Services;

class DnsHostResolver implements HostResolver
{
    public function resolve(string $host): array
    {
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return [$host];
        }

        $addresses = [];

        foreach (['A' => DNS_A, 'AAAA' => DNS_AAAA] as $key => $type) {
            foreach (@dns_get_record($host, $type) ?: [] as $record) {
                $addresses[] = $record[$key === 'A' ? 'ip' : 'ipv6'];
            }
        }

        return array_values(array_unique($addresses));
    }
}
