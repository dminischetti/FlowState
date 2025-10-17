<?php

declare(strict_types=1);

namespace FlowState;

/**
 * Text utilities: tokenization, stopword filtering, and stemming.
 */
class TextUtil
{
    /**
     * @var array<string, bool>
     */
    private static array $stopwords;

    /**
     * Tokenize content to normalized terms.
     *
     * @return array<string, int> term => frequency
     */
    public static function tokenize(string $content): array
    {
        $content = preg_replace('/```[\s\S]*?```/', ' ', $content) ?? $content;
        $content = preg_replace('/`[^`]*`/', ' ', $content) ?? $content;
        $content = strtolower($content);
        $content = preg_replace('/[^a-z0-9à-ž\s]/u', ' ', $content) ?? $content;

        $tokens = preg_split('/\s+/u', $content, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        $stopwords = self::stopwords();
        $freq = [];
        foreach ($tokens as $token) {
            if (mb_strlen($token) < 2) {
                continue;
            }

            $stem = self::stem($token);
            if (isset($stopwords[$stem])) {
                continue;
            }

            $freq[$stem] = ($freq[$stem] ?? 0) + 1;
        }

        return $freq;
    }

    /**
     * Apply a very small Porter-style stemmer.
     */
    public static function stem(string $token): string
    {
        $token = preg_replace('/(ing|ed|ly|mente|azione|azioni)$/u', '', $token) ?? $token;
        $token = preg_replace('/(es|s)$/u', '', $token) ?? $token;
        return $token;
    }

    /**
     * Compute term frequency weights normalized by max frequency.
     *
     * @param array<string, int> $freq
     * @return array<string, float>
     */
    public static function tf(array $freq): array
    {
        if ($freq === []) {
            return [];
        }

        $max = max($freq);
        $tf = [];
        foreach ($freq as $term => $count) {
            $tf[$term] = 0.5 + 0.5 * ($count / $max);
        }

        return $tf;
    }

    /**
     * Lazily load stopwords list.
     *
     * @return array<string, bool>
     */
    private static function stopwords(): array
    {
        if (!isset(self::$stopwords)) {
            $english = [
                'the', 'and', 'for', 'are', 'with', 'this', 'that', 'from', 'have', 'was', 'were', 'there', 'their', 'about',
                'into', 'when', 'your', 'will', 'shall', 'should', 'could', 'would', 'here', 'over', 'also', 'been', 'being',
                'than', 'then', 'them', 'they', 'what', 'which', 'while', 'where', 'whom', 'does', 'did', 'done', 'once',
                'upon', 'other', 'such', 'more', 'some', 'each', 'very', 'just', 'like', 'make', 'made', 'many', 'most',
                'ever', 'even', 'much', 'take', 'used', 'using', 'use', 'note', 'notes', 'link', 'links',
            ];
            $italian = [
                'che', 'per', 'con', 'una', 'uno', 'nel', 'nella', 'degli', 'delle', 'quando', 'dove', 'come', 'anche',
                'dopo', 'prima', 'mentre', 'dove', 'sopra', 'sotto', 'avere', 'essere', 'sono', 'siamo', 'state', 'stato',
                'questo', 'quella', 'quello', 'queste', 'questi', 'loro', 'noi', 'voi', 'tra', 'fra', 'molto', 'molti',
            ];
            $map = [];
            foreach (array_merge($english, $italian) as $word) {
                $map[$word] = true;
            }
            self::$stopwords = $map;
        }

        return self::$stopwords;
    }
}
