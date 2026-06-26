<?php

// ======================================================
// API bootstrap
// ======================================================

// CORS + JSON
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Prevent caching of API responses (including SVG thumbnails)
header('Cache-Control: no-cache, no-store, must-revalidate'); // HTTP 1.1.
header('Pragma: no-cache'); // HTTP 1.0.
header('Expires: 0'); // Proxies.

// Load ENV
$envFile = __DIR__.'/.env';
if (file_exists($envFile)) {
    $env = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($env as $value) {
        $pair = explode('=', $value, 2);
        if (count($pair) === 2) define(trim($pair[0]), trim($pair[1]));
    }
}

// DB connect
$connect = mysqli_connect(defined('DB_HOST') ? DB_HOST : 'localhost', defined('DB_USERNAME') ? DB_USERNAME : '', defined('DB_PASSWORD') ? DB_PASSWORD : '', defined('DB_DATABASE') ? DB_DATABASE : '');
if (!$connect) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Database connection failed"]);
    exit;
}
mysqli_set_charset($connect, "utf8mb4");

// Load shared helpers
require_once __DIR__.'/functions.php';
require_once __DIR__.'/thumbnail-helpers.php';
require_once __DIR__.'/render-helpers.php';

// Auto-include route handlers
$routesDir = __DIR__.'/routes';
foreach (glob($routesDir.'/*.php') as $routeFile) {
    require_once $routeFile;
}

// Router
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
if ($method === 'GET' && preg_match('#^/design/lake/png/([^/]+)$#', $path, $m)) get_design_lake_png($connect, $m[1]);
if ($method === 'GET' && preg_match('#^/design/lake/svg/([^/]+)$#', $path, $m)) get_design_lake_svg($connect, $m[1]);
if ($method === 'GET' && preg_match('#^/design/thumb/([^/]+)$#', $path, $m)) get_design_thumb($connect, $m[1]);
if ($method === 'GET' && preg_match('#^/design/([^/]+)$#', $path, $m)) get_design($connect, $m[1]);
if ($method === 'GET' && preg_match('#^/designs/owner/([^/]+)$#', $path, $m)) get_designs_by_owner($connect, $m[1]);
if ($method === 'DELETE' && preg_match('#^/design/delete/([^/]+)$#', $path, $m)) delete_design($connect, $m[1]);

if ($method === 'GET' && preg_match('#^/design/ceramic-mug/([^/]+)$#', $path, $m)) get_design_ceramic_mug($connect, $m[1]);
if ($method === 'GET' && preg_match('#^/design/spiral-notebook/([^/]+)$#', $path, $m)) get_design_spiral_notebook($connect, $m[1]);

// Shopify webhook
if ($method === 'POST' && $path === '/shopify/webhook') shopify_webhook($connect);

// Static studio data (moved from studio/public/data)
if ($method === 'GET' && $path === '/colours') get_colours();
if ($method === 'GET' && $path === '/fonts') get_fonts();
if ($method === 'GET' && $path === '/icons') get_icons();
if ($method === 'GET' && $path === '/layers') get_layers();
if ($method === 'GET' && $path === '/layouts') get_layouts();
if ($method === 'GET' && $path === '/themes') get_themes();

respond(false, ["error" => "Route not found"]);
