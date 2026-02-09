import * as fs from 'fs';
import * as path from 'path';

/**
 * Validates if a file has an allowed extension
 */
export function validateFileExtension(filePath: string, allowedExtensions: string[]): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return allowedExtensions.includes(ext);
}

/**
 * Reads a markdown file and returns its content
 * @throws Error if file doesn't exist, can't be read, or has wrong extension
 */
export function readMarkdownFile(filePath: string): string {
    // Validate extension
    if (!validateFileExtension(filePath, ['.md', '.markdown'])) {
        throw new Error(`Invalid file extension for ${filePath}. Only .md and .markdown files are supported.`);
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    // Read file
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content;
    } catch (error: any) {
        throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
}

// Image extensions supported by Gemini and common web usage
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'];

/**
 * Checks if a file is a supported image type
 */
export function isImageFile(filePath: string): boolean {
    return validateFileExtension(filePath, IMAGE_EXTENSIONS);
}

/**
 * Reads an image file and returns base64 content
 */
export function readImageFile(filePath: string): string {
    if (!isImageFile(filePath)) {
        throw new Error(`Invalid image file extension for ${filePath}`);
    }

    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    try {
        const fileBuffer = fs.readFileSync(filePath);
        return fileBuffer.toString('base64');
    } catch (error: any) {
        throw new Error(`Failed to read image file ${filePath}: ${error.message}`);
    }
}

/**
 * Reads multiple files (markdown or image) and formats them for provider consumption.
 * Returns an array of file objects to be processed by the provider.
 * Note: This changes the return signature from string to object array, so we'll keep the string return for text-only
 * compatibility for now, but providers should likely use a richer internal format if we were doing a full refactor.
 * For this "Native First" approach, we will keep `readMarkdownFiles` as is for text, and let providers call specific readers.
 * actually, let's keep `readMarkdownFiles` as is for backward compatibility and just export the new helpers.
 */
export function readMarkdownFiles(filePaths: string[]): string {
    if (!filePaths || filePaths.length === 0) {
        return '';
    }

    const fileContents: string[] = [];

    for (const filePath of filePaths) {
        // Skip non-markdown files silently in this specific text-aggregator function
        // so we don't break existing text-only prompts if an image is passed in the mixed list.
        // The provider will handle the image files separately.
        if (validateFileExtension(filePath, ['.md', '.markdown'])) {
            try {
                const content = readMarkdownFile(filePath);
                const fileName = path.basename(filePath);
                fileContents.push(`--- File: ${fileName} ---\n\n${content}\n\n--- End of ${fileName} ---`);
            } catch (error: any) {
                // Re-throw to be handled by the provider
                throw error;
            }
        }
    }

    return fileContents.join('\n\n');
}
