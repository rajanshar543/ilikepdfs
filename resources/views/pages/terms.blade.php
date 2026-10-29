@extends('layouts.app')

@section('content')
    <article class="prose container">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="{{ lroute('home') }}">Home</a><span aria-hidden="true">/</span><span aria-current="page">Terms of use</span></nav>
        <h1>Terms of use</h1>
        <p class="meta">Last updated: {{ \Illuminate\Support\Carbon::parse(config('site.legal_updated'))->format('j F Y') }}</p>

        <p class="more__answer">{{ config('seo.site.name') }} is a free service provided as it is. Use it only for files you have the right to use, check every result before you rely on it, and understand that we cannot be responsible for losses that come from using it.</p>

        <h2>Using the site</h2>
        <p>By using {{ config('seo.site.name') }} you agree to these terms. If you do not agree, please do not use the site. No account is needed.</p>

        <h2>Your files</h2>
        <ul>
            <li>Your files belong to you. We do not claim any rights over them. Almost all tools process them on your device, as explained in the <a href="{{ route('privacy') }}">privacy policy</a>.</li>
            <li>You are responsible for having the right to use, convert, edit, unlock or share the files you choose, and for following the law. Do not use the tools on files you are not allowed to open or change.</li>
            <li>Unlock PDF only removes a password you already know. It does not break passwords, and you must not use it on documents you are not entitled to open.</li>
        </ul>

        <h2>Check your results</h2>
        <p>Conversions between formats (for example PDF to Word, Word to PDF, PDF to Excel) keep content but may not match the original layout exactly. Tools that hide or remove information (Redact PDF, Mask Aadhaar &amp; PAN) can miss text that is blurry, split across lines or part of a picture. Sign PDF adds a visible signature, not a certificate-based digital signature. Image and PDF size tools may reduce quality to reach a size you ask for. Always check the result before you send, publish or rely on it.</p>
        <p>Nothing on this site is legal, financial or professional advice. Form and exam size presets are only examples; check the exact rules of the form you are filling in.</p>

        <h2>Acceptable use</h2>
        <p>Please do not:</p>
        <ul>
            <li>use the site to break the law or to handle content you have no right to handle;</li>
            <li>try to disrupt the site, overload it, or get around its limits;</li>
            <li>use HTML to PDF to reach private networks, internal addresses or services you are not allowed to access, or to collect data from other websites in bulk;</li>
            <li>copy the site&rsquo;s name, logo or design to mislead others into thinking your site is ours.</li>
        </ul>

        <h2>No warranty</h2>
        <p>The site and its tools are provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without promises that they will be error-free, uninterrupted, accurate or suitable for a particular purpose. Browsers, devices and files differ, and some files may not work.</p>

        <h2>Limit of liability</h2>
        <p>To the fullest extent the law allows, we are not liable for any loss or damage that comes from using or not being able to use the site, including lost or damaged files, lost data or lost profit. Keep a copy of every original file. Nothing in these terms limits liability that cannot be limited by law.</p>

        <h2>Our property and open-source software</h2>
        <p>The name {{ config('seo.site.name') }}, its logo, design and original text belong to its owner. The site is built with open-source software, which stays under its own licenses; see the credits on the <a href="{{ route('about') }}#credits">About page</a>.</p>

        <h2>Changes and availability</h2>
        <p>We may change, pause or remove tools, and we may update these terms. The date at the top shows the latest version. Continuing to use the site after a change means you accept the new terms.</p>

        @if (config('site.country'))
            <h2>Governing law</h2>
            <p>These terms are governed by the laws of {{ config('site.country') }}.</p>
        @endif

        <h2>Contact</h2>
        <p>@if (config('site.email'))<a href="mailto:{{ config('site.email') }}">{{ config('site.email') }}</a>@else See the <a href="{{ route('contact') }}">contact page</a>.@endif</p>
    </article>
@endsection
