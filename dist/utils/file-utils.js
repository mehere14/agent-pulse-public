"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFileExtension = validateFileExtension;
exports.readMarkdownFile = readMarkdownFile;
exports.isImageFile = isImageFile;
exports.readImageFile = readImageFile;
exports.readMarkdownFiles = readMarkdownFiles;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Validates if a file has an allowed extension
 */
function validateFileExtension(filePath, allowedExtensions) {
    const ext = path.extname(filePath).toLowerCase();
    return allowedExtensions.includes(ext);
}
/**
 * Reads a markdown file and returns its content
 * @throws Error if file doesn't exist, can't be read, or has wrong extension
 */
function readMarkdownFile(filePath) {
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
    }
    catch (error) {
        throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
}
// Image extensions supported by Gemini and common web usage
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'];
/**
 * Checks if a file is a supported image type
 */
function isImageFile(filePath) {
    return validateFileExtension(filePath, IMAGE_EXTENSIONS);
}
/**
 * Reads an image file and returns base64 content
 */
function readImageFile(filePath) {
    if (!isImageFile(filePath)) {
        throw new Error(`Invalid image file extension for ${filePath}`);
    }
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    try {
        const fileBuffer = fs.readFileSync(filePath);
        return fileBuffer.toString('base64');
    }
    catch (error) {
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
function readMarkdownFiles(filePaths) {
    if (!filePaths || filePaths.length === 0) {
        return '';
    }
    const fileContents = [];
    for (const filePath of filePaths) {
        // Skip non-markdown files silently in this specific text-aggregator function
        // so we don't break existing text-only prompts if an image is passed in the mixed list.
        // The provider will handle the image files separately.
        if (validateFileExtension(filePath, ['.md', '.markdown'])) {
            try {
                const content = readMarkdownFile(filePath);
                const fileName = path.basename(filePath);
                fileContents.push(`--- File: ${fileName} ---\n\n${content}\n\n--- End of ${fileName} ---`);
            }
            catch (error) {
                // Re-throw to be handled by the provider
                throw error;
            }
        }
    }
    return fileContents.join('\n\n');
}
