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

    public function terms(): View
    {
        return view('pages.terms', ['seo' => ToolSeo::forPage(
            'Terms of Use',
            'The simple rules for using ilikepdfs: use files you have the right to use, check every result, and understand the tools are provided as they are.',
            'terms',
            'Terms of use',
        )]);
    }

    public function contact(): View
    {
        return view('pages.contact', ['seo' => ToolSeo::forPage(
            'Contact',
            'How to contact ilikepdfs about a tool, a problem, feedback or a privacy request.',
            'contact',
            'Contact',
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
