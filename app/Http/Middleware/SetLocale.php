<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Pages under /hi are shown in Hindi.
 */
class SetLocale
{
    public function handle(Request $request, Closure $next): Response
    {
        // Not config('app.locale'): setLocale() overwrites it, which would keep Hindi after a Hindi request.
        app()->setLocale($request->segment(1) === 'hi' ? 'hi' : 'en');

        return $next($request);
    }
}
