export declare const SAFARIDRIVER = "/usr/bin/safaridriver";
export declare const SAFARI_SETUP: string;
export declare function safariAvailable(): boolean | string;
declare class SafariElement {
    private page;
    private using;
    private value;
    constructor(page: SafariPage, using: string, value: string);
    first(): this;
    private id;
    waitFor(o?: {
        timeout?: number;
    }): Promise<void>;
    click(o?: {
        timeout?: number;
    }): Promise<void>;
    fill(text: string, o?: {
        timeout?: number;
    }): Promise<void>;
    type(text: string): Promise<void>;
    press(key: string): Promise<void>;
    setInputFiles(files: string[], o?: {
        timeout?: number;
    }): Promise<void>;
    selectOption(v: string | {
        label: string;
    }, o?: {
        timeout?: number;
    }): Promise<void>;
}
/** The part of Playwright's Page that browser.ts uses, backed by one Safari window. */
export declare class SafariPage {
    readonly handle: string;
    private ctx;
    private closed;
    private lastUrl;
    readonly keyboard: {
        press: (k: string) => Promise<void>;
    };
    constructor(handle: string, ctx: SafariContext);
    cmd(method: string, path: string, body?: any): Promise<any>;
    isClosed(): boolean;
    url(): string;
    on(_event: string, _fn: (...a: any[]) => void): void;
    title(): Promise<string>;
    private refreshUrl;
    goto(url: string, _o?: any): Promise<void>;
    goBack(): Promise<void>;
    waitForLoadState(_state?: string, o?: {
        timeout?: number;
    }): Promise<void>;
    waitForTimeout(ms: number): Promise<unknown>;
    evaluate(expr: string): Promise<any>;
    locator(selector: string): SafariElement;
    getByText(text: string, _o?: any): SafariElement;
    private pressKeys;
    screenshot(o: {
        path: string;
        fullPage?: boolean;
    }): Promise<void>;
    bringToFront(): Promise<void>;
    close(): Promise<void>;
}
/** The part of Playwright's BrowserContext that browser.ts uses: one chat's Safari windows. */
export declare class SafariContext {
    private list;
    constructor();
    handles(): string[];
    pages(): SafariPage[];
    forget(p: SafariPage): void;
    newPage(): Promise<SafariPage>;
    close(): Promise<void>;
}
export declare function closeSafari(): Promise<void>;
export {};
