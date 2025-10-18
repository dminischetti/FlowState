<?php

declare(strict_types=1);

?><!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="utf-8">
    <title>FlowState Login</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
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
