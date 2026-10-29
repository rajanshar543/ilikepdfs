<?php

namespace App\Http\Controllers;

use App\Support\ToolSeo;
use Illuminate\View\View;

class HomeController extends Controller
{
    public function index(): View
    {
        $tools = collect(config('tools'))
            ->map(fn (array $tool, string $slug): array => ['slug' => $slug] + $tool)
            ->values()
            ->all();

        return view('home', [
            'categories' => [
                'all' => 'All',
                'organize' => 'Organize',
                'convert' => 'Convert',
                'image' => 'Images',
                'edit' => 'Edit',
                'security' => 'Security',
                'text' => 'Text & AI',
            ],
            'tools' => $tools,
            'seo' => ToolSeo::forHome(count($tools)),
        ]);
    }
}
