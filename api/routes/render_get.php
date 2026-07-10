<?php
/**
 * Retrieve a design's full record (including `state_json`).
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $id Design identifier.
 * @return void Sends JSON response via `respond()`.
 */
function get_render($connect, $design_id, $variant_id) {

    $templates = get_templates_data();

    if(!isset($templates['templates'][$variant_id])) {
        http_response_code(404);
        respond(false, ["error" => "Template variant not found"]);
    }

    $template = $templates['templates'][$variant_id];
    
    $path = __DIR__ . '/../assets/templates/'.$template.'.php';

    if (!file_exists($path)) {
        http_response_code(404);
        respond(false, ["error" => "Template file not found"]);
    }

    $image_url = 'https://api.lakelines.co/template/'.$design_id.'/'.$variant_id;
    
    $design = find_design($connect, $design_id);


    $product_id = 632;

    $url = "https://api.printful.com/mockup-generator/create-task/" . $product_id;

$payload = [
    "variant_ids" => [16046],
    "files" => [
        [
            "placement" => "default",
            "image_url" => $image_url,
            "position" => [
                "area_width" => 2700,
                "area_height" => 1050,
                "width" => 2700,
                "height" => 1050,
                "top" => 0,
                "left" => 0
            ]
        ]
    ]
];

$ch = curl_init($url);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer " . PRINTFUL_API_KEY,
    "Content-Type: application/json"
]);

curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    echo "cURL error: " . curl_error($ch);
}

curl_close($ch);

echo $response;

    echo '<pre>';
    print_r($response);
    die('here');

    /*

    return [
        "success" => $http_code === 200,
        "http_code" => $http_code,
        "data" => json_decode($response, true)
    ];
    */
    
}
