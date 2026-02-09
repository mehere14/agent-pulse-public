/**
 * Extracts a base64 encoded image from a text response and saves it to a file.
 *
 * @param content The text content containing the data URL (e.g. "data:image/png;base64,...")
 * @param outputDir The directory where the image should be saved
 * @param filename Optional filename. If not provided, a timestamp-based name will be used.
 * @returns The absolute path to the saved file, or throws an error if no image data is found.
 */
export declare function saveImage(content: string, outputDir: string, filename?: string): string;
