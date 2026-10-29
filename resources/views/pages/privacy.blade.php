@extends('layouts.app')

@section('content')
    <article class="prose container">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="{{ lroute('home') }}">Home</a><span aria-hidden="true">/</span><span aria-current="page">Privacy policy</span></nav>
        <h1>Privacy policy</h1>
        <p class="meta">Last updated: {{ \Illuminate\Support\Carbon::parse(config('site.legal_updated'))->format('j F Y') }}</p>

        <p class="more__answer">Your files stay on your device. {{ config('seo.site.name') }} processes documents and images inside your browser, and nothing you choose is uploaded, except for the HTML to PDF tool, which sends only your HTML or web address to our server to make the PDF and does not store it. We use no advertising, no analytics and no tracking.</p>

        <h2>Who we are</h2>
        <p>{{ config('seo.site.name') }} is a free website with PDF and image tools.@if (config('site.owner')) It is run by {{ config('site.owner') }}.@endif @if (config('site.email')) You can reach us at <a href="mailto:{{ config('site.email') }}">{{ config('site.email') }}</a>.@else See the <a href="{{ route('contact') }}">contact page</a>.@endif</p>

        <h2>Your files and documents</h2>
        <p>When you choose a file, your browser reads it and a tool on this page processes it in your device&rsquo;s memory. The file is not sent to us, not stored by us and not visible to us. We cannot recover a file, a result or a password you set if you lose it.</p>

        <h2>The one tool that uses our server: HTML to PDF</h2>
        <p>A browser is not allowed to download other websites&rsquo; pages, so this tool sends the HTML text, the HTML file or the web address you enter to our server over HTTPS. The server turns it into a PDF and returns it. It does not store your HTML, your address or the PDF.</p>
        <p>If you enter a web address, our server downloads that public page. The website you named can therefore see a request from our server, not from you. The tool refuses private, local and internal addresses.</p>

        <h2>What we collect automatically</h2>
        <ul>
            <li><strong>Server logs.</strong> Like every website, the server that hosts this site records standard technical details of each request: your IP address, the time, the page requested and your browser type. We use them to keep the site secure and to fix errors.</li>
            <li><strong>A session.</strong> The site creates a session so that its forms are protected against forgery. The session record holds a random ID, your IP address, your browser type and the time of your last visit. It expires after about 2 hours of inactivity.</li>
            <li><strong>Rate limiting.</strong> To stop abuse, the number of recent requests from your IP address is counted for about a minute.</li>
        </ul>
        <p>We do not combine this information to build profiles, and we do not need your name or email address to run the tools.</p>

        <h2>Cookies and storage on your device</h2>
        <table class="table">
            <thead><tr><th>Name</th><th>What it does</th><th>How long</th></tr></thead>
            <tbody>
                <tr><td><code>{{ config('session.cookie') }}</code> (cookie)</td><td>Keeps your session. Strictly necessary.</td><td>Until you close the browser, or 2 hours of inactivity</td></tr>
                <tr><td><code>XSRF-TOKEN</code> (cookie)</td><td>Protects forms against forgery. Strictly necessary.</td><td>Same as the session</td></tr>
                <tr><td><code>ilikepdfs:theme</code> (local storage)</td><td>Remembers light or dark mode.</td><td>Until you clear site data</td></tr>
                <tr><td><code>ilikepdfs:options:&hellip;</code> (local storage)</td><td>Remembers the choices you made in a tool&rsquo;s options, such as quality. Never text, names or passwords.</td><td>Until you clear site data</td></tr>
                <tr><td>Offline copy (browser cache)</td><td>Only if you press &ldquo;Save for offline use&rdquo;: keeps this site&rsquo;s pages and scripts on your device so tools work without internet.</td><td>Until you clear site data</td></tr>
            </tbody>
        </table>
        <p>Local storage and the offline copy stay on your device and are never sent to us. Because we only use cookies and storage that the site needs or that you asked for, there is no cookie consent banner. You can delete all of it in your browser&rsquo;s site settings.</p>

        <h2>What we do not do</h2>
        <ul>
            <li>No advertising and no ad networks.</li>
            <li>No analytics or tracking scripts, and no social media buttons.</li>
            <li>No fonts, scripts, pictures or other files loaded from other companies: everything comes from this site.</li>
            <li>We do not sell or share your data.</li>
        </ul>

        <h2>Who else sees data</h2>
        <p>Our hosting provider stores the server logs described above on our behalf. When you use HTML to PDF with a web address, the website you named receives a request from our server. No one else receives anything.</p>

        <h2>How long we keep data</h2>
        <p>Sessions are removed after they expire. Rate-limit counters last about a minute. Server logs are kept by the hosting provider for as long as its settings say, normally days to weeks, and are not used for anything else.</p>

        <h2>Security</h2>
        <p>The site is served over HTTPS. Pages carry a strict content security policy that stops them from sending your documents to any other website. Passwords you type in tools (such as Protect PDF) are used only inside your browser.</p>

        <h2>Your rights</h2>
        <p>Depending on where you live, for example under India&rsquo;s Digital Personal Data Protection Act, 2023 or the EU&rsquo;s GDPR, you may have the right to ask what data we hold about you, to have it corrected or erased, and to object to its use. The only data we could hold about you is the technical information above (an IP address and browser type in logs and sessions). To make a request, @if (config('site.email'))email <a href="mailto:{{ config('site.email') }}">{{ config('site.email') }}</a>@else use the <a href="{{ route('contact') }}">contact page</a>@endif and tell us roughly when you visited, so we can find it.</p>

        <h2>Children</h2>
        <p>The site is not aimed at children and has no accounts. We do not knowingly collect personal information from children.</p>

        <h2>Changes to this policy</h2>
        <p>If we change this policy in a way that matters, for example by adding analytics or advertising, we will update the date at the top of this page before the change takes effect.</p>

        <h2>Contact</h2>
        <p>@if (config('site.email'))Questions about privacy: <a href="mailto:{{ config('site.email') }}">{{ config('site.email') }}</a>.@else See the <a href="{{ route('contact') }}">contact page</a>.@endif</p>
    </article>
@endsection
