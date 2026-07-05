<?php

error_log("[CERAMIC_MUG] GET /design/ceramic-mug/$id");

try {

    $templatePath = __DIR__ . "/wine-tumbler.png";
    $templatePath = false;

    $urlFontPath = __DIR__ . "/../fonts/Inter-Regular.ttf";
    
    // Design
    $design = find_design($connect, $design_id);

    if (!$design) {
        http_response_code(404);
        respond(false, ["error" => "Design not found"]);
    }

    // Extract state
    $state = $design['state_json'];

    if (!$design) {
        http_response_code(404);
        respond(false, ["error" => "Design state not found"]);
    }

    // Colours
    $colours = get_colours_data();
    $colour = $colours['colours'][$state['colourId']]['primary'];

    // Fonts
    $fonts = get_fonts_data();
    $font = $fonts['fonts'][$state['fontFamily']]['local'];
    $fontPath = __DIR__ . "/../fonts/".$font;

    if (!file_exists($fontPath)) {
        error_log("[CERAMIC_MUG] Font not found: " . $fontPath);
        respond(false, ["error" => "Font not found"]);
    }

    $markPath = __DIR__ . "/../images/lakelines_mark.png";

    if (!file_exists($markPath)) {
        error_log("[CERAMIC_MUG] Logo not found: " . $markPath);
        respond(false, ["error" => "Logo    not found"]);
    }

    $lakePath = 'https://api.lakelines.co/design/lake/png/'.$design_id.'?width=1050&height=1050';

    // Extract lake name
    $lakeName = $state['lakeName'];
    $region = $state['region'];
    $latLon = format_coord($state['lat']).', '.format_coord($state['lon']);

    // Create canvas (2475 x 1155 px at 300 DPI)
    $width = 2700;
    $height = 1050;
    $image = imagecreatetruecolor($width, $height);

    // Enable alpha channel
    imagealphablending($image, false);
    imagesavealpha($image, true);

    // Fully transparent background
    $transparent = imagecolorallocatealpha($image, 255, 255, 255, 127);
    imagefill($image, 0, 0, $transparent);

    // Enable anti-aliasing for drawing
    imageantialias($image, true);

    // Add lake name
    $boxX = 30;
    $boxY = 10;
    $boxWidth = 1200;

    add_center_text(
        $image,
        2120 - 580,
        350,
        580 * 2,
        $colour,
        67,
        $fontPath,
        strtoupper($lakeName)); 

    add_center_text(
        $image,
        2120 - 580,
        440,
        580 * 2,
        $colour,
        35,
        $fontPath,
        $region); 

    add_center_text(
        $image,
        2120 - 580,
        520,
        580 * 2,
        $colour,
        27,
        $fontPath,
        $latLon); 

    add_center_text(
        $image,
        2120 - 580,
        970,
        580 * 2,
        $colour,
        20,
        $urlFontPath,
        'lakelines.co'); 

    add_image(
        $image,
        2120 - 30,
        900,
        $markPath,
        50,
        50
    );

    add_remote_image(
        $image, 
        580 - (1050 / 2), 
        0, 
        $lakePath
    );

    add_rectangle(
        $image, 
        2120 - 250, 
        500, 
        fade_color($colour, 50), 
        500, 
        6);

    if($templatePath && file_exists($templatePath)) 
    {
        // Center lines are 580, 1350, 2120
        add_rectangle($image, 575, 0, $colour, 10, 1050);
        add_rectangle($image, 1345, 0, $colour, 10, 1050);
        add_rectangle($image, 2115, 0, $colour, 10, 1050);

        add_image(
            $image,
            0,
            0,
            $templatePath,
            2700,
            1050,
            20
        );
    }

    // Output PNG
    header('Content-Type: image/png');
    
    ob_start();
    imagepng($image);
    $data = ob_get_clean();
    imagedestroy($image);
    echo $data;
    exit;

} catch (Exception $e) {
    error_log("[CERAMIC_MUG] Exception: " . $e->getMessage());
    respond(false, ["error" => "Unknown error occurred"]);
}