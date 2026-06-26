<?php
/**
 * Admin Console Index
 * 
 * Redirects to dashboard if logged in, otherwise to login
 */
require_once __DIR__ . '/config.php';


if (is_logged_in()) {
    header('Location: /dashboard.php');
} else {
    header('Location: /login.php');
}
exit;
