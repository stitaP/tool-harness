"""Minimal YAML subset (same subset as the Node core): nested maps, lists, scalars, inline [] {}, | blocks."""
import json
import re


def _strip_comment(s):
    in_s = in_d = False
    for i, c in enumerate(s):
        if c == "'" and not in_d:
            in_s = not in_s
        elif c == '"' and not in_s:
            in_d = not in_d
        elif c == "#" and not in_s and not in_d and (i == 0 or s[i - 1].isspace()):
            return s[:i]
    return s


def _split_inline(s):
    out, depth, cur, in_s, in_d = [], 0, "", False, False
    for c in s:
        if c == "'" and not in_d:
            in_s = not in_s
        if c == '"' and not in_s:
            in_d = not in_d
        if not in_s and not in_d:
            if c in "[{":
                depth += 1
            if c in "]}":
                depth -= 1
            if c == "," and depth == 0:
                out.append(cur.strip())
                cur = ""
                continue
        cur += c
    if cur.strip():
        out.append(cur.strip())
    return out


def _key_colon(s):
    in_s = in_d = False
    for i, c in enumerate(s):
        if c == "'" and not in_d:
            in_s = not in_s
        elif c == '"' and not in_s:
            in_d = not in_d
        elif c == ":" and not in_s and not in_d and (i + 1 == len(s) or s[i + 1] == " "):
            return i
    return -1


def _unq(k):
    k = k.strip()
    if len(k) >= 2 and k[0] == k[-1] and k[0] in "\"'":
        return k[1:-1]
    return k


def scalar(raw):
    s = raw.strip()
    if s in ("", "~", "null", "Null", "NULL"):
        return None
    if s in ("true", "True", "TRUE", "yes"):
        return True
    if s in ("false", "False", "FALSE", "no"):
        return False
    if len(s) >= 2 and s[0] == s[-1] == '"':
        try:
            return json.loads(s)
        except ValueError:
            return s[1:-1]
    if len(s) >= 2 and s[0] == s[-1] == "'":
        return s[1:-1].replace("''", "'")
    if s.startswith("[") and s.endswith("]"):
        return [scalar(x) for x in _split_inline(s[1:-1])]
    if s.startswith("{") and s.endswith("}"):
        o = {}
        for part in _split_inline(s[1:-1]):
            i = _key_colon(part)
            o[_unq(part[:i])] = scalar(part[i + 1:])
        return o
    if re.fullmatch(r"[-+]?\d+", s):
        return int(s)
    if re.fullmatch(r"[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?", s):
        return float(s)
    return s


def load(src):
    raw = src.replace("\r\n", "\n").split("\n")
    lines = []
    for no, l in enumerate(raw):
        if re.fullmatch(r"\s*(---|\.\.\.)\s*", l):
            continue
        t = _strip_comment(l)
        if not t.strip():
            continue
        lines.append((len(t) - len(t.lstrip()), t.strip(), no))
    pos = [0]

    def peek():
        return lines[pos[0]] if pos[0] < len(lines) else None

    def block(parent):
        out, ind = [], -1
        start = lines[pos[0] - 1][2] + 1 if pos[0] > 0 else 0
        i = start
        while i < len(raw):
            l = raw[i]
            cur = len(l) - len(l.lstrip())
            if l.strip() and cur <= parent:
                break
            if l.strip() and ind < 0:
                ind = cur
            out.append(l[ind:] if l.strip() else "")
            i += 1
        while pos[0] < len(lines) and lines[pos[0]][2] < i:
            pos[0] += 1
        while out and out[-1] == "":
            out.pop()
        return "\n".join(out) + "\n"

    def value(rest, ind):
        v = rest.strip()
        if v in ("|", "|-", ">", ">-"):
            s = block(ind)
            if v.startswith(">"):
                s = s.replace("\n", " ").strip() + "\n"
            return s[:-1] if v.endswith("-") else s
        if v == "":
            n = peek()
            if n and n[0] > ind:
                return node(n[0])
            if n and n[0] == ind and n[1].startswith("- "):
                return lst(ind)
            return None
        return scalar(v)

    def node(ind):
        n = peek()
        if not n:
            return None
        return lst(n[0]) if n[1].startswith("- ") or n[1] == "-" else mp(n[0])

    def mp(ind):
        o = {}
        while True:
            n = peek()
            if not n or n[0] < ind or n[1].startswith("- "):
                break
            i = _key_colon(n[1])
            if i < 0:
                raise ValueError("expected key: value at line %d" % (n[2] + 1))
            pos[0] += 1
            o[_unq(n[1][:i])] = value(n[1][i + 1:], ind)
        return o

    def lst(ind):
        a = []
        while True:
            n = peek()
            if not n or n[0] != ind or not (n[1].startswith("- ") or n[1] == "-"):
                break
            body = "" if n[1] == "-" else n[1][2:]
            pos[0] += 1
            ci = _key_colon(body)
            if ci > 0 and body.strip()[0] not in "[{\"'":
                o = {_unq(body[:ci]): value(body[ci + 1:], ind + 2)}
                nx = peek()
                if nx and nx[0] == ind + 2 and not nx[1].startswith("- "):
                    o.update(mp(ind + 2))
                a.append(o)
            else:
                a.append(scalar(body) if body.strip() else value("", ind))
        return a

    if not lines:
        return {}
    return node(lines[0][0]) or {}


def _q(s):
    s = str(s)
    if s == "" or re.search(r"[:#\[\]{},&*!|>'\"%@`]", s) or re.fullmatch(r"(true|false|null|yes|no|~|-?\d+(\.\d+)?)", s, re.I) or s != s.strip():
        return json.dumps(s)
    return s


def dump(v, indent=0):
    pad = " " * indent
    if isinstance(v, dict):
        if not v:
            return "{}"
        out = []
        for k, x in v.items():
            if isinstance(x, (dict, list)) and x:
                out.append("%s%s:\n%s" % (pad, _q(k), dump(x, indent + 2)))
            else:
                out.append("%s%s: %s" % (pad, _q(k), "[]" if x == [] else "{}" if x == {} else _scalar_out(x)))
        return "\n".join(out)
    if isinstance(v, list):
        if not v:
            return "[]"
        return "\n".join("%s- %s" % (pad, json.dumps(x) if isinstance(x, (dict, list)) else _scalar_out(x)) for x in v)
    return pad + _scalar_out(v)


def _scalar_out(x):
    if x is None:
        return "null"
    if isinstance(x, bool):
        return "true" if x else "false"
    if isinstance(x, (int, float)):
        return str(x)
    return _q(x)
