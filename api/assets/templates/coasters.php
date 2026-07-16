<?php

error_log("[CERAMIC_MUG] GET /design/notebook-elastic/$id");

try {

    $templatePath = __DIR__ . "/notebook-elastic.png";
    $templatePath = false;

    $guidePath = __DIR__ . "/../guides/coasters.png";
    $guidePath = false;

    $urlFontPath = __DIR__ . "/../fonts/Inter-VariableFont_opsz,wght.ttf";
    
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
    // $colours = get_colours_data();
    // $colour = $colours['colours'][$state['colourId']]['primary'];
    $colour = '#ffffff';
    $accentColour = '#afe1fc';

    // Fonts
    // $fonts = get_fonts_data();
    // $font = $fonts['fonts'][$state['fontFamily']]['local'];
    // $fontPath = __DIR__ . "/../fonts/".$font;
    $fontPath = __DIR__ . "/../fonts/Baskervville-VariableFont_wght.ttf";

    if (!file_exists($fontPath)) {
        error_log("[CERAMIC_MUG] Font not found: " . $fontPath);
        respond(false, ["error" => "Font not found"]);
    }

    $markPath = __DIR__ . "/../images/lakelines_mark_white.png";

    if (!file_exists($markPath)) {
        error_log("[CERAMIC_MUG] Logo not found: " . $markPath);
        respond(false, ["error" => "Logo not found"]);
    }

    // Extract lake name
    $lakeName = $state['lakeName'];
    $region = $state['region'];
    $latLon = format_coord($state['lat']).', '.format_coord($state['lon']);

    // Create canvas (2475 x 1155 px at 300 DPI)
    $width = 1193;
    $height = 1193;
    $image = imagecreatetruecolor($width, $height);

    $lakePadding = 0;
    $lakeWidth = 700;
    $lakeHeight = 700;

    $lakePath = 'https://api.lakelines.co/design/lake/png/'.$design_id.'?width='.$lakeWidth.'&height='.$lakeHeight.'&colour='.urlencode($accentColour);

    // Enable alpha channel
    imagealphablending($image, false);
    imagesavealpha($image, true);

    // Fully transparent background
    $transparent = imagecolorallocatealpha($image, 255, 255, 255, 127);
    imagefill($image, 0, 0, $transparent);

    // Enable anti-aliasing for drawing
    imageantialias($image, true);

    // Calulate font sizes based on image height
    $fontSizeLarge = 40;
    $fontSizeMedium = $fontSizeLarge * 0.5;
    $fontSizeSmall = $fontSizeLarge * 0.4;

    $gapA = $fontSizeSmall;
    $gapB = $gapA * 1.3;
    $gapC = $gapA * 0.7;

    $rectWidth = $fontSizeLarge * 0.1;

    $logoFontSize = $fontSizeLarge * 0.3;
    $logoMarkSize = $logoFontSize * 2;
    $logoGapA = $logoFontSize * 0.3;
    $logoGapB = $logoFontSize * 8;

    $start = 700 + ( 450 -
        $fontSizeLarge - $fontSizeMedium - $fontSizeSmall - 
        $gapA - $gapB - $gapC - 
        $rectWidth - 
        $logoFontSize - $logoFontSize - $logoGapA - $logoGapB) / 2;

    if($templatePath && file_exists($templatePath)) 
    {
        add_image(
            $image,
            0,
            0,
            $templatePath,
            $width,
            $height,
            5
        );
    }

    if($guidePath && file_exists($guidePath)) 
    {
        add_image(
            $image,
            0,
            0,
            $guidePath,
            $width,
            $height,
            5
        );
    }

    add_rectangle(
        $image, 
        0, 
        0, 
        '#286971',
        $width, 
        $height);

    $data = add_center_text(
        $image,
        0,
        $start,
        $width,
        $colour,
        $fontSizeLarge,
        $fontPath,
        strtoupper($lakeName));

    add_center_text(
        $image,
        0,
        $data['y'] + $fontSizeLarge + $gapA,
        $width,
        $colour,
        $fontSizeMedium,
        $fontPath,
        $region); 

    add_rectangle(
        $image, 
        $width / 2 - $data['width'] / 2, 
        $data['y'] + $fontSizeLarge + $fontSizeMedium + $gapA + $gapB, 
        fade_color($accentColour, 100), 
        $data['width'], 
        $rectWidth);

    add_center_text(
        $image,
        0,
        $data['y'] + $fontSizeLarge + $fontSizeMedium + $gapA + $gapB + $gapC + $rectWidth, 
        $width,
        $colour,
        $fontSizeSmall,
        $fontPath,
        $latLon); 

    add_center_text(
        $image,
        0,
        $height - $logoFontSize - $logoGapB,
        $width,
        $colour,
        $logoFontSize,
        $urlFontPath,
        'lakelines.co'); 

    add_image(
        $image,
        $width / 2 - $logoMarkSize / 2,
        $height - $logoFontSize - $logoGapA - $logoGapB - $logoMarkSize,
        $markPath,
        $logoMarkSize,
        $logoMarkSize
    );

    add_remote_image(
        $image, 
        $lakePadding + 221,
        $lakePadding + 50,
        $lakePath
    );

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