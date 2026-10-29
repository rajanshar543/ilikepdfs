<?php

/*
| Search engine copy for every tool. `benefit` finishes the meta description, `intro` is the
| direct answer shown at the top of the page, and `faq` adds one tool-specific question.
*/

return [
    'site' => [
        'name' => 'ilikepdfs',
        'tagline' => 'Free PDF and image tools that run in your browser',
    ],

    'tools' => [
        'merge-pdf' => [
            'benefit' => 'combine several PDF files into one document in any order',
            'intro' => 'Merge PDF is a free online tool that joins two or more PDF files into a single document. You choose the files, drag them into the order you want, and download one combined PDF. It runs in your browser, so your documents are never uploaded to a server.',
            'faq' => ['How many PDF files can I merge at once?', 'You can merge up to 50 PDF files at a time, each up to 100 MB. Drag the file cards to set the order before you merge.'],
        ],
        'split-pdf' => [
            'benefit' => 'split a PDF into single pages, page ranges or extracted pages',
            'intro' => 'Split PDF is a free online tool that separates one PDF into several smaller files. You can save every page on its own, cut the document into ranges such as 1-3 and 5-8, or extract only the pages you need. Everything happens in your browser.',
            'faq' => ['Can I extract only some pages from a PDF?', 'Yes. Choose Extract pages into one PDF, type the pages you want, for example 2-4, 9, and you get a new PDF with only those pages.'],
        ],
        'compress-pdf' => [
            'benefit' => 'reduce PDF file size while keeping the text sharp',
            'intro' => 'Compress PDF is a free online tool that makes a PDF file smaller so it is easier to email or upload. It re-encodes the pictures inside the file and tidies its structure, and keeps text selectable. Your file stays on your device the whole time.',
            'faq' => ['How much smaller will my PDF get?', 'PDFs with large photos shrink the most, often by more than half. A PDF that is mostly text is already small, so the saving is smaller. If a file cannot be improved it is returned unchanged.'],
        ],
        'jpg-to-pdf' => [
            'benefit' => 'turn JPG photos into one PDF with the page size you choose',
            'intro' => 'JPG to PDF is a free online tool that puts one or many JPG images into a single PDF document. Choose A4, US Letter or the original image size, set the margin and order the pages. Photos are not recompressed, so quality stays as it was.',
        ],
        'png-to-pdf' => [
            'benefit' => 'turn PNG images into a PDF and keep transparency',
            'intro' => 'PNG to PDF is a free online tool that places one or many PNG images into a single PDF. Page size, orientation and margins are adjustable, and transparent PNG files are supported. Conversion happens in your browser, so nothing is uploaded.',
        ],
        'tiff-to-jpg' => [
            'benefit' => 'convert TIFF scans and photos, including multi-page files, to JPG',
            'intro' => 'TIFF to JPG is a free online tool that converts TIFF images to the smaller, widely supported JPG format. Multi-page TIFF scans are split into one JPG per page. The conversion runs in your browser and your files are not uploaded.',
        ],
        'pdf-to-jpg' => [
            'benefit' => 'convert every PDF page to a sharp JPG image',
            'intro' => 'PDF to JPG is a free online tool that turns each page of a PDF into a JPG picture. Pick the resolution and quality, or convert only selected pages. Download single images or all pages together as a ZIP file.',
            'faq' => ['What resolution should I choose for PDF to JPG?', 'Use 150 dpi for normal sharing and 220 dpi when you need crisp text or plan to print. 72 dpi is enough for small previews.'],
        ],
        'pdf-to-png' => [
            'benefit' => 'save PDF pages as lossless PNG images',
            'intro' => 'PDF to PNG is a free online tool that converts each PDF page into a lossless PNG image with sharp text. Choose the resolution and the pages you want, then download the images one by one or as a ZIP archive.',
        ],
        'png-to-jpg' => [
            'benefit' => 'shrink PNG images into smaller JPG files',
            'intro' => 'PNG to JPG is a free online tool that converts PNG images to JPG to make the files smaller. Transparent areas are filled with a colour you choose, and you set the quality. Conversion runs in your browser.',
        ],
        'jpg-to-png' => [
            'benefit' => 'convert JPG photos to lossless PNG',
            'intro' => 'JPG to PNG is a free online tool that converts JPG photos into PNG images. PNG is lossless, which makes it useful for editing and for images with sharp edges. The files are converted on your device and never uploaded.',
        ],
        'webp-to-jpg' => [
            'benefit' => 'convert WebP images to JPG so they open everywhere',
            'intro' => 'WebP to JPG is a free online tool that converts WebP images into regular JPG files that every phone, editor and website accepts. Choose the quality and download the result instantly. Your images stay on your device.',
        ],
        'heic-to-jpg' => [
            'benefit' => 'convert iPhone HEIC and HEIF photos to JPG',
            'intro' => 'HEIC to JPG is a free online tool that converts photos taken on an iPhone or iPad from the HEIC format to JPG. JPG opens on Windows, Android and every website. The conversion runs in your browser, so your photos stay private.',
            'faq' => ['Why can I not open my iPhone photos on Windows?', 'iPhones save photos as HEIC by default, a format many Windows and Android apps cannot open. Converting them to JPG makes them open everywhere.'],
        ],
        'convert-to-webp' => [
            'benefit' => 'convert JPG and PNG images to smaller WebP files',
            'intro' => 'Image to WebP is a free online tool that converts JPG and PNG images to WebP, a modern format that is usually much smaller at the same quality. It is useful for faster websites. Files are converted in your browser.',
        ],
        'svg-to-png' => [
            'benefit' => 'render SVG graphics as PNG at 1x to 4x size',
            'intro' => 'SVG to PNG is a free online tool that renders SVG vector graphics as PNG images. Choose a scale from 1x to 4x for a sharper result. Scripts inside the SVG are never run, and nothing is uploaded.',
        ],
        'image-to-text' => [
            'benefit' => 'extract text from photos and scans with free OCR in English and Hindi',
            'intro' => 'Image to Text is a free online OCR tool that reads the text in a photo or scan and gives it to you as plain text. It supports English and Hindi and runs in your browser, so your images are not uploaded.',
            'faq' => ['Does Image to Text work with Hindi?', 'Yes. Choose Hindi, or English and Hindi, before you start. Clear, high-resolution images with dark text on a light background give the best results.'],
        ],
        'compress-image' => [
            'benefit' => 'reduce JPG, PNG and WebP file size without visible loss',
            'intro' => 'Compress Image is a free online tool that makes JPG, PNG and WebP files smaller. Choose smallest file, balanced or best quality. Images that cannot be improved are returned unchanged, and nothing is uploaded.',
        ],
        'resize-image' => [
            'benefit' => 'change image dimensions by pixels or percentage',
            'intro' => 'Resize Image is a free online tool that changes the size of JPG, PNG and WebP images by percentage, width, height or an exact size. You can keep the proportions. Resizing happens on your device.',
        ],
        'rotate-pdf' => [
            'benefit' => 'rotate all PDF pages or only the ones you choose, permanently',
            'intro' => 'Rotate PDF is a free online tool that turns PDF pages by 90, 180 or 270 degrees and saves the change permanently. Rotate the whole document or only selected pages. Your file is processed in your browser.',
        ],
        'watermark-pdf' => [
            'benefit' => 'stamp a text watermark on your PDF pages',
            'intro' => 'Watermark PDF is a free online tool that stamps text such as CONFIDENTIAL or DRAFT across your PDF pages. Choose the placement, colour, size and strength, and apply it to all pages or only some. It works in your browser.',
        ],
        'protect-pdf' => [
            'benefit' => 'lock a PDF with a password using AES-256 encryption',
            'intro' => 'Protect PDF is a free online tool that adds a password to a PDF using AES-256 encryption. Choose whether people who open it may print, copy or edit. Your file and your password never leave your device.',
            'faq' => ['Can you recover my PDF password if I forget it?', 'No. The password is never sent to us, so it cannot be recovered. Keep it somewhere safe, because nobody can open the file without it.'],
        ],
        'compress-pdf-to-size' => [
            'benefit' => 'make a PDF smaller than 100 KB, 200 KB, 1 MB or any size you choose',
            'intro' => 'Compress PDF to Size is a free online tool that makes a PDF smaller than the size you choose, for example 100 KB or 200 KB for an application form or an email. It uses the gentlest compression that is enough, and it runs in your browser so your file is never uploaded.',
            'faq' => ['How do I compress a PDF to 100 KB?', 'Choose your PDF, pick 100 KB as the target size and press Compress to size. If the PDF has large pictures it is usually possible without visible loss. If not, you are told when pages had to be turned into pictures.'],
        ],
        'compress-image-to-size' => [
            'benefit' => 'get a JPG under 20 KB, 50 KB, 100 KB or any size limit',
            'intro' => 'Compress Image to Size is a free online tool that turns a photo into a JPG under the size limit you set, such as 20 KB, 50 KB or 100 KB. It lowers the quality as little as possible and only makes the picture smaller if it must. Nothing is uploaded.',
            'faq' => ['How can I reduce a photo to 50 KB for a form?', 'Add the photo, choose 50 KB and press Compress to size. The tool finds the highest JPG quality that fits under 50 KB, and shrinks the picture a little only if the quality alone is not enough.'],
        ],
        'photo-signature-resize' => [
            'benefit' => 'resize a photo or signature to an exact size and file size for forms',
            'intro' => 'Photo & Signature Resize is a free online tool that makes a photo or signature the exact pixel size an application form asks for, and keeps the file under a size limit such as 50 KB. Choose a preset or your own size. Your pictures stay on your device.',
            'faq' => ['What size should my passport photo or signature be?', 'It depends on the form, so check its rules. Choose the nearest preset or enter your own width and height in pixels, millimetres, centimetres or inches, and add the file size limit the form mentions.'],
        ],
        'mask-id' => [
            'benefit' => 'hide Aadhaar, PAN, mobile or card numbers in a PDF or photo before you share it',
            'intro' => 'Mask Aadhaar & PAN is a free online tool that hides part of the personal numbers in a PDF or a photo of a document, such as the first 8 digits of an Aadhaar number. It runs in your browser, so your documents are never uploaded, and PDF pages are flattened so the hidden digits are really gone.',
            'faq' => ['How do I mask my Aadhaar number before sharing it?', 'Add your Aadhaar PDF or photo, keep Aadhaar number ticked and press Hide numbers. The first 8 digits are covered and the last 4 stay visible. Check the result, because blurry photos may need a clearer picture.'],
        ],
        'pdf-workflow' => [
            'benefit' => 'chain steps like merge, compress, page numbers, watermark and password in one go',
            'intro' => 'PDF Workflow is a free online tool that runs several PDF jobs one after another, such as merge, compress, add page numbers, watermark and protect with a password. Pick a ready-made workflow or build your own. Everything runs in your browser, so your files are never uploaded.',
            'faq' => ['What is a PDF workflow?', 'A workflow is a list of steps that run in order, each on the result of the step before. For example: merge three PDFs, add page numbers, compress the result and protect it with a password, all with one click.'],
        ],
        'unlock-pdf' => [
            'benefit' => 'remove the password from a PDF you have the password for',
            'intro' => 'Unlock PDF is a free online tool that removes password protection from a PDF when you know the password. It also removes print and edit restrictions from files that open without a password. It cannot crack unknown passwords.',
            'faq' => ['Can Unlock PDF crack a password I do not know?', 'No. It only removes protection from files you can already open with the correct password, or files that only restrict printing and editing.'],
        ],
        'page-numbers' => [
            'benefit' => 'add page numbers to a PDF with position and format options',
            'intro' => 'Page Numbers is a free online tool that adds numbers to every page of a PDF. Choose the position, format such as Page 1 of 10, the first number and the pages to number. It runs in your browser.',
        ],
        'repair-pdf' => [
            'benefit' => 'recover a damaged PDF and rebuild a clean copy',
            'intro' => 'Repair PDF is a free online tool that tries to fix a damaged or corrupt PDF. It first repairs the file structure, and if that fails it rebuilds the pages as images so you can still recover your content.',
        ],
        'pdf-to-markdown' => [
            'benefit' => 'turn a PDF into Markdown with headings, lists and links',
            'intro' => 'PDF to Markdown is a free online tool that converts a PDF into a Markdown file. Headings are detected from font size, and lists and links are kept. It suits notes, documentation and AI workflows, and it runs in your browser.',
        ],
        'pdf-summarizer' => [
            'benefit' => 'pull the key sentences out of a long PDF or text file',
            'intro' => 'PDF Summarizer is a free online tool that selects the most important sentences from a PDF or text file. It does not use an AI service: the analysis runs on your device, and the summary uses sentences that already exist in your document.',
            'faq' => ['Does the PDF Summarizer use AI?', 'It does not use a generative AI service. It ranks the sentences of your document by how well they represent its main topics and shows the best ones, so nothing is invented and nothing is uploaded.'],
        ],
        'pdf-to-word' => [
            'benefit' => 'convert a PDF into an editable Word DOCX',
            'intro' => 'PDF to Word is a free online tool that converts a PDF into an editable Word document in DOCX format. Text, headings and lists are kept so you can edit them. Complex layouts and tables may need tidying afterwards.',
            'faq' => ['Will PDF to Word keep my layout and tables?', 'It keeps the text, headings and lists. Page layout, tables and pictures are not reproduced, so a complex PDF may need some formatting in Word. Scanned PDFs need OCR PDF first.'],
        ],
        'pdf-to-powerpoint' => [
            'benefit' => 'turn every PDF page into a PowerPoint slide',
            'intro' => 'PDF to PowerPoint is a free online tool that converts each page of a PDF into a slide in a PPTX file. Slides look exactly like the PDF pages because each page is placed as a picture, so the text on the slides is not editable.',
        ],
        'pdf-to-excel' => [
            'benefit' => 'pull tables and data from a PDF into an Excel spreadsheet',
            'intro' => 'PDF to Excel is a free online tool that converts the tables in a PDF into an XLSX spreadsheet. Columns are found from how the text lines up, and numbers become real numeric cells. It works with PDFs that contain real text, not scans.',
        ],
        'word-to-pdf' => [
            'benefit' => 'convert a Word DOCX document to PDF',
            'intro' => 'Word to PDF is a free online tool that converts a Word DOCX file into a PDF. Text, headings, lists, tables and pictures are kept, and English and Hindi text are supported. Fonts and exact layout can differ slightly from Word.',
        ],
        'powerpoint-to-pdf' => [
            'benefit' => 'convert a PowerPoint PPTX presentation to PDF',
            'intro' => 'PowerPoint to PDF is a free online tool that converts a PPTX presentation into a PDF with one page per slide. Text boxes, shapes, pictures and simple tables are drawn on each page. Animations and charts are not included.',
        ],
        'excel-to-pdf' => [
            'benefit' => 'convert an Excel XLSX spreadsheet to a paginated PDF',
            'intro' => 'Excel to PDF is a free online tool that converts an XLSX spreadsheet into a neat PDF. Every sheet becomes paginated tables, and wide tables continue on following pages. The conversion runs in your browser.',
        ],
        'ocr-pdf' => [
            'benefit' => 'make a scanned PDF searchable and selectable',
            'intro' => 'OCR PDF is a free online tool that adds an invisible text layer to a scanned PDF so you can search it and copy its text. The pages look exactly the same afterwards. It supports English and Hindi and runs in your browser.',
            'faq' => ['What is OCR and why do I need it for a scanned PDF?', 'OCR means optical character recognition. A scanned PDF is only a picture of text, so you cannot search or copy it. OCR reads the picture and adds real text behind it.'],
        ],
        'scan-to-pdf' => [
            'benefit' => 'photograph documents with your phone and save them as a clean PDF',
            'intro' => 'Scan to PDF is a free online tool that turns photos of documents into a clean PDF. It evens out the lighting and can make pages grey or black and white. On a phone you can take the photos with the camera button.',
        ],
        'organize-pdf' => [
            'benefit' => 'reorder, rotate, delete and add PDF pages',
            'intro' => 'Organize PDF is a free online tool that lets you change the pages of a PDF. Drag pages into a new order, rotate or remove them, and add pages from other PDF files. You see a preview of every page.',
        ],
        'compare-pdf' => [
            'benefit' => 'find the differences between two versions of a PDF',
            'intro' => 'Compare PDF is a free online tool that compares an old and a new PDF page by page. It gives you a report with both pages side by side and the changed areas in red, plus a list of the words that were added or removed.',
        ],
        'redact-pdf' => [
            'benefit' => 'permanently remove sensitive text and graphics from a PDF',
            'intro' => 'Redact PDF is a free online tool that permanently removes sensitive information from a PDF. Pages with redactions are flattened into pictures, so the hidden text is really gone from the file. Search for words or draw over areas.',
            'faq' => ['Is redaction in Redact PDF permanent?', 'Yes. Each page that has a redaction is redrawn as a picture with black boxes, so the covered text and graphics no longer exist in the file. Pages without redactions are left unchanged.'],
        ],
        'crop-pdf' => [
            'benefit' => 'trim the margins of PDF pages',
            'intro' => 'Crop PDF is a free online tool that trims the margins of a PDF. Draw the area you want to keep on a page and apply it to that page or to all pages. The visible area changes; the cut content stays in the file.',
        ],
        'edit-pdf' => [
            'benefit' => 'add text, shapes, pictures and drawings to a PDF',
            'intro' => 'Edit PDF is a free online tool that lets you add text, rectangles, ellipses, lines, freehand drawings and pictures to a PDF page. Move, resize or delete anything you add, then save the result.',
        ],
        'sign-pdf' => [
            'benefit' => 'sign a PDF by drawing or typing your signature',
            'intro' => 'Sign PDF is a free online tool that adds your signature to a PDF. Draw it with your mouse or finger, or type your name, then place it on the page and resize it. It adds a visible signature, not a digital certificate.',
            'faq' => ['Is the signature added by Sign PDF legally valid?', 'It adds a visible signature image, which is accepted for many everyday agreements. It is not a certificate-based digital signature, so for contracts that require one, check the rules that apply to you.'],
        ],
        'pdf-forms' => [
            'benefit' => 'fill in PDF forms or add fillable fields',
            'intro' => 'PDF Forms is a free online tool that fills in the form fields of a PDF and lets you add new text boxes and checkboxes. You can flatten the form when you save it so it can no longer be edited.',
        ],
        'html-to-pdf' => [
            'benefit' => 'convert pasted HTML, an HTML file or a web page address to PDF',
            'intro' => 'HTML to PDF is a free online tool that converts HTML code, an HTML file or a public web page address into a PDF. Unlike our other tools it needs our server to do this, and nothing you send is stored.',
            'faq' => ['Is my HTML or web address stored?', 'No. The HTML or address is sent to our server only to make the PDF, and it is not stored. Pictures and styles hosted on other sites are not loaded.'],
        ],
    ],
];
