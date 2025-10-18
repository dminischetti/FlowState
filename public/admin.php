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
<html lang="en" data-theme="dark">
<head>
    <meta charset="utf-8">
    <title>Admin tools</title>
    <script>
    (function () {
        try {
            const stored = localStorage.getItem('flowstate-theme');
            const prefersLight = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;
            const preferred = stored || (prefersLight ? 'light' : 'dark');
            document.documentElement.setAttribute('data-theme', preferred);
        } catch (err) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }());
    </script>
    <link rel="stylesheet" href="assets/css/app.css">
</head>
<body class="auth-page">
    <main class="auth-card">
        <button class="btn ghost theme-toggle" type="button" id="theme-toggle" aria-label="Toggle theme" aria-pressed="false">☾</button>
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
    <script>
    (function () {
        const root = document.documentElement;
        const toggle = document.getElementById('theme-toggle');
        const updateToggle = function (theme) {
            if (!toggle) {
                return;
            }
            const isDark = theme === 'dark';
            toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
            toggle.textContent = isDark ? '☀︎' : '☾';
            toggle.title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
        };
        updateToggle(root.getAttribute('data-theme') || 'dark');
        if (toggle) {
            toggle.addEventListener('click', function () {
                const current = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
                const next = current === 'dark' ? 'light' : 'dark';
                root.setAttribute('data-theme', next);
                updateToggle(next);
                try {
                    localStorage.setItem('flowstate-theme', next);
                } catch (err) {
                    /* ignore */
                }
            });
        }
    }());
    </script>
</body>
</html>
