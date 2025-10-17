<?php

declare(strict_types=1);

namespace FlowState;

use PDO;

/**
 * Handles related-note link calculations.
 */
class LinksRepo
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Update link graph for a given note.
     */
    public function updateLinksFor(int $noteId): void
    {
        $vector = $this->fetchVector($noteId);
        if ($vector === []) {
            $this->deleteLinksFor($noteId);
            return;
        }

        $terms = array_keys($vector);
        $candidates = $this->candidateNotes($noteId, $terms);
        if ($candidates === []) {
            $this->deleteLinksFor($noteId);
            return;
        }

        $idf = $this->idf($terms);
        $target = $this->weightedVector($vector, $idf);
        $targetNorm = $this->vectorNorm($target);
        if ($targetNorm === 0.0) {
            $this->deleteLinksFor($noteId);
            return;
        }

        $scores = [];
        foreach ($candidates as $candidateId => $candidateVector) {
            $weighted = $this->weightedVector($candidateVector, $idf);
            $norm = $this->vectorNorm($weighted);
            if ($norm === 0.0) {
                continue;
            }
            $dot = $this->dotProduct($target, $weighted);
            if ($dot <= 0.0) {
                continue;
            }
            $scores[$candidateId] = $dot / ($targetNorm * $norm);
        }

        arsort($scores);
        $topScores = array_slice($scores, 0, 12, true);

        $this->deleteLinksFor($noteId);
        if ($topScores === []) {
            return;
        }

        $stmt = $this->pdo->prepare('INSERT INTO note_links (src_id, dst_id, score) VALUES (:src, :dst, :score)');
        foreach ($topScores as $dstId => $score) {
            $stmt->execute([
                'src' => $noteId,
                'dst' => $dstId,
                'score' => $score,
            ]);
        }
    }

    private function deleteLinksFor(int $noteId): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM note_links WHERE src_id = :id');
        $stmt->execute(['id' => $noteId]);
    }

    /**
     * @return array<string, float>
     */
    private function fetchVector(int $noteId): array
    {
        $stmt = $this->pdo->prepare('SELECT term, tf FROM note_terms WHERE note_id = :id');
        $stmt->execute(['id' => $noteId]);
        $terms = [];
        foreach ($stmt->fetchAll() as $row) {
            $terms[(string) $row['term']] = (float) $row['tf'];
        }

        return $terms;
    }

    /**
     * @param array<int, string> $terms
     * @return array<int, array<string, float>>
     */
    private function candidateNotes(int $noteId, array $terms): array
    {
        if ($terms === []) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($terms), '?'));
        $sql = 'SELECT note_id, term, tf FROM note_terms WHERE term IN (' . $placeholders . ') AND note_id <> ?';
        $stmt = $this->pdo->prepare($sql);
        $i = 1;
        foreach ($terms as $term) {
            $stmt->bindValue($i, $term, PDO::PARAM_STR);
            $i++;
        }
        $stmt->bindValue($i, $noteId, PDO::PARAM_INT);
        $stmt->execute();

        $vectors = [];
        foreach ($stmt->fetchAll() as $row) {
            $nid = (int) $row['note_id'];
            $term = (string) $row['term'];
            $tf = (float) $row['tf'];
            $vectors[$nid][$term] = $tf;
        }

        return $vectors;
    }

    /**
     * @param array<int, string> $terms
     * @return array<string, float>
     */
    private function idf(array $terms): array
    {
        if ($terms === []) {
            return [];
        }

        $terms = array_unique($terms);
        $placeholders = implode(',', array_fill(0, count($terms), '?'));

        $totalNotes = (int) $this->pdo->query('SELECT COUNT(*) FROM notes')->fetchColumn();
        if ($totalNotes === 0) {
            return array_fill_keys($terms, 0.0);
        }

        $sql = 'SELECT term, COUNT(*) AS df FROM note_terms WHERE term IN (' . $placeholders . ') GROUP BY term';
        $stmt = $this->pdo->prepare($sql);
        $i = 1;
        foreach ($terms as $term) {
            $stmt->bindValue($i, $term, PDO::PARAM_STR);
            $i++;
        }
        $stmt->execute();

        $idf = array_fill_keys($terms, log(($totalNotes + 1) / 1.0));
        foreach ($stmt->fetchAll() as $row) {
            $term = (string) $row['term'];
            $df = (int) $row['df'];
            $idf[$term] = log(($totalNotes + 1) / ($df + 1)) + 1.0;
        }

        return $idf;
    }

    /**
     * @param array<string, float> $vector
     * @param array<string, float> $idf
     * @return array<string, float>
     */
    private function weightedVector(array $vector, array $idf): array
    {
        $weighted = [];
        foreach ($vector as $term => $value) {
            $weighted[$term] = $value * ($idf[$term] ?? 0.0);
        }

        return $weighted;
    }

    /**
     * @param array<string, float> $a
     * @param array<string, float> $b
     */
    private function dotProduct(array $a, array $b): float
    {
        $sum = 0.0;
        foreach ($a as $term => $value) {
            $sum += $value * ($b[$term] ?? 0.0);
        }

        return $sum;
    }

    /**
     * @param array<string, float> $vector
     */
    private function vectorNorm(array $vector): float
    {
        $sum = 0.0;
        foreach ($vector as $value) {
            $sum += $value * $value;
        }

        return sqrt($sum);
    }
}
