/**
 * An error whose message is safe and useful to show to the visitor.
 * Anything else is treated as unexpected and replaced by a generic message.
 */
export class ToolError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ToolError';
    }
}
