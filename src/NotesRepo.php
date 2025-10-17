<?php

declare(strict_types=1);

namespace FlowState;

use PDO;
use PDOException;

/**
 * Repository for managing notes.
 */
class NotesRepo
{
    private PDO $pdo;
    private LinksRepo $linksRepo;

    public function __construct(PDO $pdo, LinksRepo $linksRepo)
    {
        $this->pdo = $pdo;
        $this->linksRepo = $linksRepo;
    }

    /**
     * Fetch a note by ID.
     *
     * @return array<string, mixed>|null
     */
    public function getById(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM notes WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $note = $stmt->fetch();

        return $note ?: null;
    }

    /**
     * Fetch a note by slug.
     *
     * @return array<string, mixed>|null
     */
    public function getBySlug(string $slug, bool $publicOnly = false): ?array
    {
        $sql = 'SELECT * FROM notes WHERE slug = :slug';
        if ($publicOnly) {
            $sql .= ' AND is_public = 1';
        }
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute(['slug' => $slug]);
        $note = $stmt->fetch();

        return $note ?: null;
    }

    /**
     * Search notes by term.
     *
     * @return array<int, array<string, mixed>>
     */
    public function search(string $term, int $limit = 10): array
    {
        $term = trim($term);
        if ($term === '') {
            return [];
        }

        $results = [];
        try {
            $stmt = $this->pdo->prepare(
                'SELECT id, slug, title, MATCH(title, content) AGAINST(:term IN NATURAL LANGUAGE MODE) AS score
                FROM notes
                WHERE MATCH(title, content) AGAINST(:term IN NATURAL LANGUAGE MODE)
                ORDER BY score DESC LIMIT :limit'
            );
            $stmt->bindValue(':term', $term, PDO::PARAM_STR);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->execute();
            $results = $stmt->fetchAll();
        } catch (PDOException $e) {
            $likeTerm = '%' . $term . '%';
            $stmt = $this->pdo->prepare(
                'SELECT id, slug, title, 1 AS score FROM notes
                WHERE title LIKE :like OR content LIKE :like
                ORDER BY updated_at DESC LIMIT :limit'
            );
            $stmt->bindValue(':like', $likeTerm, PDO::PARAM_STR);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->execute();
            $results = $stmt->fetchAll();
        }

        return $results ?: [];
    }

    /**
     * Create a new note.
     *
     * @param array<string, string> $data
     */
    public function create(array $data): array
    {
        $slug = $data['slug'] ?? $this->slugify($data['title']);
        $slug = $this->ensureUniqueSlug($slug);

        $stmt = $this->pdo->prepare(
            'INSERT INTO notes (slug, title, content, tags, is_public) VALUES (:slug, :title, :content, :tags, :is_public)'
        );
        $stmt->execute([
            'slug' => $slug,
            'title' => $data['title'],
            'content' => $data['content'],
            'tags' => $data['tags'] ?? '',
            'is_public' => isset($data['is_public']) ? (int) $data['is_public'] : 0,
        ]);

        $id = (int) $this->pdo->lastInsertId();
        $note = $this->getById($id);
        if ($note === null) {
            throw new \RuntimeException('Failed to fetch created note');
        }

        $this->reindex($note);
        $this->linksRepo->updateLinksFor($id);

        return $note;
    }

    /**
     * Update a note and bump version.
     */
    public function update(int $id, array $data, int $expectedVersion): ?array
    {
        $current = $this->getById($id);
        if ($current === null) {
            return null;
        }

        if ((int) $current['version'] !== $expectedVersion) {
            return ['version_conflict' => (int) $current['version']];
        }

        $newVersion = $expectedVersion + 1;
        $stmt = $this->pdo->prepare(
            'UPDATE notes SET title = :title, content = :content, tags = :tags, version = :version WHERE id = :id'
        );
        $stmt->execute([
            'title' => $data['title'],
            'content' => $data['content'],
            'tags' => $data['tags'] ?? '',
            'version' => $newVersion,
            'id' => $id,
        ]);

        if (!empty($data['slug']) && $data['slug'] !== $current['slug']) {
            $slug = $this->ensureUniqueSlug($this->slugify($data['slug']));
            $this->pdo->prepare('UPDATE notes SET slug = :slug WHERE id = :id')->execute([
                'slug' => $slug,
                'id' => $id,
            ]);
        }

        $note = $this->getById($id);
        if ($note === null) {
            return null;
        }

        $this->reindex($note);
        $this->linksRepo->updateLinksFor($id);

        return $note;
    }

