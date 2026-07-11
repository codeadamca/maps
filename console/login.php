<?php
/**
 * Admin Console Login
 */

require_once __DIR__ . '/config.php';

// If already logged in, redirect to dashboard
if (is_logged_in()) {
    header('Location: /dashboard.php');
    exit;
}

$error = '';

// Handle login form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $password = trim($_POST['password'] ?? '');
    
    $valid_email = defined('CONSOLE_EMAIL') ? CONSOLE_EMAIL : '';
    $valid_password = defined('CONSOLE_PASSWORD') ? CONSOLE_PASSWORD : '';
    
    if ($email === $valid_email && $password === $valid_password) {
        $_SESSION['admin_logged_in'] = true;
        $_SESSION['admin_email'] = $email;
        header('Location: /dashboard.php');
        exit;
    } else {
        $error = 'Invalid email or password';
    }
}

?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Admin Console - Login</title>
    <link rel="stylesheet" href="https://www.w3schools.com/w3css/4/w3.css">
    <link rel="icon" type="image/x-icon" href="favicon.ico">
</head>
<body class="w3-light-grey">
    <div class="w3-container w3-center" style="margin-top: 100px;">
        <div class="w3-card w3-white" style="max-width: 400px; margin: 0 auto;">
            <div class="w3-container w3-theme" style="background-color: #2c3e50;">
                <h2 class="w3-text-white w3-margin">Lake Lines Admin</h3>
            </div>
            
            <div class="w3-container w3-padding-32">
                <?php if ($error): ?>
                    <div class="w3-panel w3-red w3-text-white">
                        <p><?php echo htmlspecialchars($error); ?></p>
                    </div>
                <?php endif; ?>
                
                <form method="POST">
                    <label class="w3-text-grey"><b>Email</b></label>
                    <input class="w3-input w3-border w3-round w3-margin-bottom" type="email" name="email" required>
                    
                    <label class="w3-text-grey"><b>Password</b></label>
                    <input class="w3-input w3-border w3-round w3-margin-bottom" type="password" name="password" required>
                    
                    <button class="w3-button w3-round w3-text-white w3-margin-top" style="background-color: #2c3e50; width: 100%;">
                        Login
                    </button>
                </form>
            </div>
        </div>
    </div>
</body>
</html>
