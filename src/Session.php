<?php

declare(strict_types=1);

namespace FlowState;

use RuntimeException;

/**
 * Centralized session bootstrap with InfinityFree-friendly fallbacks.
 */
final class Session
{
    private static string $name = 'flowstate_session';
    private static bool $configured = false;

    public static function configure(string $name): void
    {
        self::$name = $name !== '' ? $name : self::$name;
    }

    public static function start(?string $name = null): void
    {
        $targetName = $name !== null && $name !== '' ? $name : self::$name;
        if (session_status() === PHP_SESSION_ACTIVE) {
            if (session_name() !== $targetName) {
                // Restart session under the expected name.
                session_write_close();
                session_name($targetName);
                self::ensureSavePath();
                session_start([
                    'cookie_samesite' => 'Lax',
                    'cookie_secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
                    'cookie_httponly' => true,
                    'cookie_path' => '/',
                ]);
            }
            return;
        }

        self::ensureSavePath();

        session_name($targetName);
        session_start([
            'cookie_samesite' => 'Lax',
            'cookie_secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
            'cookie_httponly' => true,
            'cookie_path' => '/',
        ]);
    }

    private static function ensureSavePath(): void
    {
        if (self::$configured) {
            return;
        }

        $path = session_save_path();
        $isWritable = $path !== '' && is_dir($path) && is_writable($path);
        if ($isWritable) {
            self::$configured = true;
            return;
        }

        $fallback = __DIR__ . '/../storage/sessions';
        if (!is_dir($fallback) && !@mkdir($fallback, 0777, true) && !is_dir($fallback)) {
            throw new RuntimeException('Unable to initialize session storage.');
        }

        if (!is_writable($fallback) && !@chmod($fallback, 0777)) {
            throw new RuntimeException('Session storage path is not writable.');
        }

        session_save_path($fallback);
        self::$configured = true;
    }
}
