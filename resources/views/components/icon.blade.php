@props(['name', 'size' => 28])

<svg width="{{ $size }}" height="{{ $size }}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    @switch($name)
        @case('merge')
            <path d="M6 3v6a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v4"/><path d="M18 3v6a4 4 0 0 1-4 4"/><path d="m15 18 3 3 3-3" transform="translate(-3 0)"/>
            @break
        @case('split')
            <path d="M12 3v7"/><path d="M12 10 5 17"/><path d="M12 10l7 7"/><path d="M5 21v-4h4"/><path d="M19 21v-4h-4"/>
            @break
        @case('compress')
            <path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/><path d="m3 21 7-7"/>
            @break
        @case('image-to-pdf')
            <rect x="3" y="4" width="12" height="12" rx="2"/><circle cx="7.5" cy="8.5" r="1.3"/><path d="m3 14 4-4 4 4 2-2 2 2"/><path d="M18 9h3v11H10v-2"/>
            @break
        @case('pdf-to-image')
            <path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5"/><circle cx="10" cy="13" r="1.2"/><path d="m7 19 3.5-3.5 2 2L15 15l2 4"/>
            @break
        @case('image-swap')
            <rect x="3" y="3" width="11" height="11" rx="2"/><circle cx="6.5" cy="6.8" r="1.1"/><path d="m3 12 3.5-3.5L9 11l2-2 3 3"/><path d="M17 11h4v10H11v-4"/><path d="m19 14-2-2-2 2"/>
            @break
        @case('text-scan')
            <path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 9h8M12 9v7"/>
            @break
        @case('resize')
            <rect x="4" y="4" width="16" height="16" rx="2"/><path d="M14 10V6h4"/><path d="m14 10 4-4"/><path d="M10 14v4H6"/><path d="m10 14-4 4"/>
            @break
        @case('unlock')
            <rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/><circle cx="12" cy="16" r="1.2"/>
            @break
        @case('hash')
            <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>
            @break
        @case('repair')
            <path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>
            @break
        @case('markdown')
            <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15V9l2.5 3L12 9v6M16 9v6m0 0-2-2m2 2 2-2"/>
            @break
        @case('sparkles')
            <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>
            @break
        @case('doc')
            <path d="M6 3h9l5 5v13H6z"/><path d="M15 3v5h5"/><path d="M9 12h8M9 16h8"/>
            @break
        @case('slides')
            <rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/><path d="M7 9h6M7 12h10"/>
            @break
        @case('table')
            <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>
            @break
        @case('pencil')
            <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14 7l3 3"/>
            @break
        @case('pen')
            <path d="M3 20c3-1 4-5 6-5 2 0 1 3 3 3 2 0 2-4 4-4 1.5 0 2 1.5 5 1"/><path d="M14 4l3 3-6 6H8v-3z"/>
            @break
        @case('code')
            <path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>
            @break
        @case('camera')
            <path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>
            @break
        @case('columns')
            <rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/><path d="M5.5 9h3M5.5 12h3M15.5 9h3M15.5 12h3"/>
            @break
        @case('redact')
            <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6 10h5M6 14h4" /><rect x="12" y="9" width="6" height="6" rx="1" fill="currentColor"/>
            @break
        @case('crop')
            <path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>
            @break
        @case('form')
            <rect x="4" y="3" width="16" height="18" rx="2"/><rect x="7" y="7" width="4" height="4" rx="1"/><path d="m8 9 1 1 1.5-2M13 8h4M13 12h4M7 16h10"/>
            @break
        @case('organize')
            <rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M14 17h6m-3-3v6"/>
            @break
        @case('rotate')
            <path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>
            @break
        @case('watermark')
            <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>
            @break
        @case('lock')
            <rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="16" r="1.2"/>
            @break
        @case('shield')
            <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>
            @break
        @case('bolt')
            <path d="M13 2 4 14h7l-1 8 9-12h-7z"/>
            @break
        @case('gift')
            <rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9"/><path d="M12 8v13"/><path d="M12 8c-2 0-4-1-4-3a2 2 0 0 1 4 0c0-2 4-2 4 0 0 2-2 3-4 3z"/>
            @break
        @case('arrow')
            <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
            @break
        @case('file')
            <path d="M6 3h9l5 5v13H6z"/><path d="M15 3v5h5"/><path d="M9 14h8M9 18h5"/>
            @break
    @endswitch
</svg>
