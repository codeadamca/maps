<?php
/**
 * Admin Console Dashboard
 * 
 * Displays list of sessions from the database
 */

require_once __DIR__ . '/config.php';

require_login();

// Get all sessions ordered by updated_at DESC
$sessions = fetch_all($connect, "
    SELECT id, status, cart_token, shopify_order_id, email, total_price, updated_at
    FROM sessions
    ORDER BY updated_at DESC
    LIMIT 1000
");

?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Admin Console - Dashboard</title>
    <link rel="stylesheet" href="https://www.w3schools.com/w3css/4/w3.css">
    <link rel="icon" type="image/x-icon" href="favicon.ico">
    <style>
        .sidebar-nav {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .sidebar-nav li a {
            display: block;
            padding: 12px 16px;
            text-decoration: none;
            color: inherit;
        }
        .sidebar-nav li a:hover {
            background-color: #f1f1f1;
        }
    </style>
</head>
<body>
    <div class="w3-row">
        <!-- Sidebar -->
        <div class="w3-col m2 w3-light-grey" style="min-height: 100vh;">
            <div class="w3-padding">
                <h3 class="w3-text-dark-grey">Lake Lines</h3>
                <p class="w3-small w3-text-grey">Admin Console</p>
                
                <ul class="sidebar-nav w3-margin-top">
                    <li><a href="/dashboard.php" class="w3-text-blue"><b>Dashboard</b></a></li>
                    <li><a href="/logout.php">Logout</a></li>
                </ul>
                
                <div class="w3-margin-top w3-text-grey w3-small">
                    <p>Logged in as:</p>
                    <p><?php echo htmlspecialchars($_SESSION['admin_email']); ?></p>
                </div>
            </div>
        </div>
        
        <!-- Main Content -->
        <div class="w3-col m10">
            <div class="w3-container w3-padding">
                <h2>Sessions</h2>
                <p class="w3-text-grey">Total: <?php echo count($sessions); ?> sessions</p>
                
                <!-- Sessions Table -->
                <div class="w3-responsive">
                    <table class="w3-table w3-striped w3-border">
                        <thead>
                            <tr class="w3-light-grey">
                                <th>ID</th>
                                <th>Status</th>
                                <th>Order ID</th>
                                <th>Email</th>
                                <th>Total Price</th>
                                <th>Updated</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (empty($sessions)): ?>
                                <tr>
                                    <td colspan="7" class="w3-center w3-text-grey">No sessions found</td>
                                </tr>
                            <?php else: ?>
                                <?php foreach ($sessions as $session): ?>
                                    <tr style="cursor: pointer;" onclick="window.location='/session.php?id=<?php echo $session['id']; ?>'">
                                        <td><?php echo htmlspecialchars($session['id']); ?></td>
                                        <td>
                                            <span class="w3-badge <?php 
                                                if ($session['status'] === 'paid') echo 'w3-green';
                                                elseif ($session['status'] === 'fulfilled') echo 'w3-blue';
                                                elseif ($session['status'] === 'cancelled') echo 'w3-red';
                                                else echo 'w3-yellow';
                                            ?>">
                                                <?php echo htmlspecialchars($session['status']); ?>
                                            </span>
                                        </td>
                                        <td><?php echo htmlspecialchars($session['shopify_order_id'] ?? '-'); ?></td>
                                        <td><?php echo htmlspecialchars($session['email'] ?? '-'); ?></td>
                                        <td><?php echo htmlspecialchars($session['total_price'] ?? '-'); ?></td>
                                        <td><?php echo htmlspecialchars(substr($session['updated_at'], 0, 16)); ?></td>
                                        <td><a href="/session.php?id=<?php echo $session['id']; ?>" class="w3-button w3-small w3-white w3-border">View</a></td>
                                    </tr>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
