<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;

class SitemapController extends Controller
{
    public function sitemap(): Response
    {
        $modified = date('Y-m-d', max(filemtime(config_path('tools.php')), filemtime(config_path('seo.php'))));

        $slugs = collect(config('tools'))->keys();
        $pairs = collect([['home', 'home']])->merge($slugs->map(fn (string $slug): array => ['tools.'.$slug, 'tools.'.$slug]));

        $xml = '<?xml version="1.0" encoding="UTF-8"?>'."\n".'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'."\n";

        foreach ($pairs as [$name]) {
            $en = route($name);
            $hi = route('hi.'.$name);

            foreach ([$en, $hi] as $loc) {
                $xml .= '  <url><loc>'.e($loc).'</loc><lastmod>'.$modified.'</lastmod>'
                    .'<xhtml:link rel="alternate" hreflang="en" href="'.e($en).'"/>'
                    .'<xhtml:link rel="alternate" hreflang="hi" href="'.e($hi).'"/>'
                    .'<xhtml:link rel="alternate" hreflang="x-default" href="'.e($en).'"/></url>'."\n";
            }
        }

        foreach ([route('about'), route('privacy')] as $url) {
            $xml .= '  <url><loc>'.e($url).'</loc><lastmod>'.$modified.'</lastmod></url>'."\n";
        }

        return response($xml.'</urlset>'."\n", 200, ['Content-Type' => 'application/xml; charset=UTF-8']);
    }

    public function robots(): Response
    {
        return response("User-agent: *\nAllow: /\n\nSitemap: ".url('sitemap.xml')."\n", 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }
}
