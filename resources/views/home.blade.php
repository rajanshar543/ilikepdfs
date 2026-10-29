@extends('layouts.app')

@section('content')
    <section class="hero">
        <div class="container hero__grid">
            <div>
                <h1>{{ __('PDF jobs,') }} <span>{{ __('done in your browser.') }}</span></h1>
                <p>{{ __('Merge, split, compress, convert, sign and more. No account, no upload, no watermark.') }}</p>

                <form class="search" role="search" onsubmit="return false">
                    <input type="search" id="tool-search" placeholder="{{ __('What do you need? Try "merge" or "jpg"') }}" aria-label="{{ __('Search tools') }}" autocomplete="off">
                    <button type="button" data-search-go>{{ __('Find tool') }}</button>
                </form>

                <div class="facts">
                    <span>{{ __(':count tools', ['count' => count($tools)]) }}</span>
                    <span>{{ __('Free, no sign-up') }}</span>
                    <span>{{ __('Files never leave your device') }}</span>
                </div>
            </div>

            <div class="hero__art" aria-hidden="true">
                <div class="sheet sheet--a"><i></i><i></i><i></i><i></i><i></i><i></i></div>
                <div class="sheet sheet--b"><i></i><i></i><i></i><i></i><i></i><i></i></div>
                <span class="sheet__tag">.pdf</span>
            </div>
        </div>
    </section>

    <section class="tools" id="tools">
        <div class="container">
            <div class="tools__bar">
                <div class="tabs" role="tablist">
                    @foreach ($categories as $key => $label)
                        <button type="button" class="tab {{ $loop->first ? 'is-active' : '' }}" data-filter="{{ $key }}" role="tab">{{ __($label) }}</button>
                    @endforeach
                </div>
                <span class="count" data-count aria-live="polite" data-template="{{ __(':count tools') }}">{{ __(':count tools', ['count' => count($tools)]) }}</span>
            </div>

            <div class="grid">
                @foreach ($tools as $tool)
                    <a href="{{ lroute('tools.'.$tool['slug']) }}" class="card"
                        data-category="{{ implode(' ', $tool['categories']) }}"
                        data-search="{{ strtolower($tool['name'].' '.$tool['description'].' '.__($tool['name']).' '.($tool['from'] ?? '').' '.($tool['to'] ?? '')) }}">
                        <div class="card__icon c-{{ $tool['color'] }}">
                            <x-icon :name="$tool['icon']" :size="26" />
                        </div>
                        <h3>{{ __($tool['name']) }}</h3>
                        <p>{{ __($tool['description']) }}</p>
                        @isset($tool['from'])
                            <div class="fmt" aria-label="{{ $tool['from'] }} to {{ $tool['to'] }}">
                                <span class="fmt__tag">{{ $tool['from'] }}</span>
                                <x-icon name="arrow" :size="14" />
                                <span class="fmt__tag fmt__tag--to">{{ $tool['to'] }}</span>
                            </div>
                        @endisset
                    </a>
                @endforeach
                <p class="empty" data-empty hidden>{{ __('No tool matches that. Try another word.') }}</p>
            </div>
        </div>
    </section>

    <section class="band" id="privacy">
        <div class="container band__grid">
            <h2>{{ __('Your files stay on your device.') }}</h2>
            <ul>
                <li><span><b>{{ __('Nothing is uploaded.') }}</b>{{ __('Almost every tool runs inside your browser, so your documents are never sent to a server.') }}</span></li>
                <li><span><b>{{ __('No sign-up, no limits.') }}</b>{{ __('Use every tool as often as you like, with no watermark.') }}</span></li>
                <li><span><b>{{ __('One exception, clearly marked.') }}</b>{{ __('HTML to PDF needs our server to read web pages. It says so on its page and stores nothing.') }}</span></li>
            </ul>
        </div>
    </section>

    <section class="more more--home" id="faq">
        <div class="container">
            <h2>{{ __('What can you do with ilikepdfs?') }}</h2>
            <p class="more__answer">{{ __('ilikepdfs is a free website with :count tools for PDF files and images. Merge or split PDFs, make them smaller, convert between PDF and Word, Excel, PowerPoint, JPG and PNG, sign, protect, edit, redact or run OCR on scanned pages. Everything runs in your browser, so your documents stay on your device.', ['count' => count($tools)]) }}</p>

            <div class="more__groups">
                @foreach (['organize' => 'Organize PDF', 'convert' => 'Convert PDF', 'image' => 'Image tools', 'edit' => 'Edit PDF', 'security' => 'PDF security', 'text' => 'Text & AI'] as $key => $label)
                    <div>
                        <h3>{{ __($label) }}</h3>
                        <p>
                            @foreach (collect($tools)->filter(fn ($tool) => $tool['categories'][0] === $key) as $tool)<a href="{{ lroute('tools.'.$tool['slug']) }}">{{ __($tool['name']) }}</a>@if (! $loop->last), @endif @endforeach
                        </p>
                    </div>
                @endforeach
            </div>

            <h2>{{ __('Common questions') }}</h2>
            <div class="faq">
                @foreach ($seo['faq'] as $entry)
                    <details>
                        <summary>{{ $entry['question'] }}</summary>
                        <p>{{ $entry['answer'] }}</p>
                    </details>
                @endforeach
            </div>
        </div>
    </section>
@endsection
