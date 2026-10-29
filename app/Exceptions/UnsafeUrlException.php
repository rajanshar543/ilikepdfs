<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * The web address cannot be fetched. The message is safe to show to visitors.
 */
class UnsafeUrlException extends RuntimeException {}
