<?php

namespace App\Http\Controllers;

use App\Support\ToolSeo;
use Illuminate\View\View;

class PageController extends Controller
{
    public function about(): View
    {
        return view('pages.about', ['seo' => ToolSeo::forPage(
            'About ilikepdfs - Free PDF Tools That Run in Your Browser',
            'ilikepdfs is a free set of PDF and image tools that run inside your browser. Learn how it works, what stays on your device and what it can do.',
            'about',
            'About',
        )]);
    }

    public function privacy(): View
    {
        return view('pages.privacy', ['seo' => ToolSeo::forPage(
            'Privacy Policy - Your Files Stay on Your Device',
            'How ilikepdfs handles your files and data: almost every tool runs in your browser and nothing is uploaded. Read exactly what is and is not collected.',
            'privacy',
            'Privacy policy',
        )]);
    }
}
