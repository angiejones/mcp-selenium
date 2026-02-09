/**
 * Parses Selenium error messages into structured objects.
 *
 * Selenium error messages typically have format:
 *   "https://example.com/file.js 57:12 Uncaught ReferenceError: varName is not defined"
 * or include stack traces in subsequent lines.
 *
 * @param {string} message - The raw Selenium error message string
 * @returns {{ location: string, errorType: string, errorMessage: string, stackLines: string[] } | null}
 */
export function parseSeleniumErrorMessage(message) {
    const lines = message.split('\n');
    const firstLine = lines[0];

    // Pattern: URL line:col ErrorType: error message
    const errorPattern = /^(https?:\/\/[^\s]+)\s+(\d+):(\d+)\s+(.*?):\s*(.+)$/;
    const match = firstLine.match(errorPattern);

    if (match) {
        const [, url, line, col, errorType, errorMessage] = match;
        return {
            location: `${url}:${line}:${col}`,
            errorType: errorType,
            errorMessage: errorMessage,
            stackLines: lines.slice(1).filter(line => line.trim())
        };
    }

    // Alternative pattern: just "ErrorType: message" without location
    const simplePattern = /^(.*?):\s*(.+)$/;
    const simpleMatch = firstLine.match(simplePattern);
    if (simpleMatch) {
        const [, errorType, errorMessage] = simpleMatch;
        return {
            location: '(unknown location)',
            errorType: errorType,
            errorMessage: errorMessage,
            stackLines: lines.slice(1).filter(line => line.trim())
        };
    }

    return null;
}

/**
 * Merges Selenium browser logs and tracked JavaScript errors into a single
 * deduplicated, chronologically sorted list.
 *
 * When a tracked error has a corresponding Selenium log entry within 1 second
 * and with a matching message, the Selenium entry is dropped in favour of the
 * tracked error (which carries richer information such as stack traces).
 *
 * @param {Array<{ timestamp: number, level: { name?: string }, message: string }>} seleniumLogs
 *   Raw log entries returned by `driver.manage().logs().get(…)`.
 * @param {Array<{ timestamp: number, type: string, message: string, stack?: string }>} trackedErrors
 *   Errors collected via the injected `window.__mcpErrorLog` array.
 * @returns {Array<{ timestamp: number, source: string, level: string, message: string, type?: string, hasStack?: boolean }>}
 *   The merged, deduplicated list sorted by timestamp.
 */
export function deduplicateLogs(seleniumLogs, trackedErrors) {
    let allEntries = [];

    seleniumLogs.forEach(log => {
        allEntries.push({
            timestamp: log.timestamp,
            source: 'selenium',
            level: log.level.name || 'OTHER',
            message: log.message,
        });
    });

    trackedErrors.forEach(error => {
        allEntries.push({
            timestamp: error.timestamp,
            source: 'tracked',
            level: error.type === 'error' ? 'SEVERE' : error.type === 'unhandledRejection' ? 'SEVERE' : 'ERROR',
            type: error.type,
            message: error.message,
            hasStack: !!error.stack,
        });
    });

    // Sort chronologically
    allEntries.sort((a, b) => a.timestamp - b.timestamp);

    // Deduplicate: if a tracked error has a matching Selenium log within 1s
    // with the same error message, skip the Selenium entry
    const usedSeleniumTimestamps = new Set();

    for (const entry of allEntries) {
        if (entry.source === 'tracked') {
            for (const other of allEntries) {
                if (other.source === 'selenium' && Math.abs(other.timestamp - entry.timestamp) < 1000) {
                    if (other.message.includes(entry.message) || entry.message.includes(other.message.split(' ').slice(-1)[0])) {
                        usedSeleniumTimestamps.add(other.timestamp);
                    }
                }
            }
        }
    }

    const deduped = [];
    for (const entry of allEntries) {
        if (entry.source === 'selenium' && usedSeleniumTimestamps.has(entry.timestamp)) {
            continue;
        }
        deduped.push(entry);
    }

    return deduped;
}
