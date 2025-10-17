<?php

declare(strict_types=1);

use FlowState\Auth;
use FlowState\Csrf;
use FlowState\Response;

require_once __DIR__ . '/../src/Response.php';
require_once __DIR__ . '/../src/Csrf.php';
require_once __DIR__ . '/../src/Auth.php';

$config = require __DIR__ . '/../config/config.php';
$pdo = require __DIR__ . '/../config/database.php';

$auth = new Auth($pdo, $config['session']['name']);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? null;

if ($method === 'GET') {
    if ($action === 'session') {
        Response::json([
            'auth' => $auth->check(),
            'email' => $auth->email(),
        ]);
        return;
    }

    if ($action === 'csrf') {
        $token = Csrf::generateToken('api');
        Response::json(['csrf' => $token]);
        return;
    }

    Response::json(['ok' => true]);
    return;
}

if ($method === 'POST') {
    if ($action === 'logout') {
        $auth->logout();
        Response::json(['ok' => true]);
        return;
    }

    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        $input = $_POST;
    }
    $email = isset($input['email']) ? trim((string) $input['email']) : '';
    $password = $input['password'] ?? '';

    if ($email === '' || $password === '') {
        Response::error('missing_credentials', 400);
        return;
    }

    if ($auth->login($email, (string) $password)) {
        Response::json(['ok' => true]);
        return;
    }

    Response::error('invalid_credentials', 401);
    return;
}

http_response_code(405);
