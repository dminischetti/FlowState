<?php

declare(strict_types=1);

use FlowState\Auth;
use FlowState\Session;

require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/Session.php';

$config = require __DIR__ . '/../config/config.php';
$pdo = require __DIR__ . '/../config/database.php';

Session::configure($config['session']['name']);
Session::start();

$publicSlug = isset($_GET['p']) ? preg_replace('/[^a-z0-9\-]/i', '', (string) $_GET['p']) : null;

$auth = new Auth($pdo, $config['session']['name']);
$isAuthenticated = $auth->check();
if ($publicSlug === null && !$isAuthenticated) {
    header('Location: login.php');
    exit;
}

$apiBase = $config['app']['api_base'] ?? '/api';
$swPath = $config['app']['sw_path'] ?? 'sw.js';
?><!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="utf-8">
    <title>FlowState Workspace</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="manifest" href="manifest.webmanifest">
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
    <meta name="theme-color" content="#ffffff">
</head>
<body
    data-public="<?= $publicSlug !== null ? '1' : '0'; ?>"
    data-slug="<?= htmlspecialchars((string) $publicSlug, ENT_QUOTES); ?>"
    data-api-base="<?= htmlspecialchars($apiBase, ENT_QUOTES); ?>"
    data-sw-path="<?= htmlspecialchars($swPath, ENT_QUOTES); ?>"
>
    <div id="app-shell">
        <header class="top-bar">
            <button class="btn ghost" id="graph-toggle" aria-expanded="false">☰ Graph</button>
            <div class="logo-mark">FlowState</div>
            <div class="top-actions">
                <button class="btn ghost theme-toggle" type="button" id="theme-toggle" aria-pressed="false" aria-label="Toggle theme">☾</button>
                <button class="btn ghost" id="cmdk-button" aria-haspopup="dialog">⌘K</button>
                <a class="btn ghost" href="logout.php">Sign out</a>
            </div>
        </header>
        <div class="app-layout">
            <aside class="panel panel-graph" id="graph-panel" aria-label="Knowledge graph">
                <canvas id="graph-canvas" width="320" height="480" role="img" aria-label="Graph of notes"></canvas>
            </aside>
            <main class="panel panel-editor">
                <div class="editor-header">
                    <input id="note-title" class="title-input" placeholder="Untitled" aria-label="Note title">
                    <input id="note-tags" class="tags-input" placeholder="tags (comma separated)" aria-label="Note tags">
                    <button id="publish-toggle" class="btn secondary" data-public="0">Private</button>
                </div>
                <div class="editor-body">
                    <section class="workspace-pane editor-pane">
                        <div class="note-editor">
                            <textarea
                                id="note-content"
                                aria-label="Note content"
                                placeholder="Write in Markdown…"
                                data-placeholder="Write in Markdown…"
                            ></textarea>
                        </div>
                    </section>
                </div>
                <footer class="editor-footer">
                    <button id="save-button" class="btn primary">Save ⌘S</button>
                    <span id="sync-status" class="sync-status" aria-live="polite">All changes synced</span>
                </footer>
            </main>
            <aside class="panel panel-related" aria-label="Related notes">
                <section class="card">
                    <h2>Related</h2>
                    <ul id="related-list"></ul>
                </section>
                <section class="card">
                    <h2>Backlinks</h2>
                    <ul id="backlinks-list"></ul>
                </section>
            </aside>
        </div>
    </div>

    <dialog id="cmdk" aria-modal="true">
        <form method="dialog">
            <input type="search" id="cmdk-input" placeholder="Jump to…" aria-label="Command palette">
        </form>
        <ul id="cmdk-results" role="listbox"></ul>
    </dialog>

    <div id="toast" role="status" aria-live="assertive"></div>

    <script src="assets/js/api.js"></script>
    <script src="assets/js/db.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/simplemde/latest/simplemde.min.css">
    <script src="https://cdn.jsdelivr.net/simplemde/latest/simplemde.min.js"></script>
    <script src="assets/js/editor.js"></script>
    <script src="assets/js/graph.js"></script>
    <script src="assets/js/app.js"></script>
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
