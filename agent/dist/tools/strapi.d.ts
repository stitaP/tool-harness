import { type Tool } from "./types.js";
/** "Blog post" → "blog-post" (Strapi wants kebab-case singular/plural names). */
export declare const kebab: (s: string) => string;
/**
 * Field shorthand → Strapi attribute: "string", "string!" (required), "decimal", "enumeration:draft,published",
 * "media", "media[]" (multiple), "relation:category" (many-to-one), "relation[]:tag" (many-to-many), "uid:title".
 */
export declare function attribute(spec: string): Record<string, any>;
/** The files Strapi expects for an API content type. */
export declare function contentTypeFiles(name: string, fields: Record<string, string>, o?: {
    plural?: string;
    display?: string;
    single?: boolean;
    draftAndPublish?: boolean;
}): Record<string, string>;
export declare const strapiTool: Tool;
