<?php

declare(strict_types=1);

namespace FlowState;

/**
 * Small helper for emitting JSON responses.
 */
class Response
{
    /**
     * Emit JSON with appropriate headers and HTTP status code.
     *
     * @param array<string, mixed> $payload
     */
    public static function json(array $payload, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /**
     * Emit a JSON error payload with message and optional extra context.
     *
     * @param array<string, mixed> $context
     */
    public static function error(string $message, int $status = 400, array $context = []): void
    {
        $body = array_merge(['ok' => false, 'error' => $message], $context);
        self::json($body, $status);
    }
}
