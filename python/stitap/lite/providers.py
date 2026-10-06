"""Model providers (stdlib only): OpenAI-compatible streaming, Anthropic, ReAct text protocol."""
import json
import re
import time
import urllib.error
import urllib.request


class ProviderError(Exception):
    def __init__(self, msg, kind="bad_request", status=None):
        super().__init__(msg)
        self.kind = kind
        self.status = status


def classify(status, body):
    b = body[:600]
    if status == 429:
        return ProviderError("rate limited: " + b, "rate_limit", status)
    if status in (401, 403):
        return ProviderError("authentication failed: " + b, "auth", status)
    if re.search(r"context.{0,20}(length|window)|too many tokens|maximum context|prompt is too long", b, re.I):
        return ProviderError("context length exceeded: " + b, "context_length", status)
    if status == 400 and re.search(r"tool|function", b, re.I) and re.search(r"not support|unsupported|unknown|invalid|does not", b, re.I):
        return ProviderError("tools unsupported: " + b, "tools_unsupported", status)
    if status >= 500:
        return ProviderError("server error %s: %s" % (status, b), "server", status)
    return ProviderError("request failed %s: %s" % (status, b), "bad_request", status)


def split_thinking(text):
    reasoning = []
    content = re.sub(r"<think>([\s\S]*?)(</think>|$)", lambda m: reasoning.append(m.group(1)) or "", text)
    return content.strip(), "".join(reasoning).strip()


def inline_tool_calls(text, names):
    calls = []

    def grab(m):
        try:
            j = json.loads(m.group(1).strip())
            if isinstance(j, dict) and isinstance(j.get("name"), str):
                a = j.get("arguments", j.get("parameters", {}))
                calls.append({"name": j["name"], "arguments": a if isinstance(a, str) else json.dumps(a)})
        except ValueError:
            pass
        return ""
    rest = re.sub(r"<tool_call>\s*([\s\S]*?)\s*(</tool_call>|$)", grab, text)
    if not calls:
        t = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
        if t.startswith("{") and t.endswith("}"):
            try:
                j = json.loads(t)
                if j.get("name") in names and ("arguments" in j or "parameters" in j):
                    calls.append({"name": j["name"], "arguments": json.dumps(j.get("arguments", j.get("parameters")))})
                    rest = ""
            except ValueError:
                pass
    return calls, rest.strip()


def to_openai(messages):
    out = []
    for m in messages:
        if m["role"] == "assistant" and m.get("tool_calls"):
            out.append({"role": "assistant", "content": m.get("content") or None,
                        "tool_calls": [{"id": c["id"], "type": "function", "function": {"name": c["name"], "arguments": c.get("arguments") or "{}"}} for c in m["tool_calls"]]})
        elif m["role"] == "tool":
            out.append({"role": "tool", "tool_call_id": m.get("tool_call_id"), "content": m.get("content") or ""})
        else:
            out.append({"role": m["role"], "content": m.get("content") or ""})
    return out


