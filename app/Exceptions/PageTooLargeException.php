<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * The page is too large to convert. The message is safe to show to visitors.
 */
class PageTooLargeException extends RuntimeException {}
