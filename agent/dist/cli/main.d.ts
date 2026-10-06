interface Flags {
    profile?: string;
    cwd?: string;
    model?: string;
    yolo?: boolean;
    resume?: string;
    json?: boolean;
    port?: number;
    host?: string;
    verbose?: boolean;
    [k: string]: any;
}
export declare function parseArgs(argv: string[]): {
    cmd: string[];
    flags: Flags;
};
export declare function main(argv: string[]): Promise<void>;
export {};
