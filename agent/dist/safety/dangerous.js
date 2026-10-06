/** Dangerous-command detection for the terminal tool (bash, PowerShell, cmd). */
const RULES = [
    [/\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+/, "recursive/forced delete (rm -rf)"],
    [/\brm\s+.*(\s|^)(\/|~|\$HOME|\*)(\s|$)/, "delete of root/home/wildcard"],
    [/\b(sudo|doas|su\s+-|runas)\b/, "privilege escalation"],
    [/\b(mkfs|fdisk|parted|diskpart|format\s+[a-z]:)/i, "disk formatting/partitioning"],
    [/\bdd\s+.*of=\/dev\//, "raw write to a device"],
    [/>\s*\/dev\/(sd|nvme|disk)/, "raw write to a device"],
    [/(curl|wget|iwr|Invoke-WebRequest)[^|;&]*\|\s*(sudo\s+)?(sh|bash|zsh|python3?|node|iex|Invoke-Expression)\b/i, "pipe remote script into an interpreter"],
    [/\bgit\s+push\b[^;&|]*(--force|-f\b|--mirror|--delete)/, "force/destructive git push"],
    [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s|branch\s+-D|filter-branch|reflog\s+expire)/, "destructive git operation"],
    [/\b(shutdown|reboot|halt|poweroff|Stop-Computer|Restart-Computer)\b/i, "system power operation"],
    [/:\(\)\s*\{\s*:\|:&\s*\};:/, "fork bomb"],
    [/\bchmod\s+(-R\s+)?(777|a\+rwx)\b/, "world-writable permissions"],
    [/\bchown\s+-R\b/, "recursive ownership change"],
    [/\b(kill|pkill|killall)\s+(-9\s+)?(-1|1)\b/, "kill all processes"],
    [/\b(systemctl|service|launchctl|sc)\s+(stop|disable|delete|unload)\b/i, "service management"],
    [/\b(crontab\s+-r|schtasks\s+\/delete)\b/i, "delete scheduled tasks"],
    [/\b(Remove-Item)\b[^;|]*-Recurse/i, "recursive delete (PowerShell)"],
    [/\b(rd|rmdir)\s+\/s\b/i, "recursive delete (cmd)"],
    [/\bdel\s+\/[sfq]/i, "forced delete (cmd)"],
    [/\b(reg\s+delete|Remove-ItemProperty\s+.*HKLM)/i, "registry deletion"],
    [/\b(npm|pnpm|yarn)\s+publish\b|\btwine\s+upload\b|\bcargo\s+publish\b/, "publishing a package"],
    [/\b(DROP\s+(TABLE|DATABASE)|TRUNCATE\s+TABLE)\b/i, "destructive SQL"],
    [/\bhistory\s+-c\b|\bunset\s+HISTFILE\b/, "history tampering"],
    [/(^|[;&|]\s*)>\s*~?\/?\.\w*(bashrc|zshrc|profile)\b/, "overwrite shell profile"],
    [/\bssh-keygen\b.*-f\s+~\/\.ssh\/id_/, "overwrite SSH key"],
];
/** Commands that modify the working tree — trigger a checkpoint first. */
const MUTATING = /(\brm\b|\brmdir\b|\bmv\b|\bcp\b|\binstall\b|\bsed\s+-i\b|\btruncate\b|\bdd\b|\bshred\b|(^|[^>])>[^>&]|\bgit\s+(reset|clean|checkout|restore|stash|rebase|merge)\b|Remove-Item|Move-Item|Set-Content|Out-File|\bdel\b|\bren\b)/;
export function dangerReason(command) {
    for (const [re, why] of RULES)
        if (re.test(command))
            return why;
    return null;
}
export function isMutating(command) {
    return MUTATING.test(command);
}
/** User-approved patterns: exact command, prefix with trailing *, or /regex/ */
export function matchesAllow(command, patterns) {
    for (const p of patterns) {
        if (!p)
            continue;
        if (p.startsWith("/") && p.endsWith("/") && p.length > 2) {
            try {
                if (new RegExp(p.slice(1, -1)).test(command))
                    return true;
            }
            catch { /* bad regex */ }
        }
        else if (p.endsWith("*")) {
            if (command.startsWith(p.slice(0, -1)))
                return true;
        }
        else if (command.trim() === p.trim())
            return true;
    }
    return false;
}
