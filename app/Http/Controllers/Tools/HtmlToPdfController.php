<?php

namespace App\Http\Controllers\Tools;

use App\Exceptions\PageTooLargeException;
use App\Exceptions\UnsafeUrlException;
use App\Services\HtmlToPdfRenderer;
use App\Services\SafeUrlFetcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Validator;
use Throwable;

class HtmlToPdfController extends ToolController
{
    protected string $slug = 'html-to-pdf';

    /**
     * Unlike the other tools, this one needs the server: a browser may not
     * download other sites' pages, and the HTML is rendered with Dompdf.
     */
    public function convert(Request $request, SafeUrlFetcher $fetcher, HtmlToPdfRenderer $renderer): Response|JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'html' => ['nullable', 'string', 'max:8000000'],
            'url' => ['nullable', 'string', 'max:2048'],
            'pageSize' => ['nullable', 'in:a4,letter'],
            'orientation' => ['nullable', 'in:portrait,landscape'],
            'margin' => ['nullable', 'in:none,small,normal'],
        ]);

        if ($validator->fails()) {
            return $this->failure('The request is not valid: '.$validator->errors()->first(), 422);
        }

        $html = trim((string) $request->input('html', ''));
        $url = trim((string) $request->input('url', ''));

        if ($html === '' && $url === '') {
            return $this->failure('Paste some HTML, choose an HTML file or enter a web address.', 422);
        }

        try {
            if ($html === '') {
                $html = $fetcher->fetchHtml($url);
            }

            $pdf = $renderer->render($html, $validator->validated());
        } catch (UnsafeUrlException|PageTooLargeException $exception) {
            return $this->failure($exception->getMessage(), 422);
        } catch (Throwable $exception) {
            report($exception);

            return $this->failure('The page could not be converted. Try simpler HTML.', 422);
        }

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="page.pdf"',
            'Cache-Control' => 'no-store',
        ]);
    }

    private function failure(string $message, int $status): JsonResponse
    {
        return response()->json(['message' => $message], $status);
    }
}
