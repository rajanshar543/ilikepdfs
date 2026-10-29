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
        @if (config('site.owner'))
            <h2>Who runs it?</h2>
            <p>{{ config('seo.site.name') }} is run by {{ config('site.owner') }}.@if (config('site.email')) Write to <a href="mailto:{{ config('site.email') }}">{{ config('site.email') }}</a>.@endif</p>
        @endif

        <h2 id="credits">Open-source credits</h2>
        <p>ilikepdfs stands on the work of these open-source projects. Each stays under its own license.</p>
        <table class="table">
            <thead><tr><th>Project</th><th>Used for</th><th>License</th></tr></thead>
            <tbody>
                <tr><td>pdf-lib</td><td>Creating and editing PDF files</td><td>MIT</td></tr>
                <tr><td>PDF.js (Mozilla)</td><td>Showing and reading PDF pages</td><td>Apache-2.0</td></tr>
                <tr><td>qpdf (WebAssembly)</td><td>Encrypting, decrypting and repairing PDFs</td><td>Apache-2.0 / ISC wrapper</td></tr>
                <tr><td>Tesseract.js and language data</td><td>Text recognition (OCR)</td><td>Apache-2.0</td></tr>
                <tr><td><a href="https://github.com/catdad-experiments/libheif-js" rel="noopener">libheif-js</a></td><td>Reading iPhone HEIC photos</td><td>LGPL-3.0</td></tr>
                <tr><td>UTIF.js (utif2)</td><td>Reading TIFF images</td><td>MIT</td></tr>
                <tr><td>mammoth.js</td><td>Reading Word files</td><td>BSD-2-Clause</td></tr>
                <tr><td>PptxGenJS</td><td>Creating PowerPoint files</td><td>MIT</td></tr>
                <tr><td>read-excel-file, fast-xml-parser, fflate, UPNG.js</td><td>Spreadsheets, XML, ZIP and PNG compression</td><td>MIT</td></tr>
                <tr><td>jSquash WebP</td><td>WebP encoding</td><td>Apache-2.0</td></tr>
                <tr><td>fontkit, Noto Sans, Inter, Bricolage Grotesque</td><td>Fonts and text shaping</td><td>MIT / SIL Open Font License</td></tr>
                <tr><td><a href="https://github.com/dompdf/dompdf" rel="noopener">Dompdf</a></td><td>HTML to PDF (on our server)</td><td>LGPL-2.1</td></tr>
                <tr><td>Laravel</td><td>The website itself</td><td>MIT</td></tr>
            </tbody>
        </table>
        <p>The LGPL libraries (libheif-js and Dompdf) are used unmodified, and their source code is available at the links above.</p>
        <p><a class="btn btn--primary" href="{{ lroute('home') }}#tools">Browse all tools</a></p>
    </article>
@endsection
