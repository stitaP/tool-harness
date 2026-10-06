/**
 * Repetition control for small models. Once a long reply appears several times in a conversation, the model tends to
 * copy it again — even as the answer to an unrelated new request. These helpers detect near-identical replies and
 * keep repeats out of what the model sees (the stored history is never changed).
 */
import type { Msg } from "../state/db.js";
/** True when two long replies are the same text (ignoring case, punctuation and whitespace) or nearly so. */
export declare function sameReply(a: string, b: string): boolean;
export declare const REPEAT_PLACEHOLDER = "[repeated an earlier reply word for word \u2014 omitted]";
/** History as sent to the model: a long assistant reply that repeats an earlier one becomes a one-line placeholder. */
export declare function collapseRepeats(msgs: Msg[]): Msg[];
