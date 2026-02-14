/**
 * Parses a BiDi JavaScript error into a normalized log entry.
 *
 * BiDi error objects use underscore-prefixed properties:
 *   _text, _level, _timeStamp, _stackTrace { callFrames: [...] }, _type
 *
 * @param {object} error - The BiDi error object from addJavaScriptErrorHandler
 * @returns {{ timestamp: number, level: string, type: string, message: string, stack: string|null, hasStack: boolean }}
 */
export function parseBidiJsError(error) {
    let message = error._text || error.message || String(error);
    const timestamp = error._timeStamp || Date.now();

    if (!message.startsWith('Uncaught ')) {
        message = 'Uncaught ' + message;
    }

    let stack = null;
    const stackTrace = error._stackTrace || error.stackTrace;
    if (stackTrace && stackTrace.callFrames) {
        const lines = [message];
        for (const frame of stackTrace.callFrames) {
            const fnName = frame.functionName || '(anonymous)';
            lines.push(`    at ${fnName} (${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1})`);
        }
        stack = lines.join('\n');
    } else if (error.stack) {
        stack = error.stack;
    }

    return {
        timestamp,
        level: 'SEVERE',
        type: 'error',
        message,
        stack,
        hasStack: !!stack,
    };
}

/**
 * Parses a BiDi console message entry into a normalized log entry.
 *
 * @param {object} entry - The BiDi console entry from addConsoleMessageHandler
 * @returns {{ timestamp: number, level: string, message: string }}
 */
export function parseBidiConsoleMessage(entry) {
    const levelMap = {
        'error': 'SEVERE',
        'warn': 'WARNING',
        'warning': 'WARNING',
        'info': 'INFO',
        'debug': 'DEBUG',
        'log': 'INFO',
    };
    const rawLevel = entry._level || entry.level || entry.type || 'info';
    const level = levelMap[rawLevel] || 'INFO';
    const text = entry._text || entry.text || (entry.args ? entry.args.map(a => a.value != null ? String(a.value) : String(a)).join(' ') : String(entry));
    const timestamp = entry._timeStamp || entry.timeStamp || Date.now();

    return {
        timestamp,
        level,
        message: text,
    };
}
