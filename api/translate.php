<?php

declare(strict_types=1);

use FlowState\Response;

require_once __DIR__ . '/../src/Response.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'POST') {
    Response::error('method_not_allowed', 405);
    return;
}

$raw = file_get_contents('php://input');
$input = json_decode($raw, true);
if (!is_array($input)) {
    $input = [];
}

$text = isset($input['text']) ? (string) $input['text'] : '';
$targetLang = isset($input['targetLang']) ? (string) $input['targetLang'] : 'en';
$targetLang = strtolower((string) preg_replace('/[^a-z\-]/i', '', $targetLang));
if ($targetLang === '') {
    $targetLang = 'en';
}

if (trim($text) === '') {
    Response::json(['translated' => '']);
    return;
}

$translated = $text . "\n\n(" . strtoupper($targetLang) . ' translated)';

Response::json(['translated' => $translated]);
