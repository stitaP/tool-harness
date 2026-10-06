/**
 * Forgiving JSON parsing for tool arguments produced by small models:
 * code fences, single quotes, trailing commas, unquoted keys, Python literals,
 * truncated objects, and plain strings for single-parameter tools.
 */
export declare function extractJsonBlock(s: string): string | null;
export declare function repairJson(input: string): any;
/**
 * Parse tool arguments. If parsing fails and the tool has exactly one required
 * string parameter, treat the raw text as that parameter's value.
 */
export declare function parseToolArgs(raw: string | object | undefined, schema?: any): Record<string, any>;
