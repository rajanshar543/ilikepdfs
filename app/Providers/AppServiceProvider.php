<?php

namespace App\Providers;

use App\Services\DnsHostResolver;
use App\Services\HostResolver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        require_once app_path('Support/helpers.php');

        $this->app->bind(HostResolver::class, DnsHostResolver::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Separate named limiters: unnamed `throttle:N,M` limits share one counter per visitor.
        // Pages are cheap, static HTML. "Save for offline use" alone fetches about a hundred of them.
        RateLimiter::for('tools', fn (Request $request) => Limit::perMinute((int) config('app.tools_per_minute', 600))->by($request->ip()));
        RateLimiter::for('html-convert', fn (Request $request) => Limit::perMinute(6)->by($request->ip()));
    }
}
