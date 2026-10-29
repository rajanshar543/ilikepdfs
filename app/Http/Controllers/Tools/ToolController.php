<?php

namespace App\Http\Controllers\Tools;

use App\Http\Controllers\Controller;
use App\Support\ToolSeo;
use Illuminate\View\View;

/**
 * Base for every tool page. Files are processed in the visitor's browser, so a
 * tool controller only serves the page and the limits the browser must enforce.
 */
abstract class ToolController extends Controller
{
    /**
     * Key of the tool inside config/tools.php.
     */
    protected string $slug;

    public function __invoke(): View
    {
        $tool = config('tools.'.$this->slug);

        abort_if($tool === null, 404);

        return view('tools.show', [
            'slug' => $this->slug,
            'tool' => $tool,
            'seo' => ToolSeo::forTool($this->slug, $tool),
        ]);
    }
}
