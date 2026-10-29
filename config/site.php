<?php

/*
| Who runs the site. Shown on the About, Privacy, Terms and Contact pages. Set these in .env;
| anything left empty is simply left out, so no page ever shows a made-up name or address.
*/
return [
    'owner' => env('SITE_OWNER'),
    'email' => env('SITE_CONTACT_EMAIL'),
    'country' => env('SITE_COUNTRY'),

    // Change this date whenever the policy or terms change in a way that matters.
    'legal_updated' => '2026-10-29',
];
