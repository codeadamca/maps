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
        // Load design
        $design = find_design($connect, $id);

        if (!$design) {
            http_response_code(404);
            header('Content-Type: image/png');
            // Return transparent PNG for 404
            $img = imagecreatetruecolor(2475, 1155);
            $transparent = imagecolorallocatealpha($img, 0, 0, 0, 127);
            imagefill($img, 0, 0, $transparent);
            ob_start();
            imagepng($img);
            $data = ob_get_clean();
            imagedestroy($img);
            echo $data;
            exit;
        }

        // Extract state
        $state = $design['state_json'];

        $colour = $state['colour'] ?? '#000000';
        $fontPath = __DIR__ . "/../assets/fonts/CormorantGaramond-Regular.ttf";

        if (!file_exists($fontPath)) {
            error_log("[CERAMIC_MUG] Font not found: " . $fontPath);
        }


        if (!is_array($state)) {
            http_response_code(400);
            header('Content-Type: image/png');
            $img = imagecreatetruecolor(2475, 1155);
            $transparent = imagecolorallocatealpha($img, 0, 0, 0, 127);
            imagefill($img, 0, 0, $transparent);
            ob_start();
            imagepng($img);
            $data = ob_get_clean();
            imagedestroy($img);
            echo $data;
            exit;
        }

        // Extract lake name
        $lakeName = $state['lakeName'] ?? 'Unknown Lake';

        // Create canvas (2475 x 1155 px at 300 DPI)
        $width = 2475;
        $height = 1155;
        $image = imagecreatetruecolor($width, $height);
        imageantialias($image, true);

        // Allocate colors
        $transparent = imagecolorallocatealpha($image, 0, 0, 0, 127);
        $blackColor = imagecolorallocate($image, 0, 0, 0);

        // Fill with transparent background
        imagefill($image, 0, 0, $transparent);
        imagesavealpha($image, true);

        // Render lake name text
        // Position: x=100, y=150
        // Font: Use built-in GD font for basic rendering
        // For high-DPI output, we need larger font size
        // GD built-in fonts: 1-5 (1=smallest, 5=largest)
        // For 2475px width, we'll use a custom approach with imagestring or ttf

        // Using built-in font 5 (largest GD font)
        $textX = 100;
        $textY = 150;
        $fontSize = 120; // adjust later for design tuning

        imagettftext(
            $image,
            $fontSize,
            0, // angle
            $textX,
            $textY,
            $blackColor,
            $fontPath,
            $lakeName
        );

        // imagestring($image, 5, $textX, $textY, $lakeName, $blackColor);

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
        http_response_code(500);
        header('Content-Type: image/png');
        $img = imagecreatetruecolor(2475, 1155);
        $transparent = imagecolorallocatealpha($img, 0, 0, 0, 127);
        imagefill($img, 0, 0, $transparent);
        ob_start();
        imagepng($img);
        $data = ob_get_clean();
        imagedestroy($img);
        echo $data;
        exit;
    }
}
