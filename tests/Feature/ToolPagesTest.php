<?php

namespace Tests\Feature;

use App\Http\Controllers\Tools\ToolController;
use Illuminate\Routing\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ToolPagesTest extends TestCase
{
    /**
     * @return array<string, array{string}>
     */
    public static function slugs(): array
    {
        $config = require __DIR__.'/../../config/tools.php';

        return collect(array_keys($config))
            ->mapWithKeys(fn (string $slug): array => [$slug => [$slug]])
            ->all();
    }

    public function test_all_forty_six_tools_are_registered(): void
    {
        $this->assertCount(46, config('tools'));
    }

    #[DataProvider('slugs')]
    public function test_tool_page_renders_with_its_limits(string $slug): void
    {
        $tool = config("tools.$slug");

        $this->get(route("tools.$slug"))
            ->assertOk()
            ->assertSee($tool['name'])
            ->assertSee('data-tool="'.$slug.'"', false)
            ->assertSee('data-max-files="'.$tool['max_files'].'"', false)
            ->assertSee('data-run', false)
            ->assertSee($tool['privacy_note'] ?? 'never leave your device');
    }

    #[DataProvider('slugs')]
    public function test_each_tool_has_its_own_controller(string $slug): void
    {
        $controller = config("tools.$slug.controller");

        $this->assertTrue(class_exists($controller), "$controller is missing");
        $this->assertTrue(is_subclass_of($controller, ToolController::class));
        $this->assertSame($controller, (new \ReflectionProperty(Route::class, 'action'))
            ->getValue(app('router')->getRoutes()->getByName("tools.$slug"))['controller']);
    }

    #[DataProvider('slugs')]
    public function test_each_tool_has_a_script_and_its_option_form(string $slug): void
    {
        $script = base_path("resources/js/tools/$slug.js");

        $this->assertFileExists($script, "Missing browser module for $slug");

        $source = file_get_contents($script);
        $needsForm = str_contains($source, 'readOptions') || str_contains($source, 'init(');

        if ($needsForm) {
            $this->assertTrue(view()->exists("tools.options.$slug"), "tools.options.$slug view is missing");
        }
    }

    public function test_no_two_tools_share_a_controller(): void
    {
        $controllers = array_column(config('tools'), 'controller');

        $this->assertSame($controllers, array_unique($controllers));
    }

    #[DataProvider('slugs')]
    public function test_tool_page_does_not_accept_uploads_or_writes(string $slug): void
    {
        if ($slug !== 'html-to-pdf') {
            $this->post(route("tools.$slug"))->assertStatus(405);
        }

        $this->put(route("tools.$slug"))->assertStatus(405);
        $this->delete(route("tools.$slug"))->assertStatus(405);
    }

    public function test_unknown_tool_is_a_404(): void
    {
        $this->get('/not-a-tool')->assertNotFound();
    }

    public function test_the_limit_leaves_room_for_saving_the_whole_site_for_offline_use(): void
    {
        $pages = count($this->get('/offline-assets.json')->json('pages'));

        $this->assertGreaterThan($pages * 3, config('app.tools_per_minute', 600), 'Saving for offline use fetches every page once; the limit must allow that and normal browsing.');
        $this->assertStringContainsString('response.status === 429', file_get_contents(public_path('sw.js')));
    }

    public function test_page_views_and_conversions_do_not_share_one_rate_limit(): void
    {
        for ($attempt = 0; $attempt < 20; $attempt++) {
            $this->get(route('tools.merge-pdf'))->assertOk();
        }

        $this->postJson(route('tools.html-to-pdf.convert'), ['html' => '<p>x</p>'])->assertOk();
    }

    public function test_tool_pages_are_rate_limited(): void
    {
        config(['app.tools_per_minute' => 40]);
        $slug = 'merge-pdf';

        for ($attempt = 0; $attempt < 40; $attempt++) {
            $this->get(route("tools.$slug"))->assertOk();
        }

        $this->get(route("tools.$slug"))->assertStatus(429);
    }

    public function test_home_page_links_to_every_tool(): void
    {
        $response = $this->get('/')->assertOk();

        foreach (array_keys(config('tools')) as $slug) {
            $response->assertSee('href="'.route("tools.$slug").'"', false);
        }
    }

    public function test_tool_names_are_escaped_in_the_page(): void
    {
        config(['tools.merge-pdf.name' => '<script>alert(1)</script>']);

        $this->get(route('tools.merge-pdf'))
            ->assertOk()
            ->assertDontSee('<script>alert(1)</script>', false)
            ->assertSee('&lt;script&gt;alert(1)&lt;/script&gt;', false);
    }
}
