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
require_once __DIR__ . '/../src/TextUtil.php';

$config = require __DIR__ . '/../config/config.php';
$pdo = require __DIR__ . '/../config/database.php';

$linksRepo = new LinksRepo($pdo);
$notesRepo = new NotesRepo($pdo, $linksRepo);
$auth = new Auth($pdo, $config['session']['name']);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? null;

if ($action === 'reindexAll') {
    if (!$auth->check()) {
        Response::error('unauthorized', 401);
        return;
    }
    if (!Csrf::validateToken('api', $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
        Response::error('invalid_csrf', 400);
        return;
    }
    $count = $notesRepo->reindexAll();
    Response::json(['ok' => true, 'count' => $count]);
    return;
}

if ($method === 'GET') {
    $public = isset($_GET['public']) && (int) $_GET['public'] === 1;

    if (!$public && !$auth->check()) {
        Response::error('unauthorized', 401);
        return;
    }

    if (isset($_GET['search'])) {
        $results = $notesRepo->search((string) $_GET['search']);
        Response::json(['results' => $results]);
        return;
    }

    if (isset($_GET['graph'])) {
        $notes = $notesRepo->all();
        if ($public) {
            $notes = array_values(array_filter($notes, static fn ($n) => (int) $n['is_public'] === 1));
        }
        $linksStmt = $pdo->query('SELECT src_id, dst_id, score FROM note_links');
        $links = $linksStmt->fetchAll() ?: [];
        if ($public) {
            $publicIds = array_column($notes, 'id');
            $links = array_values(array_filter($links, static fn ($l) => in_array($l['src_id'], $publicIds, true) && in_array($l['dst_id'], $publicIds, true)));
        }
        Response::json(['nodes' => $notes, 'links' => $links]);
        return;
    }

    if (isset($_GET['related'])) {
        $note = $notesRepo->getBySlug((string) $_GET['related'], $public);
        if ($note === null) {
            Response::error('not_found', 404);
            return;
        }
        $related = $notesRepo->related((int) $note['id'], isset($_GET['limit']) ? (int) $_GET['limit'] : 10);
        Response::json(['items' => $related]);
        return;
    }

    if (isset($_GET['backlinks'])) {
        $note = $notesRepo->getBySlug((string) $_GET['backlinks'], $public);
        if ($note === null) {
            Response::error('not_found', 404);
            return;
        }
        $backlinks = $notesRepo->backlinks((int) $note['id']);
        Response::json(['items' => $backlinks]);
        return;
    }

    $note = null;
    if (isset($_GET['id'])) {
        $note = $notesRepo->getById((int) $_GET['id']);
    } elseif (isset($_GET['slug'])) {
        $note = $notesRepo->getBySlug((string) $_GET['slug'], $public);
    }

    if ($note === null) {
        Response::error('not_found', 404);
        return;
    }

    if ($public && (int) $note['is_public'] !== 1) {
        Response::error('not_found', 404);
        return;
    }

    $etag = '"v' . $note['version'] . '"';
    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim((string) $_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
        http_response_code(304);
        return;
    }

    header('ETag: ' . $etag);

    Response::json([
        'note' => $note,
        'etag' => $etag,
        'related' => $notesRepo->related((int) $note['id']),
        'backlinks' => $notesRepo->backlinks((int) $note['id']),
    ]);
    return;
}

if (!$auth->check()) {
    Response::error('unauthorized', 401);
    return;
}

$csrfToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null;
if (!Csrf::validateToken('api', $csrfToken)) {
    Response::error('invalid_csrf', 400);
    return;
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    $payload = $_POST;
}

if ($method === 'POST') {
    $title = trim((string) ($payload['title'] ?? ''));
    $content = (string) ($payload['content'] ?? '');
    $tags = trim((string) ($payload['tags'] ?? ''));
    $slug = isset($payload['slug']) ? trim((string) $payload['slug']) : null;

    if ($title === '' || $content === '') {
        Response::error('missing_fields', 422);
        return;
    }

    $note = $notesRepo->create([
        'title' => $title,
        'content' => $content,
        'tags' => $tags,
        'slug' => $slug,
    ]);

    Response::json([
        'id' => $note['id'],
        'version' => $note['version'],
        'slug' => $note['slug'],
    ], 201);
    return;
}

if ($method === 'PUT') {
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        Response::error('invalid_id', 400);
        return;
    }

    $ifMatch = $_SERVER['HTTP_IF_MATCH'] ?? '';
    if (!preg_match('/"v(\d+)"/', $ifMatch, $matches)) {
        Response::error('missing_if_match', 428);
        return;
    }
    $version = (int) $matches[1];

    $title = trim((string) ($payload['title'] ?? ''));
    $content = (string) ($payload['content'] ?? '');
    $tags = trim((string) ($payload['tags'] ?? ''));
    $slug = isset($payload['slug']) ? trim((string) $payload['slug']) : null;

    if ($title === '' || $content === '') {
        Response::error('missing_fields', 422);
        return;
    }

    $result = $notesRepo->update($id, [
        'title' => $title,
        'content' => $content,
        'tags' => $tags,
        'slug' => $slug,
    ], $version);

    if ($result === null) {
        Response::error('not_found', 404);
        return;
    }

    if (isset($result['version_conflict'])) {
        Response::error('version_conflict', 409, ['serverVersion' => $result['version_conflict']]);
        return;
    }

    Response::json([
        'ok' => true,
        'version' => $result['version'],
        'etag' => '"v' . $result['version'] . '"',
    ]);
    return;
}

if ($method === 'DELETE') {
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        Response::error('invalid_id', 400);
        return;
    }

    $notesRepo->delete($id);
    Response::json(['ok' => true]);
    return;
}

http_response_code(405);
