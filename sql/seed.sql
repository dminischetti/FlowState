INSERT INTO users (email, pw_hash) VALUES
('admin@example.com', '$2y$12$2tzvDTO0oYji1YVtIUvAp.zCWlkZ2Vl1uKskiTjnOOJHz3f2nnclS');

INSERT INTO notes (slug, title, content, tags, is_public)
VALUES
('flow-overview', 'FlowState Overview', '# FlowState\n\nFlowState is a local-first knowledge workspace with playful outlined surfaces. It automatically links notes, works offline, and keeps a living graph.', 'product,intro', 1),
('backlinks-101', 'Backlinks 101', 'Backlinks keep [[FlowState Overview]] cohesive. When you mention [[Graph Canvas Design]], FlowState records the reverse link for navigation.', 'linking,basics', 1),
('semantic-search', 'Semantic Search Notes', 'Auto-linking blends token frequencies, TF-IDF, and cosine similarity. The TextUtil tokenizer handles Markdown and stop words.', 'ai,search', 0),
('graph-canvas-design', 'Graph Canvas Design', 'The graph view uses a lightweight force layout. Nodes render as sticker pills with gradients from the design tokens.', 'graph,design', 1),
('local-first-sync', 'Local-first Sync', 'Offline edits land inside an IndexedDB outbox. The service worker syncs notes back to PHP APIs when online.', 'sync,offline', 0),
('conflict-harmony', 'Conflict Harmony', 'Version numbers power optimistic concurrency. If the server has a newer version, the editor surfaces a merge prompt.', 'collaboration', 0),
('cmdk-navigator', 'Cmd-K Navigator', 'Press Cmd-K to jump between notes, launch search, or create a fresh page from your query.', 'ux,shortcuts', 1);
