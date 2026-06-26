<?php
/**
 * Admin Console Configuration
 * 
 * Loads .env and establishes database connection
 */

// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

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

/**
 * Simple query helper
 */
function query($connect, $sql) {
    return mysqli_query($connect, $sql);
}

/**
 * Fetch one row
 */
function fetch_one($connect, $sql) {
    $res = query($connect, $sql);
    if (!$res) return null;
    return mysqli_fetch_assoc($res);
}

/**
 * Fetch all rows
 */
function fetch_all($connect, $sql) {
    $res = query($connect, $sql);
    if (!$res) return [];
    $rows = [];
    while ($row = mysqli_fetch_assoc($res)) {
        $rows[] = $row;
    }
    return $rows;
}

/**
 * Escape string for SQL
 */
function escape_sql($connect, $str) {
    return mysqli_real_escape_string($connect, $str);
}

/**
 * Check if user is logged in
 */
function is_logged_in() {
    return isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true;
}

/**
 * Require login - redirect if not authenticated
 */
function require_login() {
    if (!is_logged_in()) {
        header('Location: /login.php');
        exit;
    }
}
