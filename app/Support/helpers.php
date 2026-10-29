<?php

use Illuminate\Support\Facades\Route;

if (! function_exists('lroute')) {
    /**
     * Like route(), but keeps the visitor in their language: in Hindi it links to
     * the /hi version of a page when one exists.
     *
     * @param  array<string, mixed>|string  $parameters
     */
    function lroute(string $name, array|string $parameters = [], bool $absolute = true): string
    {
        $prefix = app()->getLocale() === 'hi' && Route::has('hi.'.$name) ? 'hi.' : '';

        return route($prefix.$name, $parameters, $absolute);
    }
}

if (! function_exists('locale_url')) {
    /**
     * The address of the current page in another language, or that language's home page.
     */
    function locale_url(string $locale): string
    {
        $current = Route::currentRouteName() ?? 'home';
        $base = str_starts_with($current, 'hi.') ? substr($current, 3) : $current;
        $target = $locale === 'hi' ? 'hi.'.$base : $base;

        if (Route::has($target)) {
            return route($target);
        }

        return route($locale === 'hi' ? 'hi.home' : 'home');
    }
}

if (! function_exists('tool_action')) {
    /**
     * The label of a tool's main button, in the visitor's language. Kept apart
     * from tool names because some names ("Merge PDF") are also button labels.
     */
    function tool_action(string $action): string
    {
        $translated = __('action:'.$action);

        return $translated === 'action:'.$action ? $action : $translated;
    }
}
