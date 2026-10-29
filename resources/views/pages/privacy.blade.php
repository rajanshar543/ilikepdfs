@extends('layouts.app')

@section('content')
    <article class="prose container">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="{{ lroute('home') }}">Home</a><span aria-hidden="true">/</span><span aria-current="page">Privacy policy</span></nav>
        <h1>Privacy policy</h1>
        <p class="more__answer">Your files stay on your device. {{ config('seo.site.name') }} processes documents and images inside your browser, and nothing you choose is uploaded, except for the HTML to PDF tool, which sends only your HTML or web address to our server to make the PDF and does not store it.</p>

        <h2>Files and documents</h2>
        <p>Files you select are read by your browser and processed in memory on your device. We never receive them, and we cannot recover them if you lose them or forget a password you set.</p>

        <h2>HTML to PDF</h2>
        <p>The HTML text, HTML file or web address you enter is sent to our server over HTTPS, converted to a PDF and returned to you. It is not saved. For web addresses, the server downloads that public page; it refuses private and internal addresses.</p>

        <h2>Technical data</h2>
        <p>Like any website, our server sees your IP address and the pages you request, and sets a session cookie that protects forms against forgery. We do not use advertising or tracking cookies, and we do not sell data.</p>

        <h2>Third parties</h2>
        <p>All fonts, scripts and language data are served from this site. Pages do not load files from other companies.</p>

        <h2>Questions</h2>
        <p>If you have a question about this policy, use the contact details of the site owner.</p>
    </article>
@endsection
