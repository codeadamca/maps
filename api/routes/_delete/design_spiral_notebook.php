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
function get_design_spiral_notebook($connect, $id) {
    error_log("[SPIRAL_NOTEBOOK] GET /design/spiral-notebook/$id");

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

        $lakePath = 'https://api.lakelines.co/design/lake/png/'.$id.'?width=1700&height=1700';

        // Extract lake name
        $lakeName = $state['lakeName'];
        $region = $state['region'];
        $latLon = $state['lat'].', '.$state['lon'];

        // Create canvas (2475 x 1155 px at 300 DPI)
        $width = 1810;
        $height = 2534;
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
            210,
            1750,
            $colour,
            85,
            $fontPath,
            $lakeName); 

        add_center_text(
            $image,
            30,
            360,
            1750,
            $colour,
            65,
            $fontPath,
            $region); 

        add_center_text(
            $image,
            30,
            470,
            1750,
            $colour,
            85,
            $fontPath,
            $latLon); 

        add_text(
            $image,
            850,
            2403,
            $colour,
            30,
            $urlFontPath,
            'lakelines.co'); 

        add_image(
            $image,
            730,
            2340,
            $markPath,
            100,
            100
        );

        add_remote_image(
            $image,
            55,
            620,
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