class OpenAIProvider:
    def __init__(self, base_url, model, api_key=None, context_window=32768, max_tokens=4096, temperature=0.3):
        self.base_url, self.model, self.api_key = base_url.rstrip("/"), model, api_key
        self.context_window, self.max_tokens, self.temperature = context_window, max_tokens, temperature

    def chat(self, messages, tools=None, on_token=None, max_tokens=None, stop=None, stream=True, json_mode=False, should_stop=None):
        body = {"model": self.model, "messages": to_openai(messages), "temperature": self.temperature, "stream": stream,
                "max_tokens": max_tokens or self.max_tokens}
        if tools:
            body["tools"] = [{"type": "function", "function": t} for t in tools]
            body["tool_choice"] = "auto"
        if stop:
            body["stop"] = stop
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = "Bearer " + self.api_key
        req = urllib.request.Request(self.base_url + "/chat/completions", data=json.dumps(body).encode(), headers=headers, method="POST")
        try:
            resp = urllib.request.urlopen(req, timeout=600)
        except urllib.error.HTTPError as e:
            raise classify(e.code, e.read().decode(errors="replace"))
        except urllib.error.URLError as e:
            raise ProviderError("cannot reach model server at %s: %s" % (self.base_url, e.reason), "network")
        content, calls, usage, model = "", [], {"input": 0, "output": 0}, self.model
        with resp:
            if not stream:
                j = json.loads(resp.read().decode())
                msg = j["choices"][0]["message"]
                content = msg.get("content") or ""
                for c in msg.get("tool_calls") or []:
                    a = c["function"].get("arguments")
                    calls.append({"id": c.get("id") or "call_%d" % len(calls), "name": c["function"]["name"], "arguments": a if isinstance(a, str) else json.dumps(a)})
                u = j.get("usage") or {}
                usage = {"input": u.get("prompt_tokens", 0), "output": u.get("completion_tokens", 0)}
            else:
                for raw in resp:
                    if should_stop and should_stop():
                        raise KeyboardInterrupt()
                    line = raw.decode("utf-8", "replace").strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        j = json.loads(data)
                    except ValueError:
                        continue
                    if j.get("usage"):
                        usage = {"input": j["usage"].get("prompt_tokens", 0), "output": j["usage"].get("completion_tokens", 0)}
                    for ch in j.get("choices") or []:
                        d = ch.get("delta") or {}
                        if d.get("content"):
                            content += d["content"]
                            if on_token and "<tool_call>" not in content and "<think>" not in content:
                                on_token(d["content"])
                        for tc in d.get("tool_calls") or []:
                            i = tc.get("index", len(calls))
                            while len(calls) <= i:
                                calls.append({"id": "", "name": "", "arguments": ""})
                            if tc.get("id"):
                                calls[i]["id"] = tc["id"]
                            f = tc.get("function") or {}
                            calls[i]["name"] += f.get("name") or ""
                            a = f.get("arguments")
                            calls[i]["arguments"] += a if isinstance(a, str) else (json.dumps(a) if a else "")
        content, _ = split_thinking(content)
        for i, c in enumerate(calls):
            c["id"] = c["id"] or "call_%d_%d" % (int(time.time() * 1000), i)
        if not calls and tools:
            found, rest = inline_tool_calls(content, [t["name"] for t in tools])
            if found:
                calls = [{"id": "call_%d" % i, **c} for i, c in enumerate(found)]
                content = rest
        return {"content": content, "tool_calls": calls, "usage": usage, "model": model}


class AnthropicProvider:
    def __init__(self, model, api_key, base_url="https://api.anthropic.com", context_window=200000, max_tokens=4096, temperature=0.3):
        self.model, self.api_key, self.base_url = model, api_key, (base_url or "https://api.anthropic.com").rstrip("/")
        self.context_window, self.max_tokens, self.temperature = context_window, max_tokens, temperature

    def chat(self, messages, tools=None, on_token=None, max_tokens=None, stop=None, stream=False, json_mode=False, should_stop=None):
        system = "\n\n".join(m["content"] or "" for m in messages if m["role"] == "system")
        out = []

        def push(role, block):
            if out and out[-1]["role"] == role:
                out[-1]["content"].append(block)
            else:
                out.append({"role": role, "content": [block]})
        for m in messages:
            if m["role"] == "user" and m.get("content"):
                push("user", {"type": "text", "text": m["content"]})
            elif m["role"] == "assistant":
                if m.get("content"):
                    push("assistant", {"type": "text", "text": m["content"]})
                for c in m.get("tool_calls") or []:
                    try:
                        inp = json.loads(c.get("arguments") or "{}")
                    except ValueError:
                        inp = {}
                    push("assistant", {"type": "tool_use", "id": c["id"], "name": c["name"], "input": inp})
            elif m["role"] == "tool":
                push("user", {"type": "tool_result", "tool_use_id": m.get("tool_call_id"), "content": m.get("content") or ""})
        body = {"model": self.model, "max_tokens": max_tokens or self.max_tokens, "temperature": self.temperature, "messages": out}
        if system:
            body["system"] = system
        if tools:
            body["tools"] = [{"name": t["name"], "description": t["description"], "input_schema": t["parameters"]} for t in tools]
        if stop:
            body["stop_sequences"] = stop
        req = urllib.request.Request(self.base_url + "/v1/messages", data=json.dumps(body).encode(), method="POST",
                                     headers={"content-type": "application/json", "x-api-key": self.api_key or "", "anthropic-version": "2023-06-01"})
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                j = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            raise classify(e.code, e.read().decode(errors="replace"))
        text = "".join(b.get("text", "") for b in j.get("content", []) if b["type"] == "text")
        calls = [{"id": b["id"], "name": b["name"], "arguments": json.dumps(b.get("input", {}))} for b in j.get("content", []) if b["type"] == "tool_use"]
        if on_token and text:
            on_token(text)
        u = j.get("usage", {})
        return {"content": text, "tool_calls": calls, "usage": {"input": u.get("input_tokens", 0), "output": u.get("output_tokens", 0)}, "model": j.get("model", self.model)}


