<?php

declare(strict_types=1);

return [
    'db' => [
        'host' => 'localhost',
        'dbname' => 'flowstate',
        'user' => 'flowstate_user',
        'pass' => 'your_db_password',
        'charset' => 'utf8mb4',
    ],
    'session' => [
        'name' => 'flowstate_session',
    ],
    'app' => [
        'base_url' => 'https://example.com',
        'csrf_key' => 'replace_with_random_32_char_secret',
        'api_base' => '/api',
    ],
];
