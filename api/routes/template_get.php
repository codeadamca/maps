<?php
/**
 * Retrieve a design's full record (including `state_json`).
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $id Design identifier.
 * @return void Sends JSON response via `respond()`.
 */
function get_template($connect, $design_id, $variant_id) {

    $templates = get_templates_data();

    if(!isset($templates['templates'][$variant_id])) {
        http_response_code(404);
        respond(false, ["error" => "Template variantnot found"]);
    }

    $template = $templates['templates'][$variant_id];

    /*
    echo 'Variant ID: '.$variant_id.'<br>';
    echo 'Design ID: '.$design_id.'<br>';
    echo 'Template: '.$template.'<br>';
    die();
    */
    
    $path = __DIR__ . '/../assets/templates/'.$template.'.php';

    if (!file_exists($path)) {
        http_response_code(404);
        respond(false, ["error" => "Template file not found"]);
    }

    include $path;

}
