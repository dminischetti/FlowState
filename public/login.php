<?php

declare(strict_types=1);

?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>FlowState Login</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="assets/css/app.css">
</head>
<body class="auth-page">
    <main class="auth-card">
        <h1 class="logo">FlowState</h1>
        <form id="login-form" class="form-card" method="post" autocomplete="on">
            <label class="input-group">
                <span>Email</span>
                <input type="email" name="email" required>
            </label>
            <label class="input-group">
                <span>Password</span>
                <input type="password" name="password" required>
            </label>
            <button type="submit" class="btn primary">Sign in</button>
            <p class="form-hint" id="login-status" role="status" aria-live="polite"></p>
        </form>
    </main>
    <script src="assets/js/api.js"></script>
    <script>
    (function () {
        const form = document.getElementById('login-form');
        const statusEl = document.getElementById('login-status');
        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            statusEl.textContent = 'Signing in…';
            const formData = new FormData(form);
            const payload = Object.fromEntries(formData.entries());
            try {
                const res = await window.FlowStateApi.login(payload.email, payload.password);
                if (res.ok) {
                    window.location.href = 'index.php';
                } else {
                    statusEl.textContent = 'Invalid credentials';
                }
            } catch (err) {
                statusEl.textContent = 'Network error. Please retry.';
            }
        });
    }());
    </script>
</body>
</html>