def react_block(tools):
    lines = []
    for t in tools:
        props = (t.get("parameters") or {}).get("properties", {})
        req = (t.get("parameters") or {}).get("required", [])
        args = ", ".join("%s%s: %s" % (k, "" if k in req else "?", v.get("type", "any")) for k, v in props.items())
        lines.append("- %s(%s): %s" % (t["name"], args, t["description"].split("\n")[0]))
    return ("## Tools\nTo call a tool reply EXACTLY:\n\nThought: <short reasoning>\nAction: <tool name>\nAction Input: <JSON arguments>\n\n"
            "You then receive \"Observation: <result>\". When done, reply normally without an Action line.\n\nAvailable tools:\n" + "\n".join(lines))


def parse_react(text):
    a = re.search(r"Action\s*:\s*`?([A-Za-z0-9_.\-]+)`?", text)
    if a and not re.search(r"Final Answer\s*:", text[:a.start()]):
        after = text[a.end():]
        inp = re.search(r"Action Input\s*:\s*([\s\S]*?)(?=\n\s*Observation\s*:|$)", after)
        th = re.search(r"Thought\s*:\s*([\s\S]*?)(?=\n\s*Action\s*:|$)", text)
        return {"thought": th.group(1).strip() if th else "", "name": a.group(1), "args": (inp.group(1).strip() if inp else "{}")}
    f = re.search(r"Final Answer\s*:\s*([\s\S]*)$", text)
    return {"final": f.group(1).strip() if f else re.sub(r"^\s*Thought\s*:[^\n]*\n?", "", text).strip()}


class ReactAdapter:
    def __init__(self, inner):
        self.inner, self.model, self.context_window = inner, inner.model, inner.context_window

    def chat(self, messages, tools=None, on_token=None, **kw):
        if not tools:
            return self.inner.chat(messages, on_token=on_token, **kw)
        msgs = []
        for m in messages:
            if m["role"] == "assistant" and m.get("tool_calls"):
                c = m["tool_calls"][0]
                msgs.append({"role": "assistant", "content": "Thought: %s\nAction: %s\nAction Input: %s" % (m.get("content") or "I'll use a tool.", c["name"], c.get("arguments") or "{}")})
            elif m["role"] in ("tool", "user"):
                text = "Observation (%s): %s" % (m.get("name") or "tool", m.get("content") or "") if m["role"] == "tool" else (m.get("content") or "")
                if msgs and msgs[-1]["role"] == "user":
                    msgs[-1] = {"role": "user", "content": msgs[-1]["content"] + "\n\n" + text}
                else:
                    msgs.append({"role": "user", "content": text})
            else:
                msgs.append(dict(m))
        if msgs and msgs[0]["role"] == "system":
            msgs[0] = {"role": "system", "content": msgs[0]["content"] + "\n\n" + react_block(tools)}
        kw.pop("stop", None)
        r = self.inner.chat(msgs, tools=None, on_token=None, stop=["\nObservation:", "Observation:"], **kw)
        p = parse_react(r["content"])
        if "name" in p:
            r.update(content=p["thought"], tool_calls=[{"id": "call_%d" % int(time.time() * 1000), "name": p["name"], "arguments": p["args"]}])
        else:
            r.update(content=p["final"], tool_calls=[])
            if on_token and p["final"]:
                on_token(p["final"])
        return r


class AutoProvider:
    """Native tool calling first; switch to ReAct permanently if the server rejects tools. Retries transient errors."""
    def __init__(self, inner, retries=3):
        self.inner, self.react, self.use_react, self.retries = inner, ReactAdapter(inner), False, retries
        self.model, self.context_window = inner.model, inner.context_window

    def chat(self, messages, tools=None, **kw):
        for attempt in range(self.retries + 1):
            try:
                if self.use_react and tools:
                    return self.react.chat(messages, tools=tools, **kw)
                return self.inner.chat(messages, tools=tools, **kw)
            except ProviderError as e:
                if e.kind == "tools_unsupported" and not self.use_react:
                    self.use_react = True
                    continue
                if e.kind in ("rate_limit", "server", "network") and attempt < self.retries:
                    time.sleep(min(2 ** attempt, 20))
                    continue
                raise


def build(cfg, override=None):
    m = dict(cfg.data["model"])
    m.update(override or {})
    key = m.get("api_key") or cfg.secret(m.get("api_key_env"))
    if m.get("provider") == "anthropic":
        base = AnthropicProvider(m["name"], key, m.get("base_url") or None, m.get("context_window", 200000), m.get("max_output_tokens", 4096), m.get("temperature", 0.3))
    else:
        base = OpenAIProvider(m["base_url"], m["name"], key, m.get("context_window", 32768), m.get("max_output_tokens", 4096), m.get("temperature", 0.3))
    if m.get("tool_mode") == "react":
        return ReactAdapter(base)
    return AutoProvider(base)
