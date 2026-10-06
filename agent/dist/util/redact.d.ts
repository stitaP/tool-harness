/** Secret redaction for logs, tool output and outbound messages. */
export declare function redact(s: string): string;
/** Also redact literal values of known secrets (from .env) that may appear verbatim. */
export declare function redactKnown(s: string, secrets: string[]): string;
/** Tool output the model reads (files, command output): only unmistakable secrets, so code stays intact. */
export declare function redactToolOutput(s: string, secrets: string[]): string;
