<?php

declare(strict_types=1);

namespace FlowState;

/**
 * CSRF token generation and validation utilities.
 */
class Csrf
{
    private const SESSION_KEY = 'csrf_tokens';

    public static function generateToken(string $key): string
    {
        Session::start();
        $token = bin2hex(random_bytes(32));
        $_SESSION[self::SESSION_KEY][$key] = $token;

        return $token;
    }

    public static function validateToken(string $key, ?string $token): bool
    {
        Session::start();
        $stored = $_SESSION[self::SESSION_KEY][$key] ?? null;

        if ($stored === null || $token === null) {
            return false;
        }

        $isValid = hash_equals($stored, $token);
        if ($isValid) {
            unset($_SESSION[self::SESSION_KEY][$key]);
        }

        return $isValid;
    }
}
