<?php
/**
 * Generate a ceramic mug design PNG (300 DPI, 2475 x 1155 px).
 *
 * Currently renders the lake name text at a fixed position.
 * Future: will add lake silhouette rendering and personalization layers.
 *
 * @param mysqli $connect MySQLi connection resource.
 * @param string $id Design identifier.
 * @return void Outputs PNG and exits.
 */
function get_design_ceramic_mug($connect, $id) {
    error_log("[CERAMIC_MUG] GET /design/ceramic-mug/$id");

    try {

        $urlFontPath = __DIR__ . "/../assets/fonts/Inter-Regular.ttf";
        
        // Design
        $design = find_design($connect, $id);

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
        $fontPath = __DIR__ . "/../assets/fonts/".$font;

        if (!file_exists($fontPath)) {
            error_log("[CERAMIC_MUG] Font not found: " . $fontPath);
            respond(false, ["error" => "Font not found"]);
        }

        $markPath = __DIR__ . "/../assets/images/lakelines_mark.png";

        if (!file_exists($markPath)) {
            error_log("[CERAMIC_MUG] Logo not found: " . $markPath);
            respond(false, ["error" => "Logo    not found"]);
        }

        $lakePath = 'https://api.lakelines.co/design/lake/png/'.$id.'?width=1155&height=1155';

        // Extract lake name
        $lakeName = $state['lakeName'];
        $region = $state['region'];
        $latLon = $state['lat'].', '.$state['lon'];

        // Create canvas (2475 x 1155 px at 300 DPI)
        $width = 2475;
        $height = 1155;
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
            30,
            270,
            1200,
            $colour,
            65,
            $fontPath,
            $lakeName); 

        add_center_text(
            $image,
            30,
            400,
            1200,
            $colour,
            45,
            $fontPath,
            $region); 

        add_center_text(
            $image,
            30,
            490,
            1200,
            $colour,
            65,
            $fontPath,
            $latLon); 

        add_text(
            $image,
            590,
            833,
            $colour,
            30,
            $urlFontPath,
            'lakelines.co'); 

        add_image(
            $image,
            470,
            770,
            $markPath,
            100,
            100
        );

        add_remote_image(
            $image,
            1267,
            0,
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
}
