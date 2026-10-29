<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $seo['title'] ?? config('app.name') }}</title>
    <meta name="description" content="{{ $seo['description'] ?? config('seo.site.tagline') }}">
    <link rel="canonical" href="{{ $seo['canonical'] ?? url()->current() }}">
    @isset($seo['alternates'])
        <link rel="alternate" hreflang="en" href="{{ $seo['alternates']['en'] }}">
        <link rel="alternate" hreflang="hi" href="{{ $seo['alternates']['hi'] }}">
        <link rel="alternate" hreflang="x-default" href="{{ $seo['alternates']['en'] }}">
    @endisset
    <meta name="robots" content="index, follow, max-image-preview:large">
    <meta name="theme-color" content="#2563eb">
    <link rel="manifest" href="{{ route('manifest') }}">
    <link rel="apple-touch-icon" href="{{ asset('icons/icon-192.png') }}">
    <link rel="icon" href="{{ asset('favicon.svg') }}" type="image/svg+xml">
    <link rel="alternate icon" href="{{ asset('favicon.ico') }}">
    <meta property="og:site_name" content="{{ config('seo.site.name') }}">
    <meta property="og:type" content="{{ $seo['type'] ?? 'website' }}">
    <meta property="og:title" content="{{ $seo['title'] ?? config('app.name') }}">
    <meta property="og:description" content="{{ $seo['description'] ?? config('seo.site.tagline') }}">
    <meta property="og:url" content="{{ $seo['canonical'] ?? url()->current() }}">
    <meta property="og:image" content="{{ $seo['image'] ?? asset('og-default.png') }}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{{ $seo['title'] ?? config('app.name') }}">
    <meta name="twitter:description" content="{{ $seo['description'] ?? config('seo.site.tagline') }}">
    <meta name="twitter:image" content="{{ $seo['image'] ?? asset('og-default.png') }}">
    @foreach (($seo['jsonld'] ?? []) as $schema)
        <script type="application/ld+json">{!! json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) !!}</script>
    @endforeach
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
    <header class="header">
        <div class="container header__inner">
            <a href="{{ lroute('home') }}" class="logo" aria-label="ilikepdfs home">ilike<b>pdfs</b></a>

            <nav class="nav" aria-label="Main">
                <a href="{{ lroute('tools.merge-pdf') }}">{{ __('Merge PDF') }}</a>
                <a href="{{ lroute('tools.split-pdf') }}">{{ __('Split PDF') }}</a>
                <a href="{{ lroute('tools.compress-pdf') }}">{{ __('Compress PDF') }}</a>
                <a href="{{ locale_url(app()->getLocale() === 'hi' ? 'en' : 'hi') }}" class="lang-switch" @if (app()->getLocale() !== 'hi') hreflang="hi" lang="hi" @else hreflang="en" lang="en" @endif>{{ app()->getLocale() === 'hi' ? 'English' : 'हिन्दी' }}</a>
                <button type="button" class="nav__more" data-menu-toggle aria-expanded="false" aria-controls="mega">{{ __('All tools') }} <span aria-hidden="true">&#9662;</span></button>
            </nav>

            <button type="button" class="theme-toggle" data-theme-toggle aria-label="Switch between light and dark mode" title="Light / dark"><span aria-hidden="true"></span></button>

            <button type="button" class="nav-toggle" data-menu-toggle aria-expanded="false" aria-controls="mega" aria-label="{{ __('Menu') }}"><i></i><i></i><i></i></button>
        </div>

        @php
            $groups = [
                'organize' => __('Organize PDF'), 'convert' => __('Convert PDF'), 'image' => __('Image tools'),
                'edit' => __('Edit PDF'), 'security' => __('PDF security'), 'text' => __('Text & AI'),
            ];
            $menu = collect(config('tools'))->map(fn ($tool, $slug) => ['slug' => $slug] + $tool)->groupBy(fn ($tool) => $tool['categories'][0]);
        @endphp
        <div class="mega" id="mega" hidden>
            <div class="container mega__lang">
                <a href="{{ locale_url(app()->getLocale() === 'hi' ? 'en' : 'hi') }}" @if (app()->getLocale() !== 'hi') hreflang="hi" lang="hi" @else hreflang="en" lang="en" @endif>{{ app()->getLocale() === 'hi' ? 'English' : 'हिन्दी' }}</a>
            </div>
            <div class="container mega__grid">
                @foreach ($groups as $key => $label)
                    @if ($menu->has($key))
                        <div class="mega__col">
                            <h3>{{ $label }}</h3>
                            <ul>
                                @foreach ($menu[$key] as $item)
                                    <li><a href="{{ lroute('tools.'.$item['slug']) }}"><span class="mega__dot c-{{ $item['color'] }}"></span>{{ __($item['name']) }}</a></li>
                                @endforeach
                            </ul>
                        </div>
                    @endif
                @endforeach
            </div>
        </div>
    </header>

    <main>
        @yield('content')
    </main>

    <footer class="footer">
        <div class="container">
            <div class="footer__grid">
                <div>
                    <a href="{{ lroute('home') }}" class="logo">ilike<b>pdfs</b></a>
                    <p class="footer__note">{{ __('Free PDF and image tools that run in your browser.') }}</p>
                </div>
                <div>
                    <h4>{{ __('Popular') }}</h4>
                    <ul>
                        <li><a href="{{ lroute('tools.merge-pdf') }}">{{ __(config('tools.merge-pdf.name')) }}</a></li>
                        <li><a href="{{ lroute('tools.compress-pdf') }}">{{ __(config('tools.compress-pdf.name')) }}</a></li>
                        <li><a href="{{ lroute('tools.jpg-to-pdf') }}">{{ __(config('tools.jpg-to-pdf.name')) }}</a></li>
                        <li><a href="{{ lroute('tools.word-to-pdf') }}">{{ __(config('tools.word-to-pdf.name')) }}</a></li>
                    </ul>
                </div>
                <div>
                    <h4>{{ __('More') }}</h4>
                    <ul>
                        <li><a href="{{ lroute('tools.sign-pdf') }}">{{ __(config('tools.sign-pdf.name')) }}</a></li>
                        <li><a href="{{ lroute('tools.ocr-pdf') }}">{{ __(config('tools.ocr-pdf.name')) }}</a></li>
                        <li><a href="{{ lroute('tools.heic-to-jpg') }}">{{ __(config('tools.heic-to-jpg.name')) }}</a></li>
                        <li><a href="{{ lroute('tools.compress-image') }}">{{ __(config('tools.compress-image.name')) }}</a></li>
                    </ul>
                </div>
                <div>
                    <h4>{{ __('Site') }}</h4>
                    <ul>
                        <li><a href="{{ lroute('home') }}#tools">{{ __('All tools') }}</a></li>
                        <li><a href="{{ route('about') }}">{{ __('About') }}</a></li>
                        <li><a href="{{ route('privacy') }}">{{ __('Privacy policy') }}</a></li>
                        <li><a href="{{ locale_url(app()->getLocale() === 'hi' ? 'en' : 'hi') }}" @if (app()->getLocale() !== 'hi') hreflang="hi" lang="hi" @else hreflang="en" lang="en" @endif>{{ app()->getLocale() === 'hi' ? 'English' : 'हिन्दी' }}</a></li>
                        <li class="offline" data-offline-box hidden><button type="button" class="offline__btn" data-offline>{{ __('Save for offline use') }}</button><span class="offline__status" data-offline-status></span></li>
                    </ul>
                </div>
            </div>
            <div class="footer__bottom">
                <span>&copy; {{ date('Y') }} {{ config('app.name') }}</span>
                <span>{{ __('Your files stay on your device.') }}</span>
            </div>
        </div>
    </footer>
</body>
</html>
