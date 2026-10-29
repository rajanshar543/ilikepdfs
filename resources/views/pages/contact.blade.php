@extends('layouts.app')

@section('content')
    <article class="prose container">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="{{ lroute('home') }}">Home</a><span aria-hidden="true">/</span><span aria-current="page">Contact</span></nav>
        <h1>Contact</h1>

        @if (config('site.email'))
            <p class="more__answer">Questions, feedback, a problem with a tool, or a privacy request? Email <a href="mailto:{{ config('site.email') }}">{{ config('site.email') }}</a>.</p>
            @if (config('site.owner'))<p>{{ config('seo.site.name') }} is run by {{ config('site.owner') }}.</p>@endif
            <h2>Before you write</h2>
            <ul>
                <li>For a problem with a tool, tell us which tool, your browser and device, and what happened. Please do not attach private documents.</li>
                <li>We cannot recover a file, a result or a password you set, because they never reach our servers.</li>
                <li>For a privacy request, see your rights in the <a href="{{ route('privacy') }}">privacy policy</a>.</li>
            </ul>
        @else
            <p class="more__answer">Contact details are being set up. In the meantime, the <a href="{{ route('privacy') }}">privacy policy</a> and <a href="{{ route('terms') }}">terms</a> explain how the site works.</p>
        @endif
    </article>
@endsection
