<?php
/**
 * Admin Console Session Detail
 * 
 * Displays full details of a single session
 */

require_once __DIR__ . '/config.php';

require_login();

// Get session ID from URL
$session_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if (!$session_id) {
    header('Location: /dashboard.php');
    exit;
}

// Fetch session
$session = fetch_one($connect, "SELECT * FROM sessions WHERE id = '$session_id'");

if (!$session) {
    $not_found = true;
} else {
    $not_found = false;
}

// Fetch latest event
$event = null;
if (!$not_found) {
    $order_id_sql = $session['shopify_order_id'] ? "shopify_order_id = '" . $session['shopify_order_id'] . "'" : '';
    $cart_token_sql = $session['cart_token'] ? "cart_token = '" . escape_sql($connect, $session['cart_token']) . "'" : '';
    
    $where_clause = '';
    if ($order_id_sql && $cart_token_sql) {
        $where_clause = "($order_id_sql OR $cart_token_sql)";
    } elseif ($order_id_sql) {
        $where_clause = $order_id_sql;
    } elseif ($cart_token_sql) {
        $where_clause = $cart_token_sql;
    }
    
    if ($where_clause) {
        $event = fetch_one($connect, "
            SELECT * FROM session_events
            WHERE $where_clause
            ORDER BY created_at DESC
            LIMIT 1
        ");
    }
}

// Parse payload
$payload = null;
$line_items = [];
$design_ids = [];

if (!$not_found && $session['shopify_payload']) {
    $payload = json_decode($session['shopify_payload'], true);
    if ($payload && isset($payload['line_items'])) {
        $line_items = $payload['line_items'];
        
        // Extract design IDs
        foreach ($line_items as $item) {
            if (isset($item['properties']) && is_array($item['properties'])) {
                foreach ($item['properties'] as $prop) {
                    if (is_array($prop) && isset($prop['name']) && $prop['name'] === 'design_id' && isset($prop['value'])) {
                        $design_id = $prop['value'];
                        if (!in_array($design_id, $design_ids)) {
                            $design_ids[] = $design_id;
                        }
                    }
                }
            }
        }
    }
}

?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Admin Console - Session</title>
    <link rel="stylesheet" href="https://www.w3schools.com/w3css/4/w3.css">
</head>
<body>
    <div class="w3-row">
        <!-- Sidebar -->
        <div class="w3-col m2 w3-light-grey" style="min-height: 100vh;">
            <div class="w3-padding">
                <h3 class="w3-text-dark-grey">Lake Lines</h3>
                <p class="w3-small w3-text-grey">Admin Console</p>
                
                <ul style="list-style: none; padding: 0; margin: 0; margin-top: 24px;">
                    <li><a href="/dashboard.php">Dashboard</a></li>
                    <li><a href="/logout.php">Logout</a></li>
                </ul>
            </div>
        </div>
        
        <!-- Main Content -->
        <div class="w3-col m10">
            <div class="w3-container w3-padding">
                <a href="/dashboard.php" class="w3-button w3-white w3-border w3-margin-bottom">← Back to Dashboard</a>
                
                <?php if ($not_found): ?>
                    <div class="w3-panel w3-red w3-text-white">
                        <p><strong>Error:</strong> Session not found</p>
                    </div>
                <?php else: ?>
                    <h2>Session #<?php echo htmlspecialchars($session['id']); ?></h2>
                    
                    <!-- Session Details Card -->
                    <div class="w3-card w3-margin-bottom">
                        <div class="w3-container w3-light-grey">
                            <h3>Session Information</h3>
                        </div>
                        <div class="w3-container w3-padding">
                            <div class="w3-row">
                                <div class="w3-col m6 w3-margin-bottom">
                                    <p><b>ID:</b> <?php echo htmlspecialchars($session['id']); ?></p>
                                    <p><b>Status:</b> 
                                        <span class="w3-badge <?php 
                                            if ($session['status'] === 'paid') echo 'w3-green';
                                            elseif ($session['status'] === 'fulfilled') echo 'w3-blue';
                                            elseif ($session['status'] === 'cancelled') echo 'w3-red';
                                            else echo 'w3-yellow';
                                        ?>">
                                            <?php echo htmlspecialchars($session['status']); ?>
                                        </span>
                                    </p>
                                    <p><b>Order ID:</b> <?php echo htmlspecialchars($session['shopify_order_id'] ?? 'N/A'); ?></p>
                                    <p><b>Cart Token:</b> <small><?php echo htmlspecialchars(substr($session['cart_token'] ?? 'N/A', 0, 30) . (strlen($session['cart_token'] ?? '') > 30 ? '...' : '')); ?></small></p>
                                </div>
                                <div class="w3-col m6 w3-margin-bottom">
                                    <p><b>Email:</b> <?php echo htmlspecialchars($session['email'] ?? 'N/A'); ?></p>
                                    <p><b>Currency:</b> <?php echo htmlspecialchars($session['currency'] ?? 'N/A'); ?></p>
                                    <p><b>Total Price:</b> <?php echo htmlspecialchars($session['total_price'] ?? 'N/A'); ?></p>
                                    <p><b>Created:</b> <small><?php echo htmlspecialchars($session['created_at']); ?></small></p>
                                    <p><b>Updated:</b> <small><?php echo htmlspecialchars($session['updated_at']); ?></small></p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Latest Event -->
                    <?php if ($event): ?>
                        <div class="w3-card w3-margin-bottom">
                            <div class="w3-container w3-light-grey">
                                <h3>Latest Event</h3>
                            </div>
                            <div class="w3-container w3-padding">
                                <p><b>Topic:</b> <?php echo htmlspecialchars($event['topic']); ?></p>
                                <p><b>Webhook ID:</b> <small><?php echo htmlspecialchars($event['webhook_id']); ?></small></p>
                                <p><b>Received:</b> <small><?php echo htmlspecialchars($event['created_at']); ?></small></p>
                            </div>
                        </div>
                    <?php endif; ?>
                    
                    <!-- Line Items -->
                    <?php if (!empty($line_items)): ?>
                        <div class="w3-card w3-margin-bottom">
                            <div class="w3-container w3-light-grey">
                                <h3>Line Items</h3>
                            </div>
                            <div class="w3-container w3-padding">
                                <div class="w3-responsive">
                                    <table class="w3-table w3-striped w3-border">
                                        <thead>
                                            <tr class="w3-light-grey">
                                                <th></th>
                                                <th></th>
                                                <th>Product</th>
                                                <th>Quantity</th>
                                                <th>Price</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <?php foreach ($line_items as $item): ?>

                                                <?php

                                                $design_id = '';
        
                                                if (isset($item['properties']) && isset($item['properties']['design_id'])) {
                                                    $design_id = $item['properties']['design_id'];
                                                }

                                                elseif (isset($item['properties']) && is_array($item['properties'])) {
                                                    foreach ($item['properties'] as $prop) {
                                                        if (is_array($prop) && isset($prop['name']) && $prop['name'] === 'design_id' && isset($prop['value'])) {
                                                            $design_id = $prop['value'];
                                                            break;
                                                        }
                                                    }
                                                }

                                                // Fetch design details from API
                                                $design_data = null;
                                                $lake_name = '';
                                                $region = '';
                                                $lat = '';
                                                $lon = '';

                                                $design_url = "https://api.lakelines.co/design/" . urlencode($design_id);
                                                $response = @file_get_contents($design_url);
                                                
                                                if ($response) {
                                                    $design_data = json_decode($response, true);
                                                    
                                                    if ($design_data && isset($design_data['design']['state_json'])) {
                                                        $state = $design_data['design']['state_json'];
                                                        $lake_name = $state['lakeName'] ?? '';
                                                        $region = $state['region'] ?? '';
                                                        $lat = $state['lat'] ?? '';
                                                        $lon = $state['lon'] ?? '';
                                                    }
                                                }

                                                ?>

                                                <tr>
                                                    <td>
                                                        <img src="https://api.lakelines.co/design/lake/png/<?php echo urlencode($design_id); ?>?width=200&height=200" 
                                                             style="max-width: 200px; border: 1px solid #ddd; background-color: #fff;">
                                                    </td>
                                                    <td>

                                                        <?php

                                                        $bgColor = '#fff';
                                                        if($item['variant_id'] == 47976307032229 or
                                                            $item['variant_id'] == 47976306999461 )
                                                        {
                                                            $bgColor = '#333';
                                                        }

                                                        ?>

                                                        <a href="https://api.lakelines.co/template/<?=$design_id?>/<?=$item['variant_id']?>">
                                                            <img src="https://api.lakelines.co/template/<?=$design_id?>/<?=$item['variant_id']?>"
                                                                style="max-width: 200px; border: 1px solid #ddd; background-color: <?=$bgColor; ?>">
                                                        </a>
                                                    </td>
                                                    <td>
                                                        <h3><?php echo htmlspecialchars($item['title'] ?? ''); ?></h3>
                                                        External ID: <?php echo htmlspecialchars($item['variant_id'] ?? ''); ?>
                                                        <br>
                                                        Design ID: <?php echo htmlspecialchars($design_id); ?>
                                                        <br>
                                                        Lake Name: <?php echo htmlspecialchars($lake_name ? $lake_name : ''); ?>
                                                        <br>
                                                        Region: <?php echo htmlspecialchars($region ? $region : ''); ?>
                                                        <br>
                                                        Long/Lat: <?php echo htmlspecialchars($lat ? $lat.', '.$lon : ''); ?>
                                                    </td>
                                                    <td><?php echo htmlspecialchars($item['quantity'] ?? '1'); ?></td>
                                                    <td>$<?php echo htmlspecialchars($item['price'] ?? '-'); ?></td>
                                                </tr>
                                            <?php endforeach; ?>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    <?php endif; ?>
                    
                    <!-- Raw Payload (for debugging) -->
                    <?php if ($session['shopify_payload']): ?>
                        <div class="w3-card w3-margin-bottom">
                            <div class="w3-container w3-light-grey">
                                <h3>Raw Payload</h3>
                            </div>
                            <div class="w3-container w3-padding">
                                <pre style="background-color: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px;">
<?php 
$payload_json = json_decode($session['shopify_payload'], true);
echo htmlspecialchars(json_encode($payload_json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
?>
                                </pre>
                            </div>
                        </div>
                    <?php endif; ?>
                    
                <?php endif; ?>
            </div>
        </div>
    </div>
</body>
</html>
