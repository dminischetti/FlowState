<?php

declare(strict_types=1);

$publicSlug = isset($_GET['p']) ? preg_replace('/[^a-z0-9\-]/i', '', (string) $_GET['p']) : null;
?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>FlowState Workspace</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="stylesheet" href="assets/css/app.css">
    <meta name="theme-color" content="#ffffff">
</head>
<body data-public="<?= $publicSlug !== null ? '1' : '0'; ?>" data-slug="<?= htmlspecialchars((string) $publicSlug, ENT_QUOTES); ?>">
    <div id="app-shell">
        <header class="top-bar">
            <button class="btn ghost" id="graph-toggle" aria-expanded="false">☰ Graph</button>
            <div class="logo-mark">FlowState</div>
            <div class="top-actions">
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
                    <section class="editor-pane">
                        <textarea id="note-content" placeholder="Write in Markdown…" aria-label="Note content"></textarea>
                    </section>
                    <section class="preview-pane" aria-live="polite">
                        <article id="preview"></article>
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
    <script src="assets/js/editor.js"></script>
    <script src="assets/js/graph.js"></script>
    <script src="assets/js/app.js"></script>
</body>
</html>
