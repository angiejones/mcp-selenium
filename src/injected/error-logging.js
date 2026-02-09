/**
 * Browser error logging setup
 * This script creates a global error storage and captures:
 * - Uncaught errors with full stack traces
 * - Unhandled promise rejections
 * - Console.error calls
 */

// Create global error storage if it doesn't exist
if (!window.__mcpErrorLog) {
    window.__mcpErrorLog = [];

    // Track uncaught errors with full stack traces
    window.addEventListener('error', function(event) {
        window.__mcpErrorLog.push({
            type: 'error',
            message: event.message,
            source: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            stack: event.error ? event.error.stack : null,
            timestamp: Date.now()
        });
    }, true);

    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
        window.__mcpErrorLog.push({
            type: 'unhandledRejection',
            message: event.reason ? event.reason.toString() : 'Unhandled rejection',
            stack: event.reason && event.reason.stack ? event.reason.stack : null,
            timestamp: Date.now()
        });
    });

    // Override console.error to capture those as well
    const originalError = console.error;
    console.error = function(...args) {
        window.__mcpErrorLog.push({
            type: 'console.error',
            message: args.map(a => String(a)).join(' '),
            stack: new Error().stack,
            timestamp: Date.now()
        });
        originalError.apply(console, args);
    };
}

