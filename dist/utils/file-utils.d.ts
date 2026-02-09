/**
 * Validates if a file has an allowed extension
 */
export declare function validateFileExtension(filePath: string, allowedExtensions: string[]): boolean;
/**
 * Reads a markdown file and returns its content
 * @throws Error if file doesn't exist, can't be read, or has wrong extension
 */
export declare function readMarkdownFile(filePath: string): string;
/**
 * Checks if a file is a supported image type
 */
export declare function isImageFile(filePath: string): boolean;
/**
 * Reads an image file and returns base64 content
 */
export declare function readImageFile(filePath: string): string;
/**
 * Reads multiple files (markdown or image) and formats them for provider consumption.
 * Returns an array of file objects to be processed by the provider.
 * Note: This changes the return signature from string to object array, so we'll keep the string return for text-only
 * compatibility for now, but providers should likely use a richer internal format if we were doing a full refactor.
 * For this "Native First" approach, we will keep `readMarkdownFiles` as is for text, and let providers call specific readers.
 * actually, let's keep `readMarkdownFiles` as is for backward compatibility and just export the new helpers.
 */
export declare function readMarkdownFiles(filePaths: string[]): string;
