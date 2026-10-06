# stitap-harness (Python)

`pip install stitap-harness` gives Python-only machines the stitaP agent:

| Machine has | What runs |
|---|---|
| platform wheel (`--with-binary` build) | the full engine as a bundled single executable — no Node needed |
| Node.js 20.3+ | the full engine from the bundled single-file JavaScript |
| only Python 3.8+ | the **lite core**: pure Python, zero dependencies |

```bash
python -m stitap              # chat in the terminal
python -m stitap ui           # web chat at http://127.0.0.1:7420
python -m stitap -q "task"    # one-shot
python -m stitap engine       # which engine was picked (binary | node | lite)
STITAP_ENGINE=lite python -m stitap   # force the pure-Python core
```

SDK for a running daemon:

```python
from stitap import Harness
h = Harness()
sid = h.create_session()
print(h.run(sid, "List the files here and summarize the project"))
```

Embed the lite loop directly:

```python
from stitap.lite import Agent
a = Agent(cwd=".")
print(a.send(a.new_session(), "Write hello.py and run it"))
```

Both engines share `~/.stitap` (config.yaml, .env, memories, skills and state.db).
The lite core covers: terminal, files, patch, search, web search/extract, todo, memory, skills,
session search, Python execution, approvals, compression and `/goal`. Cron, MCP, messaging
gateways, browser automation, delegation and the Tool Store need the full engine.
