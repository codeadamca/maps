<?php

// ======================================================
// CORS + Caching + JSON
// ======================================================
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ======================================================
// Load env
// ======================================================
$envFile = __DIR__.'/.env';
if (file_exists($envFile)) {
    $env = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($env as $value) {
        $pair = explode('=', $value, 2);
        if (count($pair) === 2) define(trim($pair[0]), trim($pair[1]));
    }
}

// ======================================================
// Includes (shared helpers)
// ======================================================
require_once __DIR__.'/functions.php';
require_once __DIR__.'/thumbnail-helpers.php';

// ======================================================
// DB connect
// ======================================================
$connect = mysqli_connect(defined('DB_HOST') ? DB_HOST : 'localhost', defined('DB_USERNAME') ? DB_USERNAME : '', defined('DB_PASSWORD') ? DB_PASSWORD : '', defined('DB_DATABASE') ? DB_DATABASE : '');
if (!$connect) {
    http_response_code(500);
    if (function_exists('respond')) {
        respond(false, ["error" => "Database connection failed"]);
    }
    echo json_encode(["success" => false, "error" => "Database connection failed"]);
    exit;
}
mysqli_set_charset($connect, 'utf8mb4');

// ======================================================
// Load route handlers
// ======================================================
$routesDir = __DIR__.'/routes';
$routeFiles = [
    'health.php',
    'owner_create.php',
    'owner_get.php',
    'owner_edit.php',
    'owner_delete.php',
    'design_create.php',
    'design_edit.php',
    'design_reset.php',
    'design_duplicate.php',
    'design_get.php',
    'design_svg.php',
    'design_thumb.php',
    'designs_by_owner.php',
    'design_delete.php'
];

foreach ($routeFiles as $rf) {
    $p = $routesDir.'/'.$rf;
    if (file_exists($p)) require_once $p;
}

// ======================================================
// Router
// ======================================================
$method = $_SERVER['REQUEST_METHOD'];
$path = strtok($_SERVER['REQUEST_URI'], '?');

// Health
if ($method === 'GET' && $path === '/health') health($connect);

// Owner
if ($method === 'POST' && $path === '/owner/create') create_owner($connect);
if ($method === 'GET' && preg_match('#^/owner/([^/]+)$#', $path, $m)) get_owner($connect, $m[1]);
if ($method === 'POST' && $path === '/owner/edit') edit_owner($connect);
if ($method === 'DELETE' && preg_match('#^/owner/delete/([^/]+)$#', $path, $m)) delete_owner($connect, $m[1]);

// Design
if ($method === 'POST' && $path === '/design/create') create_design($connect);
if ($method === 'POST' && $path === '/design/edit') edit_design($connect);
if ($method === 'POST' && $path === '/design/reset') reset_design($connect);
if ($method === 'POST' && $path === '/design/duplicate') duplicate_design($connect);
if ($method === 'GET' && preg_match('#^/design/svg/([^/]+)$#', $path, $m)) get_design_svg($connect, $m[1]);
if ($method === 'GET' && preg_match('#^/design/thumb/([^/]+)$#', $path, $m)) get_design_thumb($connect, $m[1]);
if ($method === 'GET' && preg_match('#^/design/([^/]+)$#', $path, $m)) get_design($connect, $m[1]);
if ($method === 'GET' && preg_match('#^/designs/owner/([^/]+)$#', $path, $m)) get_designs_by_owner($connect, $m[1]);
if ($method === 'DELETE' && preg_match('#^/design/delete/([^/]+)$#', $path, $m)) delete_design($connect, $m[1]);

// fallback
respond(false, ["error" => "Route not found"]);
