<?php

namespace App\Support;

/**
 * Everything a search engine (and an AI answer engine) reads about a page:
 * title, description, canonical address, the visible explanation, FAQ, steps
 * and the matching JSON-LD structured data.
 */
class ToolSeo
{
    private const CATEGORY_LABELS = [
        'organize' => 'Organize PDF',
        'convert' => 'Convert PDF',
        'image' => 'Image tools',
        'edit' => 'Edit PDF',
        'security' => 'PDF security',
        'text' => 'Text & AI',
    ];

    public static function categoryLabel(string $key): string
    {
        return __(self::CATEGORY_LABELS[$key] ?? ucfirst($key));
    }

    private static function hindi(): bool
    {
        return app()->getLocale() === 'hi';
    }

    /**
     * @return array{en: string, hi: string}
     */
    private static function alternates(string $name): array
    {
        return ['en' => route($name), 'hi' => route('hi.'.$name)];
    }

    /**
     * @param  array<string, mixed>  $tool
     * @return array<string, mixed>
     */
    public static function forTool(string $slug, array $tool): array
    {
        $site = config('seo.site.name');
        $copy = config("seo.tools.$slug", []);
        $name = $tool['name'];
        $url = lroute('tools.'.$slug);
        $category = $tool['categories'][0];
        $faq = self::faq($tool, $copy);
        $steps = self::steps($tool);

        $seo = [
            'title' => self::title($tool, $site),
            'description' => self::description($tool, $copy),
            'canonical' => $url,
            'alternates' => self::alternates('tools.'.$slug),
            'type' => 'website',
            'image' => asset('og-default.png'),
            'intro' => self::intro($tool, $copy),
            'steps' => $steps,
            'faq' => $faq,
            'related' => self::related($slug, $tool),
            'breadcrumbs' => [
                ['name' => __('Home'), 'url' => lroute('home')],
                ['name' => self::categoryLabel($category), 'url' => lroute('home').'#tools'],
                ['name' => __($name), 'url' => $url],
            ],
        ];

        $seo['jsonld'] = [
            [
                '@context' => 'https://schema.org',
                '@type' => 'WebApplication',
                'name' => __($name),
                'url' => $url,
                'inLanguage' => self::hindi() ? 'hi' : 'en',
                'description' => $seo['description'],
                'applicationCategory' => 'UtilitiesApplication',
                'operatingSystem' => 'Any (web browser)',
                'browserRequirements' => 'Requires a modern web browser with JavaScript',
                'isAccessibleForFree' => true,
                'offers' => ['@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'USD'],
                'publisher' => ['@type' => 'Organization', 'name' => $site, 'url' => lroute('home')],
            ],
            self::breadcrumbSchema($seo['breadcrumbs']),
            self::faqSchema($faq),
            [
                '@context' => 'https://schema.org',
                '@type' => 'HowTo',
                'name' => self::hindi() ? __('How to use :name', ['name' => __($name)]) : "How to use $name",
                'step' => array_map(fn (array $step, int $index): array => [
                    '@type' => 'HowToStep',
                    'position' => $index + 1,
                    'name' => $step['name'],
                    'text' => $step['text'],
                ], $steps, array_keys($steps)),
            ],
        ];

        return $seo;
    }

    /**
     * @return array<string, mixed>
     */
    public static function forHome(int $toolCount): array
    {
        $site = config('seo.site.name');
        $faq = self::homeFaq($toolCount);
        $tools = collect(config('tools'))->map(fn (array $tool, string $slug): array => ['slug' => $slug] + $tool)->values();

        $hindi = self::hindi();

        return [
            'title' => $hindi ? "मुफ़्त PDF और इमेज टूल, बिना अपलोड | $site" : 'Free PDF & Image Tools Online, No Upload | '.$site,
            'description' => $hindi
                ? "$toolCount मुफ़्त टूल: PDF मर्ज, स्प्लिट, कंप्रेस, कन्वर्ट, साइन और एडिट। बिना साइन-अप, बिना वॉटरमार्क, और फ़ाइलें आपके डिवाइस पर ही रहती हैं।"
                : "$toolCount free online tools to merge, split, compress, convert, sign and edit PDFs and images. No sign-up, no watermark, and your files never leave your device.",
            'canonical' => lroute('home'),
            'alternates' => self::alternates('home'),
            'type' => 'website',
            'image' => asset('og-default.png'),
            'faq' => $faq,
            'jsonld' => [
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'WebSite',
                    'name' => $site,
                    'url' => lroute('home'),
                    'description' => config('seo.site.tagline'),
                    'inLanguage' => $hindi ? 'hi' : 'en',
                ],
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'Organization',
                    'name' => $site,
                    'url' => lroute('home'),
                    'logo' => asset('favicon.svg'),
                ],
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'ItemList',
                    'name' => "$site tools",
                    'numberOfItems' => $tools->count(),
                    'itemListElement' => $tools->map(fn (array $tool, int $index): array => [
                        '@type' => 'ListItem',
                        'position' => $index + 1,
                        'name' => __($tool['name']),
                        'url' => lroute('tools.'.$tool['slug']),
                    ])->all(),
                ],
                self::faqSchema($faq),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function forPage(string $title, string $description, string $route, string $crumb): array
    {
        $url = route($route);

        return [
            'title' => $title.' | '.config('seo.site.name'),
            'description' => $description,
            'canonical' => $url,
            'type' => 'website',
            'image' => asset('og-default.png'),
            'jsonld' => [self::breadcrumbSchema([
                ['name' => 'Home', 'url' => route('home')],
                ['name' => $crumb, 'url' => $url],
            ])],
        ];
    }

    private static function title(array $tool, string $site): string
    {
        if (self::hindi()) {
            return __($tool['name']).' - मुफ़्त ऑनलाइन | '.$site;
        }

        $name = $tool['name'];
        $conversion = isset($tool['from'], $tool['to']) && ! in_array($tool['to'], ['TXT', 'MD'], true);

        $candidates = $conversion
            ? ["$name Converter - Free Online | $site", "$name - Free Online | $site"]
            : ["$name Online - Free & Private | $site", "$name - Free Online | $site"];

        foreach ($candidates as $title) {
            if (mb_strlen($title) <= 60) {
                return $title;
            }
        }

        return $candidates[array_key_last($candidates)];
    }

    private static function description(array $tool, array $copy): string
    {
        if (self::hindi()) {
            $end = isset($tool['privacy_note'])
                ? ' मुफ़्त और बिना साइन-अप। आप जो भेजते हैं वह सेव नहीं किया जाता।'
                : ' मुफ़्त, बिना साइन-अप और बिना वॉटरमार्क। आपकी फ़ाइलें आपके ब्राउज़र में ही रहती हैं।';

            return __($tool['description']).$end;
        }

        $benefit = rtrim($copy['benefit'] ?? mb_strtolower($tool['description']), '.');
        $sentence = ucfirst($benefit).' with '.$tool['name'].'.';
        $endings = isset($tool['privacy_note'])
            ? [' Free, no sign-up, no watermark, and nothing you send is stored.', ' Free, no sign-up, nothing is stored.']
            : [' Free, no sign-up, no watermark, and your files stay private in your browser.', ' Free, no sign-up, and your files stay in your browser.', ' Free and private.'];

        foreach ($endings as $ending) {
            if (mb_strlen($sentence.$ending) <= 160) {
                return $sentence.$ending;
            }
        }

        return $sentence.$endings[array_key_last($endings)];
    }

    /**
     * @param  array<string, mixed>  $copy
     */
    private static function intro(array $tool, array $copy): string
    {
        if (self::hindi()) {
            $name = __($tool['name']);

            return isset($tool['privacy_note'])
                ? "$name: ".__($tool['description']).' यह मुफ़्त है। इसके लिए आपका HTML या वेब पता हमारे सर्वर पर भेजा जाता है, पर सेव नहीं किया जाता।'
                : "$name: ".__($tool['description']).' यह मुफ़्त है और आपके ब्राउज़र में चलता है, इसलिए आपकी फ़ाइलें अपलोड नहीं होतीं।';
        }

        return $copy['intro'] ?? $tool['description'];
    }

    /**
     * @return list<array{name: string, text: string}>
     */
    private static function steps(array $tool): array
    {
        $name = $tool['name'];

        if (self::hindi()) {
            return [
                ['name' => ($tool['no_file'] ?? false) ? 'अपना HTML डालें' : ($tool['multiple'] ? 'अपनी फ़ाइलें चुनें' : 'अपनी फ़ाइल चुनें'), 'text' => ($tool['no_file'] ?? false) ? 'HTML पेस्ट करें, HTML फ़ाइल चुनें या किसी वेब पेज का पता लिखें।' : 'अपने डिवाइस से फ़ाइल चुनें या उसे पेज पर छोड़ दें।'],
                ['name' => 'विकल्प चुनें', 'text' => 'साइड पैनल में '.__($name).' के विकल्प बदलें। चाहें तो डिफ़ॉल्ट ही रहने दें।'],
                ['name' => 'नतीजा डाउनलोड करें', 'text' => '"'.tool_action($tool['action']).'" दबाएँ और अपनी फ़ाइल डाउनलोड करें। कई नतीजे ZIP में एक साथ भी मिल सकते हैं।'],
            ];
        }

        if ($tool['no_file'] ?? false) {
            return [
                ['name' => 'Add your HTML', 'text' => 'Paste HTML, choose an HTML file, or enter the address of a public web page.'],
                ['name' => 'Choose the page settings', 'text' => 'Pick the page size, orientation and margin in the side panel.'],
                ['name' => 'Convert and download', 'text' => 'Press the button and download your PDF.'],
            ];
        }

        $many = $tool['multiple'];

        return [
            ['name' => $many ? 'Choose your files' : 'Choose your file', 'text' => ($many ? 'Select the files from your device or drop them onto the page.' : 'Select the file from your device or drop it onto the page.')],
            ['name' => 'Adjust the settings', 'text' => "Use the side panel to set the options for $name. You can leave the defaults if they suit you."],
            ['name' => 'Download the result', 'text' => 'Press "'.$tool['action'].'" and download your file. Many results can be downloaded together as a ZIP.'],
        ];
    }

    /**
     * @return list<array{question: string, answer: string}>
     */
    private static function faq(array $tool, array $copy): array
    {
        $name = $tool['name'];
        $server = isset($tool['privacy_note']);
        $files = $tool['max_files'] === 1 ? 'one file' : 'up to '.$tool['max_files'].' files';

        if (self::hindi()) {
            $hi = __($name);
            $count = $tool['max_files'] === 1 ? '1 फ़ाइल' : $tool['max_files'].' फ़ाइलें तक';

            return [
                ['question' => "क्या $hi सच में मुफ़्त है?", 'answer' => "हाँ। $hi पूरी तरह मुफ़्त है। न साइन-अप, न वॉटरमार्क, न रोज़ की कोई सीमा।"],
                ['question' => "क्या $hi इस्तेमाल करने पर मेरी फ़ाइलें अपलोड होती हैं?", 'answer' => $server
                    ? 'आपका HTML या वेब पता PDF बनाने के लिए ही हमारे सर्वर पर भेजा जाता है और सेव नहीं किया जाता। दूसरी साइटों की तस्वीरें और स्टाइल लोड नहीं होते।'
                    : "नहीं। $hi आपके ब्राउज़र के अंदर चलता है, इसलिए फ़ाइलें आपके डिवाइस पर ही रहती हैं और हमारे सर्वर पर कभी नहीं भेजी जातीं।"],
                ['question' => "$hi की सीमाएँ क्या हैं?", 'answer' => "एक बार में $count, हर फ़ाइल {$tool['max_file_mb']} MB तक। बहुत बड़ी फ़ाइलें आपके डिवाइस की मेमोरी पर निर्भर करती हैं।"],
                ['question' => "क्या $hi फ़ोन पर चलता है?", 'answer' => 'हाँ। यह Android, iPhone, Windows, Mac और Linux के किसी भी आधुनिक ब्राउज़र में चलता है। कुछ इंस्टॉल नहीं करना पड़ता।'],
                ['question' => "$hi कैसे करें?", 'answer' => $server
                    ? "ऊपर के बॉक्स में HTML पेस्ट करें, HTML फ़ाइल चुनें या वेब पता लिखें। पेज साइज़ चुनें और '".tool_action($tool['action'])."' दबाएँ। PDF डाउनलोड हो जाएगी।"
                    : "ऊपर 'फ़ाइल चुनें' दबाकर अपनी फ़ाइल चुनें या उसे पेज पर छोड़ें। ज़रूरत हो तो साइड के विकल्प बदलें, फिर '".tool_action($tool['action'])."' दबाएँ और नतीजा डाउनलोड करें।"],
            ];
        }

        $faq = [
            ['question' => "Is $name really free?", 'answer' => "Yes. $name is completely free. There is no sign-up, no watermark and no daily limit."],
            ['question' => "Are my files uploaded when I use $name?", 'answer' => $server
                ? 'The HTML or web address you enter is sent to our server only to make the PDF, and it is not stored. Pictures and styles hosted on other sites are not loaded.'
                : "No. $name runs inside your browser, so your files stay on your device and are never sent to our server."],
        ];

        if (isset($copy['faq'])) {
            $faq[] = ['question' => $copy['faq'][0], 'answer' => $copy['faq'][1]];
        }

        $faq[] = ['question' => "What are the limits of $name?", 'answer' => "You can use $files at a time, each up to {$tool['max_file_mb']} MB. Very large files depend on your device's memory."];
        $faq[] = ['question' => "Does $name work on a phone?", 'answer' => 'Yes. It works in any modern browser on Android, iPhone, Windows, Mac and Linux. Nothing needs to be installed.'];
        $faq[] = ['question' => "$name kaise kare? (Hindi)", 'answer' => $server
            ? "Upar diye box mein HTML paste kijiye, HTML file chuniye ya web address likhiye. Page size chuniye aur '{$tool['action']}' dabaiye. PDF download ho jayegi."
            : "Upar 'Choose file' dabakar apni file chuniye ya use page par drop kijiye. Zarurat ho to side ke options badaliye, phir '{$tool['action']}' dabaiye aur result download kijiye. Aapki file server par upload nahi hoti."];

        return $faq;
    }

    /**
     * @return list<array{name: string, url: string, description: string}>
     */
    private static function related(string $slug, array $tool): array
    {
        $shared = collect(config('tools'))
            ->reject(fn (array $other, string $key): bool => $key === $slug)
            ->map(fn (array $other, string $key): array => ['slug' => $key, 'score' => count(array_intersect($tool['categories'], $other['categories'])) * 10 + ($other['categories'][0] === $tool['categories'][0] ? 5 : 0)] + $other)
            ->filter(fn (array $other): bool => $other['score'] > 0)
            ->sortByDesc('score')
            ->take(6);

        return $shared->map(fn (array $other): array => [
            'name' => __($other['name']),
            'url' => lroute('tools.'.$other['slug']),
            'description' => __($other['description']),
        ])->values()->all();
    }

    /**
     * @return list<array{question: string, answer: string}>
     */
    private static function homeFaq(int $toolCount): array
    {
        if (self::hindi()) {
            return [
                ['question' => 'ilikepdfs क्या है?', 'answer' => "ilikepdfs PDF और इमेज के लिए $toolCount टूल वाली मुफ़्त वेबसाइट है। बिना अकाउंट बनाए और बिना कुछ इंस्टॉल किए आप दस्तावेज़ मर्ज, स्प्लिट, कंप्रेस, कन्वर्ट, साइन, एडिट और सुरक्षित कर सकते हैं।"],
                ['question' => 'क्या मेरी फ़ाइलें किसी सर्वर पर अपलोड होती हैं?', 'answer' => 'लगभग सभी टूल आपके ब्राउज़र में चलते हैं, इसलिए फ़ाइलें आपके डिवाइस पर ही रहती हैं। सिर्फ़ HTML से PDF अपवाद है, जिसे वेब पेज पढ़ने के लिए हमारे सर्वर की ज़रूरत होती है और जो कुछ भी सेव नहीं करता।'],
                ['question' => 'क्या ilikepdfs सच में मुफ़्त है?', 'answer' => 'हाँ। हर टूल मुफ़्त है: न साइन-अप, न वॉटरमार्क, न रोज़ की कोई सीमा।'],
                ['question' => 'PDF के कौन-कौन से टूल मिलते हैं?', 'answer' => 'मर्ज, स्प्लिट, कंप्रेस, रोटेट, पेज व्यवस्थित करना, क्रॉप, पासवर्ड लगाना और हटाना, साइन, जानकारी छिपाना, वॉटरमार्क, पेज नंबर, मरम्मत, OCR, तुलना, फ़ॉर्म और एडिट। साथ ही PDF से Word, Excel, PowerPoint, इमेज, HTML और Markdown में कन्वर्ट करना।'],
                ['question' => 'PDF को 100 KB में कैसे कंप्रेस करें?', 'answer' => "ऊपर खोज बॉक्स में 'compress' लिखें और 'PDF को साइज़ में कंप्रेस करें' चुनें। फ़ाइल चुनकर 100 KB तय करें और बटन दबाएँ। साइन-अप नहीं चाहिए और फ़ाइल आपके डिवाइस पर ही रहती है।"],
            ];
        }

        return [
            ['question' => 'What is ilikepdfs?', 'answer' => "ilikepdfs is a free website with $toolCount tools for PDF files and images. You can merge, split, compress, convert, sign, edit and protect documents without creating an account or installing anything."],
            ['question' => 'Are my files uploaded to a server?', 'answer' => 'Almost all tools run inside your browser, so your files stay on your device. The only exception is HTML to PDF, which needs our server to read web pages and does not store what you send.'],
            ['question' => 'Is ilikepdfs really free?', 'answer' => 'Yes. Every tool is free to use with no sign-up, no watermark and no daily limit.'],
            ['question' => 'Which PDF tools are available?', 'answer' => 'Merge, split, compress, rotate, organize, crop, protect, unlock, sign, redact, watermark, page numbers, repair, OCR, compare, forms and editing, plus conversion between PDF and Word, Excel, PowerPoint, images, HTML and Markdown.'],
            ['question' => 'PDF ko free mein kaise edit ya compress kare?', 'answer' => 'Upar search box mein tool ka naam likhiye, jaise merge ya compress, phir apni file chuniye aur button dabaiye. Koi sign-up nahi chahiye aur file aapke device par hi rehti hai.'],
        ];
    }

    /**
     * @param  list<array{name: string, url: string}>  $crumbs
     * @return array<string, mixed>
     */
    private static function breadcrumbSchema(array $crumbs): array
    {
        return [
            '@context' => 'https://schema.org',
            '@type' => 'BreadcrumbList',
            'itemListElement' => array_map(fn (array $crumb, int $index): array => [
                '@type' => 'ListItem',
                'position' => $index + 1,
                'name' => $crumb['name'],
                'item' => $crumb['url'],
            ], $crumbs, array_keys($crumbs)),
        ];
    }

    /**
     * @param  list<array{question: string, answer: string}>  $faq
     * @return array<string, mixed>
     */
    private static function faqSchema(array $faq): array
    {
        return [
            '@context' => 'https://schema.org',
            '@type' => 'FAQPage',
            'mainEntity' => array_map(fn (array $entry): array => [
                '@type' => 'Question',
                'name' => $entry['question'],
                'acceptedAnswer' => ['@type' => 'Answer', 'text' => $entry['answer']],
            ], $faq),
        ];
    }
}
