<?php

declare(strict_types=1);

use FlowState\Auth;
use FlowState\Csrf;
use FlowState\Response;

require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Csrf.php';
require_once __DIR__ . '/../src/Response.php';

$config = require __DIR__ . '/../config/config.php';
$pdo = require __DIR__ . '/../config/database.php';

$auth = new Auth($pdo, $config['session']['name']);
if (!$auth->check()) {
    header('Location: login.php');
    exit;
}

$message = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!Csrf::validateToken('admin-reset', $_POST['csrf'] ?? null)) {
        $message = 'Invalid token.';
    } else {
        $password = trim((string) ($_POST['password'] ?? ''));
        if (strlen($password) < 8) {
            $message = 'Password must be at least 8 characters.';
        } else {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare('UPDATE users SET pw_hash = :hash WHERE email = :email');
            $stmt->execute(['hash' => $hash, 'email' => $auth->email()]);
            $message = 'Password updated!';
        }
    }
}

$csrfToken = Csrf::generateToken('admin-reset');
?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Admin tools</title>
    <link rel="stylesheet" href="assets/css/app.css">
</head>
<body class="auth-page">
    <main class="auth-card">
        <h1>Reset password</h1>
        <form method="post" class="form-card">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrfToken, ENT_QUOTES); ?>">
            <label class="input-group">
                <span>New password</span>
                <input type="password" name="password" required minlength="8">
            </label>
            <button type="submit" class="btn primary">Update</button>
            <p class="form-hint"><?= htmlspecialchars($message, ENT_QUOTES); ?></p>
        </form>
    </main>
</body>
</html>
