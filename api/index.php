<?php

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

// --------------------
// LOAD ENV
// --------------------
$env = file(__DIR__.'/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

foreach($env as $value) {
    $value = explode('=', $value, 2);
    define(trim($value[0]), trim($value[1]));
}

// --------------------
// DB CONNECT
// --------------------
$connect = mysqli_connect(
    DB_HOST,
    DB_USERNAME,
    DB_PASSWORD,
    DB_DATABASE
);

if (!$connect) {
    die(json_encode(["error" => "DB connection failed"]));
}

mysqli_set_charset($connect, "utf8mb4");

// --------------------
// ROUTING
// --------------------
$method = $_SERVER['REQUEST_METHOD'];
$request = $_SERVER['REQUEST_URI'];

// strip query string
$request = strtok($request, '?');

// --------------------
// HELPERS
// --------------------
function json_input() {
    return json_decode(file_get_contents("php://input"), true);
}

// --------------------
// ROUTES
// --------------------

// CREATE DESIGN
if ($method === 'POST' && $request === '/design/create') {
    create_design($connect);
    exit;
}

// SAVE DESIGN
if ($method === 'POST' && $request === '/design/save') {
    save_design($connect);
    exit;
}

// GET DESIGN
if ($method === 'GET' && preg_match('#^/design/([^/]+)$#', $request, $m)) {
    get_design($connect, $m[1]);
    exit;
}

// GET BY OWNER
if ($method === 'GET' && preg_match('#^/designs/owner/([^/]+)$#', $request, $m)) {
    get_designs_by_owner($connect, $m[1]);
    exit;
}

// DEFAULT
http_response_code(404);
echo json_encode(["error" => "Not found"]);
exit;

// --------------------
// ENDPOINT FUNCTIONS
// --------------------

function create_design($connect) {

    $data = json_input();

    $owner_id = mysqli_real_escape_string($connect, $data['owner_id']);
    $type = mysqli_real_escape_string($connect, $data['design_type']);

    $design_id = "LL-" . strtoupper(bin2hex(random_bytes(4)));

    $state = [
        "design_type" => $type,
        "zoom" => 1,
        "rotation" => 0,
        "pan" => ["x" => 0, "y" => 0],
        "theme" => "navy"
    ];

    $state_json = mysqli_real_escape_string($connect, json_encode($state));

    mysqli_query($connect, "
        INSERT INTO designs (design_id, owner_id, state_json)
        VALUES ('$design_id', '$owner_id', '$state_json')
    ");

    echo json_encode([
        "design_id" => $design_id,
        "state" => $state
    ]);
}

function save_design($connect) {

    $data = json_input();

    $design_id = mysqli_real_escape_string($connect, $data['design_id']);
    $owner_id = mysqli_real_escape_string($connect, $data['owner_id']);
    $state = mysqli_real_escape_string($connect, json_encode($data['state']));

    mysqli_query($connect, "
        INSERT INTO designs (design_id, owner_id, state_json)
        VALUES ('$design_id', '$owner_id', '$state')
        ON DUPLICATE KEY UPDATE
        state_json = '$state',
        updated_at = CURRENT_TIMESTAMP
    ");

    echo json_encode(["success" => true]);
}

function get_design($connect, $id) {

    $id = mysqli_real_escape_string($connect, $id);

    $result = mysqli_query($connect, "
        SELECT * FROM designs WHERE design_id = '$id' LIMIT 1
    ");

    echo json_encode(mysqli_fetch_assoc($result));
}

function get_designs_by_owner($connect, $owner_id) {

    $owner_id = mysqli_real_escape_string($connect, $owner_id);

    $result = mysqli_query($connect, "
        SELECT * FROM designs WHERE owner_id = '$owner_id'
        ORDER BY updated_at DESC
    ");

    $data = [];

    while ($row = mysqli_fetch_assoc($result)) {
        $data[] = $row;
    }

    echo json_encode($data);
}