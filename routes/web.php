<?php

use App\Http\Controllers\HomeController;
use App\Http\Controllers\OfflineController;
use App\Http\Controllers\PageController;
use App\Http\Controllers\SitemapController;
use App\Http\Controllers\Tools;
use Illuminate\Support\Facades\Route;

/*
| The home page and every tool page exist twice: in English at /, and in Hindi under /hi.
*/
$pages = function (): void {
    Route::get('/', [HomeController::class, 'index'])->name('home');

    Route::middleware('throttle:tools')->group(function (): void {
        foreach (config('tools') as $slug => $tool) {
            Route::get('/'.$slug, $tool['controller'])->name('tools.'.$slug);
        }
    });
};

Route::group([], $pages);
Route::prefix('hi')->name('hi.')->group($pages);

Route::get('/about', [PageController::class, 'about'])->name('about');
Route::get('/privacy', [PageController::class, 'privacy'])->name('privacy');
Route::get('/sitemap.xml', [SitemapController::class, 'sitemap'])->name('sitemap');
Route::get('/offline-assets.json', [OfflineController::class, 'assets'])->name('offline.assets');
Route::get('/manifest.webmanifest', [OfflineController::class, 'manifest'])->name('manifest');
Route::get('/robots.txt', [SitemapController::class, 'robots'])->name('robots');

Route::post('/html-to-pdf', [Tools\HtmlToPdfController::class, 'convert'])
    ->middleware('throttle:html-convert')
    ->name('tools.html-to-pdf.convert');
