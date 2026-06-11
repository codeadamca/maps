<?php

// ======================================================
// CORS
// ======================================================
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ======================================================
// LOAD ENV
// ======================================================
$env = file(__DIR__.'/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

foreach ($env as $value) {
    $value = explode('=', $value, 2);
    define(trim($value[0]), trim($value[1]));
}

// ======================================================
// DB CONNECT
// ======================================================
$connect = mysqli_connect(DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE);

if (!$connect) {
    respond(false, ["error" => "Database connection failed"]);
}

mysqli_set_charset($connect, "utf8mb4");

// ======================================================
// RESPONSE FORMAT
// ======================================================
function respond($success, $payload = []) {

    $res = [
        "success" => $success,
        "error" => $payload["error"] ?? null
    ];

    if (isset($payload["design"])) {
        $res["design"] = $payload["design"];
    }

    if (isset($payload["owner"])) {
        $res["owner"] = $payload["owner"];
    }

    if (isset($payload["data"])) {
        $res["data"] = $payload["data"];
        $res["records"] = $payload["records"] ?? count($payload["data"]);
    }

    echo json_encode($res);
    exit;
}

function input() {
    return json_decode(file_get_contents("php://input"), true);
}

// ======================================================
// ROUTER
// ======================================================
$method = $_SERVER['REQUEST_METHOD'];
$path = strtok($_SERVER["REQUEST_URI"], '?');

// ----------------------
// HEALTH
// ----------------------
if ($method === 'GET' && $path === '/health') health($connect);

// ----------------------
// OWNER ROUTES
// ----------------------
if ($method === 'POST' && $path === '/owner/create') create_owner($connect);
if ($method === 'GET' && preg_match('#^/owner/([^/]+)$#', $path, $m)) get_owner($connect, $m[1]);
if ($method === 'POST' && $path === '/owner/edit') edit_owner($connect);
if ($method === 'DELETE' && preg_match('#^/owner/([^/]+)$#', $path, $m)) delete_owner($connect, $m[1]);

// ----------------------
// DESIGN ROUTES
// ----------------------
if ($method === 'POST' && $path === '/design/create') create_design($connect);
if ($method === 'POST' && $path === '/design/edit') edit_design($connect);
if ($method === 'POST' && $path === '/design/duplicate') duplicate_design($connect);

if ($method === 'GET' && preg_match('#^/design/svg/([^/]+)$#', $path, $m)) {
    get_design_svg($connect, $m[1]);
}

if ($method === 'GET' && preg_match('#^/design/([^/]+)$#', $path, $m)) {
    get_design($connect, $m[1]);
}

if ($method === 'GET' && preg_match('#^/designs/owner/([^/]+)$#', $path, $m)) {
    get_designs_by_owner($connect, $m[1]);
}

if ($method === 'DELETE' && preg_match('#^/design/([^/]+)$#', $path, $m)) {
    delete_design($connect, $m[1]);
}

// fallback
respond(false, ["error" => "Route not found"]);

// ======================================================
// HELPERS
// ======================================================
function find_owner($connect, $id) {

    $id = mysqli_real_escape_string($connect, $id);

    if (is_numeric($id)) {
        $q = "SELECT * FROM owners WHERE id='$id' AND deleted_at IS NULL LIMIT 1";
    } else {
        $q = "SELECT * FROM owners WHERE owner_id='$id' AND deleted_at IS NULL LIMIT 1";
    }

    $res = mysqli_query($connect, $q);
    return mysqli_fetch_assoc($res);
}

function find_design($connect, $id) {

    $id = mysqli_real_escape_string($connect, $id);

    if (is_numeric($id)) {
        $q = "SELECT * FROM designs WHERE id='$id' AND deleted_at IS NULL LIMIT 1";
    } else {
        $q = "SELECT * FROM designs WHERE design_id='$id' AND deleted_at IS NULL LIMIT 1";
    }

    $res = mysqli_query($connect, $q);
    $row = mysqli_fetch_assoc($res);

    if ($row) {
        $row['state'] = json_decode($row['state_json'], true);
        unset($row['state_json']);
    }

    return $row;
}

// ======================================================
// HEALTH
// ======================================================
function health($connect) {

    respond(true, [
        "status" => [
            "api" => "ok",
            "database" => $connect ? "ok" : "error"
        ]
    ]);
}

// ======================================================
// OWNER ENDPOINTS
// ======================================================
function create_owner($connect) {

    $data = input();

    $owner_id = $data['owner_id'] ?? "OW-" . strtoupper(bin2hex(random_bytes(4)));
    $owner_id = mysqli_real_escape_string($connect, $owner_id);

    mysqli_query($connect, "
        INSERT INTO owners (owner_id)
        VALUES ('$owner_id')
    ");

    respond(true, [
        "owner" => [
            "owner_id" => $owner_id,
            "created_at" => date("Y-m-d H:i:s")
        ]
    ]);
}

function get_owner($connect, $id) {

    $owner = find_owner($connect, $id);

    if (!$owner) {
        http_response_code(404);
        respond(false, ["error" => "Owner not found"]);
    }

    $owner_id = $owner['owner_id'];

    $res = mysqli_query($connect, "
        SELECT design_id, design_type, copied_from, updated_at
        FROM designs
        WHERE owner_id='$owner_id' AND deleted_at IS NULL
        ORDER BY updated_at DESC
    ");

    $designs = [];

    while ($row = mysqli_fetch_assoc($res)) {
        $designs[] = $row;
    }

    respond(true, [
        "owner" => [
            "id" => $owner['id'],
            "owner_id" => $owner['owner_id'],
            "created_at" => $owner['created_at'],
            "updated_at" => $owner['updated_at'],
            "deleted_at" => $owner['deleted_at'],
            "designs" => $designs
        ]
    ]);
}

function edit_owner($connect) {

    $data = input();

    if (!isset($data['owner_id'])) {
        respond(false, ["error" => "Missing owner_id"]);
    }

    $owner_id = mysqli_real_escape_string($connect, $data['owner_id']);

    mysqli_query($connect, "
        UPDATE owners
        SET updated_at = CURRENT_TIMESTAMP
        WHERE owner_id='$owner_id' AND deleted_at IS NULL
    ");

    $owner = find_owner($connect, $owner_id);

    respond(true, [
        "owner" => [
            "owner_id" => $owner_id,
            "updated_at" => $owner['updated_at']
        ]
    ]);
}

function delete_owner($connect, $id) {

    $owner = find_owner($connect, $id);

    if (!$owner) {
        http_response_code(404);
        respond(false, ["error" => "Owner not found"]);
    }

    $owner_id = $owner['owner_id'];

    mysqli_query($connect, "
        UPDATE owners
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE owner_id='$owner_id'
    ");

    respond(true, [
        "owner" => [
            "owner_id" => $owner_id,
            "deleted_at" => date("Y-m-d H:i:s")
        ]
    ]);
}

// ======================================================
// DESIGN ENDPOINTS
// ======================================================
function create_design($connect) {

    $data = input();

    $owner_id = $data['owner_id'] ?? null;

    if (!$owner_id) {
        $owner_id = "OW-" . strtoupper(bin2hex(random_bytes(4)));

        mysqli_query($connect, "
            INSERT INTO owners (owner_id)
            VALUES ('$owner_id')
        ");
    }

    $owner_id = mysqli_real_escape_string($connect, $owner_id);

    $design_id = "LL-" . strtoupper(bin2hex(random_bytes(4)));

    $state = [
        "lake" => "Lake",
        "zoom" => 1,
        "rotation" => 0,
        "pan" => ["x" => 0, "y" => 0],
        "theme" => "navy",
        "labels" => []
    ];

    $state_json = mysqli_real_escape_string($connect, json_encode($state));

    mysqli_query($connect, "
        INSERT INTO designs (design_id, owner_id, design_type, state_json)
        VALUES ('$design_id', '$owner_id', 'lake', '$state_json')
    ");

    respond(true, [
        "design" => [
            "design_id" => $design_id,
            "owner_id" => $owner_id,
            "state" => $state,
            "created_at" => date("Y-m-d H:i:s"),
            "updated_at" => date("Y-m-d H:i:s")
        ]
    ]);
}

function edit_design($connect) {

    $data = input();

    if (!isset($data['design_id'], $data['state'])) {
        respond(false, ["error" => "Missing design_id or state"]);
    }

    $design_id = mysqli_real_escape_string($connect, $data['design_id']);
    $state_json = mysqli_real_escape_string($connect, json_encode($data['state']));

    mysqli_query($connect, "
        UPDATE designs
        SET state_json='$state_json',
            updated_at=CURRENT_TIMESTAMP
        WHERE design_id='$design_id' AND deleted_at IS NULL
    ");

    $row = find_design($connect, $design_id);

    if (!$row) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    respond(true, [
        "design" => [
            "design_id" => $design_id,
            "updated_at" => $row['updated_at']
        ]
    ]);
}

function duplicate_design($connect) {

    $data = input();

    if (!isset($data['design_id'])) {
        respond(false, ["error" => "Missing design_id"]);
    }

    $original = find_design($connect, $data['design_id']);

    if (!$original) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    $new_id = "LL-" . strtoupper(bin2hex(random_bytes(4)));

    $state_json = mysqli_real_escape_string($connect, json_encode($original['state']));

    mysqli_query($connect, "
        INSERT INTO designs (design_id, owner_id, design_type, copied_from, state_json)
        VALUES (
            '$new_id',
            '{$original['owner_id']}',
            '{$original['design_type']}',
            '{$original['design_id']}',
            '$state_json'
        )
    ");

    respond(true, [
        "design" => [
            "design_id" => $new_id,
            "copied_from" => $original['design_id'],
            "created_at" => date("Y-m-d H:i:s")
        ]
    ]);
}

// ======================================================
// JSON DESIGN
// ======================================================
function get_design($connect, $id) {

    $row = find_design($connect, $id);

    if (!$row) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    respond(true, ["design" => $row]);
}

// ======================================================
// SVG DESIGN (MVP)
// ======================================================
function get_design_svg($connect, $id) {

    $design = find_design($connect, $id);

    if (!$design) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    $state = $design['state'];

    $label = "Untitled";

    if (isset($state['labels'][0])) {
        $label = $state['labels'][0];
    }

    header("Content-Type: image/svg+xml");

    echo '<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">

            <rect width="400" height="400" fill="#0b1b2b"/>

            <text x="200" y="185"
                fill="#ffffff"
                text-anchor="middle"
                font-family="Arial"
                font-size="28"
                font-weight="bold">
                ' . htmlspecialchars($label) . '
            </text>

            <text x="200" y="215"
                fill="#a7b0bb"
                text-anchor="middle"
                font-family="Arial"
                font-size="20">
                ' . htmlspecialchars($design["design_type"]) . '
            </text>

        </svg>';

    exit;
}

// ======================================================
// LIST DESIGNS BY OWNER
// ======================================================
function get_designs_by_owner($connect, $id) {

    $owner = find_owner($connect, $id);

    if (!$owner) {
        http_response_code(404);
        respond(false, ["error" => "Owner not found"]);
    }

    $owner_id = $owner['owner_id'];

    $res = mysqli_query($connect, "
        SELECT design_id, design_type, copied_from, updated_at
        FROM designs
        WHERE owner_id='$owner_id' AND deleted_at IS NULL
        ORDER BY updated_at DESC
    ");

    $data = [];

    while ($row = mysqli_fetch_assoc($res)) {
        $data[] = $row;
    }

    respond(true, [
        "data" => $data,
        "records" => count($data)
    ]);
}

// ======================================================
// DELETE DESIGN
// ======================================================
function delete_design($connect, $id) {

    $design = find_design($connect, $id);

    if (!$design) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    $design_id = $design['design_id'];

    mysqli_query($connect, "
        UPDATE designs
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE design_id='$design_id'
    ");

    respond(true, [
        "design" => [
            "design_id" => $design_id,
            "deleted_at" => date("Y-m-d H:i:s")
        ]
    ]);
}