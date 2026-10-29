@extends('layouts.app')

@section('content')
    <article class="prose container">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="{{ lroute('home') }}">Home</a><span aria-hidden="true">/</span><span aria-current="page">About</span></nav>
        <h1>About ilikepdfs</h1>
        <p class="more__answer">ilikepdfs is a free set of {{ count(config('tools')) }} PDF and image tools that run inside your web browser. You do not need an account, and your files are not uploaded to a server, except for one clearly marked tool.</p>

        <h2>How does it work?</h2>
        <p>When you pick a file, your browser reads it and does the work on your own device using open-source libraries such as pdf-lib, PDF.js, qpdf and Tesseract. The result is created in memory and offered as a download. When you close the page, it is gone.</p>

        <h2>What is processed on a server?</h2>
        <p>Only HTML to PDF. A browser is not allowed to download other websites&rsquo; pages, so that tool sends your HTML or web address to our server, which turns it into a PDF and does not store it. Its page says so before you use it.</p>

        <h2>What can it not do?</h2>
        <ul>
            <li>Conversions to and from Word, Excel and PowerPoint keep the content but may not match the original layout exactly.</li>
            <li>Sign PDF adds a visible signature, not a certificate-based digital signature.</li>
            <li>Crop PDF hides the cut area but keeps its content; use Redact PDF to remove content for good.</li>
        </ul>

        <h2>Why is it free?</h2>
        <p>Because the work happens on your device, running the site costs very little. There is no sign-up, no watermark and no daily limit.</p>
        <p><a class="btn btn--primary" href="{{ lroute('home') }}#tools">Browse all tools</a></p>
    </article>
@endsection
