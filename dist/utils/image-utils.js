"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveImage = saveImage;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Extracts a base64 encoded image from a text response and saves it to a file.
 *
 * @param content The text content containing the data URL (e.g. "data:image/png;base64,...")
 * @param outputDir The directory where the image should be saved
 * @param filename Optional filename. If not provided, a timestamp-based name will be used.
 * @returns The absolute path to the saved file, or throws an error if no image data is found.
 */
function saveImage(content, outputDir, filename) {
    // Regex to find the data URL pattern and capture the base64 data
    // Matches: data:image/<type>;base64,<data>
    const dataUrlRegex = /data:image\/(\w+);base64,([A-Za-z0-9+/=]+)/;
    const match = content.match(dataUrlRegex);
    if (!match || !match[2]) {
        throw new Error("No base64 image data found in content.");
    }
    const imageType = match[1]; // e.g., 'png', 'jpeg'
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    // Ensure output directory exists
    if (!fs_1.default.existsSync(outputDir)) {
        fs_1.default.mkdirSync(outputDir, { recursive: true });
    }
    const finalFilename = filename || `generated_image_${Date.now()}.${imageType}`;
    const outputPath = path_1.default.resolve(outputDir, finalFilename);
    fs_1.default.writeFileSync(outputPath, buffer);
    return outputPath;
}
