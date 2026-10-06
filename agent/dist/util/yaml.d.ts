/**
 * Minimal YAML subset parser/serializer (zero dependencies).
 *
 * Supports what config files need: nested mappings by indentation, block
 * lists of scalars or mappings, inline `[a, b]` / `{}` collections, quoted and
 * plain scalars, numbers, booleans, null, `#` comments and `|` block strings.
 * Anchors, tags and multi-document streams are intentionally unsupported.
 */
export declare class YamlError extends Error {
}
export declare function parseScalar(raw: string): any;
export declare function parseYaml(src: string): any;
export declare function stringifyYaml(v: any, indent?: number): string;
