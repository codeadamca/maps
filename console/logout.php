<?php
/**
 * Admin Console Logout
 */

require_once __DIR__ . '/config.php';

// Destroy session
session_destroy();

// Redirect to login
header('Location: /login.php');
exit;
