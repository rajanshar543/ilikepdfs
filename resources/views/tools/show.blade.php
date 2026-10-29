@extends('layouts.app')

@section('content')
    <section class="tool"
        data-tool="{{ $slug }}"
        data-accept="{{ $tool['accept'] }}"
        data-multiple="{{ $tool['multiple'] ? '1' : '0' }}"
        data-max-files="{{ $tool['max_files'] }}"
        data-max-mb="{{ $tool['max_file_mb'] }}">

        <div class="container tool__inner tool__head" data-panel="select">
            <nav class="crumbs" aria-label="Breadcrumb">
                <a href="{{ lroute('home') }}">{{ __('Home') }}</a><span aria-hidden="true">/</span>
                <a href="{{ lroute('home') }}#tools">{{ \App\Support\ToolSeo::categoryLabel($tool['categories'][0]) }}</a><span aria-hidden="true">/</span>
                <span aria-current="page">{{ __($tool['name']) }}</span>
            </nav>
            <h1 class="tool__title">{{ __($tool['name']) }}</h1>
            <p class="tool__lead">{{ app()->getLocale() === 'hi' ? __($tool['description']) : $tool['heading'] }}</p>

            <label class="drop" data-drop tabindex="0">
                <span class="drop__icon"><x-icon name="{{ $tool['icon'] }}" :size="30" /></span>
                <span class="drop__title">{{ $tool['multiple'] ? __('Choose files') : __('Choose a file') }}</span>
                <span class="drop__hint">{{ $tool['multiple'] ? __('or drop them here') : __('or drop it here') }}</span>
                <input type="file" data-input hidden accept="{{ $tool['accept'] }}" @if ($tool['multiple']) multiple @endif>
            </label>
            @if ($tool['capture'] ?? false)
                <div class="capture">
                    <button type="button" class="btn btn--soft" data-capture>{{ __('Take a photo with your camera') }}</button>
                    <input type="file" accept="image/*" capture="environment" hidden data-extra-input>
                </div>
            @endif
            @if ($tool['no_file'] ?? false)
                <div class="capture">
                    <button type="button" class="btn btn--soft" data-skip>{{ __('Paste HTML or enter a web address instead') }}</button>
                </div>
            @endif
            <p class="note">{{ __($tool['privacy_note'] ?? 'Your files never leave your device. Everything happens in your browser.') }}</p>
        </div>

        <div class="workspace" data-panel="work" hidden>
            <div class="ws-main" data-main>
                <ul class="files" data-files></ul>
                <button type="button" class="fab" data-add hidden aria-label="Add more files">
                    <span aria-hidden="true">+</span><b data-count>0</b>
                </button>
            </div>

            <aside class="ws-side">
                <div class="ws-side__head">
                    <p class="ws-title">{{ __($tool['name']) }}</p>
                    <button type="button" class="btn btn--ghost" data-reset>{{ __('Start over') }}</button>
                </div>

                <div class="ws-side__body">
                    @includeIf('tools.options.'.$slug)
                    @unless (view()->exists('tools.options.'.$slug))
                        <p class="hint">{{ $tool['heading'] }}</p>
                    @endunless

                    <div class="alert" data-error role="alert" hidden></div>

                    <div class="progress" data-progress hidden>
                        <div class="progress__bar"><i data-progress-bar></i></div>
                        <span data-progress-text>Working...</span>
                    </div>
                </div>

                <div class="ws-side__foot">
                    <button type="button" class="btn btn--primary btn--xl" data-run>{{ tool_action($tool['action']) }} <span aria-hidden="true">&rarr;</span></button>
                    <p class="shortcut">{{ __('or press') }} <kbd>Ctrl</kbd> + <kbd>Enter</kbd></p>
                </div>
            </aside>
        </div>

        <div class="container tool__inner more" data-more>
            <section>
                <h2>{{ __('What is :name?', ['name' => __($tool['name'])]) }}</h2>
                <p class="more__answer">{{ $seo['intro'] }}</p>
            </section>

            <section>
                <h2>{{ __('How to use :name', ['name' => __($tool['name'])]) }}</h2>
                <ol class="more__steps">
                    @foreach ($seo['steps'] as $step)
                        <li><b>{{ $step['name'] }}.</b> {{ $step['text'] }}</li>
                    @endforeach
                </ol>
            </section>

            <section>
                <h2>{{ __('Questions about :name', ['name' => __($tool['name'])]) }}</h2>
                <div class="faq">
                    @foreach ($seo['faq'] as $entry)
                        <details>
                            <summary>{{ $entry['question'] }}</summary>
                            <p>{{ $entry['answer'] }}</p>
                        </details>
                    @endforeach
                </div>
            </section>

            <section>
                <h2>{{ __('More free tools you may need') }}</h2>
                <ul class="related">
                    @foreach ($seo['related'] as $item)
                        <li><a href="{{ $item['url'] }}"><b>{{ $item['name'] }}</b><span>{{ $item['description'] }}</span></a></li>
                    @endforeach
                </ul>
            </section>
        </div>

        <div class="container tool__inner" data-panel="done" hidden>
            <h2 class="done__title">{{ __('Done! Your file is ready.') }}</h2>
            <p class="meter" data-meter></p>
            <div class="results" data-results></div>
            <div class="actions">
                <button type="button" class="btn btn--soft" data-reset>{{ __('Start over') }}</button>
            </div>
        </div>
    </section>
@endsection