    public function delete(int $id): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM notes WHERE id = :id');
        return $stmt->execute(['id' => $id]);
    }

    public function togglePublic(int $id, bool $isPublic): bool
    {
        $stmt = $this->pdo->prepare('UPDATE notes SET is_public = :public WHERE id = :id');
        return $stmt->execute(['public' => $isPublic ? 1 : 0, 'id' => $id]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function related(int $id, int $limit = 10): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT n.id, n.slug, n.title, l.score
            FROM note_links l
            INNER JOIN notes n ON n.id = l.dst_id
            WHERE l.src_id = :id
            ORDER BY l.score DESC
            LIMIT :limit'
        );
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll() ?: [];
    }

    /**
     * Fetch all notes for graph rendering.
     *
     * @return array<int, array<string, mixed>>
     */
    public function all(): array
    {
        $stmt = $this->pdo->query('SELECT id, slug, title, tags, is_public FROM notes ORDER BY updated_at DESC');
        return $stmt->fetchAll() ?: [];
    }

    /**
     * Backlinks referencing the note.
     *
     * @return array<int, array<string, mixed>>
     */
    public function backlinks(int $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT n.id, n.slug, n.title, l.score
            FROM note_links l
            INNER JOIN notes n ON n.id = l.src_id
            WHERE l.dst_id = :id
            ORDER BY l.score DESC'
        );
        $stmt->execute(['id' => $id]);

        return $stmt->fetchAll() ?: [];
    }

    /**
     * Reindex note into note_terms table.
     *
     * @param array<string, mixed> $note
     */
    public function reindex(array $note): void
    {
        $terms = TextUtil::tokenize((string) $note['title'] . ' ' . (string) $note['content']);
        $tf = TextUtil::tf($terms);

        $this->pdo->prepare('DELETE FROM note_terms WHERE note_id = :id')->execute(['id' => $note['id']]);
        if ($tf === []) {
            return;
        }

        $stmt = $this->pdo->prepare('INSERT INTO note_terms (note_id, term, tf) VALUES (:note_id, :term, :tf)');
        foreach ($tf as $term => $weight) {
            $stmt->execute([
                'note_id' => $note['id'],
                'term' => $term,
                'tf' => $weight,
            ]);
        }
    }

    /**
     * Manual reindex of all notes.
     */
    public function reindexAll(): int
    {
        $stmt = $this->pdo->query('SELECT * FROM notes');
        $count = 0;
        foreach ($stmt->fetchAll() as $note) {
            $this->reindex($note);
            $this->linksRepo->updateLinksFor((int) $note['id']);
            $count++;
        }

        return $count;
    }

    private function slugify(string $text): string
    {
        $text = strtolower(trim($text));
        $text = preg_replace('/[^a-z0-9]+/u', '-', $text) ?? $text;
        $text = trim($text, '-');
        if ($text === '') {
            $text = 'note';
        }

        return $text;
    }

    private function ensureUniqueSlug(string $slug): string
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM notes WHERE slug = :slug');
        $candidate = $slug;
        $i = 2;
        while (true) {
            $stmt->execute(['slug' => $candidate]);
            $count = (int) $stmt->fetchColumn();
            if ($count === 0) {
                return $candidate;
            }
            $candidate = $slug . '-' . $i;
            $i++;
        }
    }
}
