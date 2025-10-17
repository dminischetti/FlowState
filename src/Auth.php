<?php

declare(strict_types=1);

namespace FlowState;

use PDO;

/**
 * Authentication helper for FlowState.
 */
class Auth
{
    private PDO $pdo;
    private string $sessionName;

    public function __construct(PDO $pdo, string $sessionName)
    {
        $this->pdo = $pdo;
        $this->sessionName = $sessionName;
        $this->ensureSession();
    }

    private function ensureSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        session_name($this->sessionName);
        session_start([
            'cookie_samesite' => 'Lax',
            'cookie_secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on',
            'cookie_httponly' => true,
        ]);
    }

    public function login(string $email, string $password): bool
    {
        $stmt = $this->pdo->prepare('SELECT id, email, pw_hash FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        if ($user === false) {
            return false;
        }

        if (!password_verify($password, $user['pw_hash'])) {
            return false;
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = (int) $user['id'];
        $_SESSION['email'] = (string) $user['email'];

        return true;
    }

    public function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                time() - 42000,
                $params['path'],
                $params['domain'],
                $params['secure'],
                $params['httponly']
            );
        }
        session_destroy();
    }

    public function check(): bool
    {
        return isset($_SESSION['user_id']);
    }

    public function requireAuth(): void
    {
        if (!$this->check()) {
            http_response_code(401);
            exit;
        }
    }

    public function userId(): ?int
    {
        return $_SESSION['user_id'] ?? null;
    }

    public function email(): ?string
    {
        return $_SESSION['email'] ?? null;
    }
}
