<?php

declare(strict_types=1);

use FlowState\Auth;
use FlowState\Csrf;
use FlowState\LinksRepo;
use FlowState\NotesRepo;
use FlowState\Response;

require_once __DIR__ . '/../src/Response.php';
require_once __DIR__ . '/../src/Csrf.php';
require_once __DIR__ . '/../src/LinksRepo.php';
require_once __DIR__ . '/../src/NotesRepo.php';

$config = require __DIR__ . '/../config/config.php';
$pdo = require __DIR__ . '/../config/database.php';

$auth = new Auth($pdo, $config['session']['name']);
if (!$auth->check()) {
    Response::error('unauthorized', 401);
    return;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    return;
}

if (!Csrf::validateToken('api', $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
    Response::error('invalid_csrf', 400);
    return;
}

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$public = isset($_GET['public']) ? (int) $_GET['public'] === 1 : null;
if ($id <= 0 || $public === null) {
    Response::error('invalid_parameters', 400);
    return;
}

$notesRepo = new NotesRepo($pdo, new LinksRepo($pdo));
$notesRepo->togglePublic($id, $public);

Response::json(['ok' => true, 'public' => $public]);
