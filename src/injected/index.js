/**
 * Injectable browser scripts
 *
 * These scripts are designed to be injected into browser pages
 * via executeScript or similar mechanisms.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load a script file as a string
 */
const loadScript = (filename) => {
    return readFileSync(join(__dirname, filename), 'utf-8');
};

// Export all injectable scripts
export const injectedScripts = {
    errorLogging: loadScript('error-logging.js')
};

export default injectedScripts;

