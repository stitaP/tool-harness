# Install and run stitaP agent locally — macOS, Windows, Linux

stitaP agent runs entirely on your own machine: a model served by [llama.cpp](https://github.com/ggml-org/llama.cpp)
and the agent's web chat. One launcher works on every system:

```
node agent/scripts/start-local.mjs <model.gguf>
```

It starts the model server, sizes the context to the free GPU memory, runs a speed test, configures the agent and
opens **http://127.0.0.1:7420**. `Ctrl-C` stops everything.

**Contents:** [1. Choose hardware and model](#1-choose-hardware-and-model) ·
[2. macOS](#2-macos) · [3. Windows](#3-windows-10--11) · [4. Linux desktop](#4-linux-desktop) ·
[5. Linux server](#5-linux-server-headless) · [6. Launcher settings](#6-launcher-settings) ·
[Optional extras](#optional-extras) · [7. Updating and uninstalling](#7-updating-and-uninstalling) · [8. Troubleshooting](#8-troubleshooting)

---

## 1. Choose hardware and model

The model must fit in GPU memory (Apple unified memory, or an NVIDIA/AMD card's VRAM) together with its context
cache. If it does not fit, llama.cpp falls back to the CPU and gets much slower.

| GPU memory available | Model | File | Memory used (16K context) | Measured speed (Apple M4, 16 GB) |
|---|---|---|---|---|
| 4 GB+ (or CPU only) | Qwen3-4B-Instruct-2507 Q4_0 — fast, fine for simple tasks | 2.4 GB | ~4 GB | ~30 tok/s |
| 12 GB+ | Qwen3-Coder-30B-A3B UD-IQ2_M — much stronger at coding | 10.8 GB | ~12 GB | ~39 tok/s |

**Models bigger than RAM** (e.g. the full 80B Qwen3-Coder-Next, 19–23 GB, on a 16 GB Mac) cannot be held in memory: the
launcher refuses them unless `ALLOW_BIG_MODEL=1`, and they run at about 1–3 tokens/s even with the SSD-streaming setup
in `bench/moe-stream` (measured settings and the `EXPERTS` option are in its README).

Download links (same files on every system):

- 4B: `https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_0.gguf`
- 30B: `https://huggingface.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF/resolve/main/Qwen3-Coder-30B-A3B-Instruct-UD-IQ2_M.gguf`

Hugging Face sometimes drops long downloads; the commands below use `curl -C -`, so running the same command again
resumes where it stopped.

**What the agent itself needs:** Node.js 20.3 or newer (22 LTS recommended), Git (the agent snapshots files with it
before changing them, so `/rollback` works), about 500 MB of disk for the code and dependencies, plus the model file.

---

## 2. macOS

Apple-silicon Macs (M1 or newer) run models on the GPU through Metal.

```bash
# 1. prerequisites (Homebrew: https://brew.sh)
brew install node llama.cpp git

# 2. code
git clone https://github.com/stitaP/tool-harness.git
cd tool-harness
npm install
npm run agent:build

# 3. model
mkdir -p ~/models
curl -L -C - --retry 5 -o ~/models/Qwen3-4B-Instruct-2507-Q4_0.gguf \
  https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_0.gguf

# 4. start
node agent/scripts/start-local.mjs ~/models/Qwen3-4B-Instruct-2507-Q4_0.gguf
```

**Larger models:** macOS lets the GPU use about two thirds of RAM. For the 30B model on a 16 GB Mac, raise the limit
after every restart: `sudo sysctl iogpu.wired_limit_mb=13312` (the launcher reminds you when it is needed).

**Browser automation:** the agent's browser tools drive Safari. Allow it once: run `safaridriver --enable`; in Safari ▸
Settings ▸ Advanced tick *Show features for web developers*; then *Develop ▸ Allow Remote Automation*. Check it in
⚙ Settings ▸ Tools ▸ browser ▸ **Test**.

---

## 3. Windows 10 / 11

Run these in **PowerShell** (not as administrator).

### 3.1 Prerequisites

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install llama.cpp
```

Close and reopen PowerShell, then check: `node -v` (v20.3+), `git --version`, `llama-server --version`.

If `winget install llama.cpp` is not available, download a release from
[github.com/ggml-org/llama.cpp/releases](https://github.com/ggml-org/llama.cpp/releases) and unzip it to
`C:\llama.cpp`. Pick the build for your graphics card (exact file names change between releases — match the type):

| Graphics | Release zip | Notes |
|---|---|---|
| NVIDIA | `llama-…-bin-win-cuda-12.4-x64.zip` **and** `cudart-llama-bin-win-cuda-12.4-x64.zip` | unzip both into the same folder; needs a current NVIDIA driver |
| AMD or Intel | `llama-…-bin-win-vulkan-x64.zip` | uses Vulkan; needs a current graphics driver |
| none / unsure | `llama-…-bin-win-cpu-x64.zip` | works everywhere, much slower — use the 4B model |

Then tell the launcher where it is (each new PowerShell window, or add the folder to PATH):

```powershell
$env:LLAMA_SERVER = "C:\llama.cpp\llama-server.exe"
```

### 3.2 Code and model

```powershell
git clone https://github.com/stitaP/tool-harness.git
cd tool-harness
npm install
npm run agent:build

mkdir $HOME\models -Force
curl.exe -L -C - --retry 5 -o $HOME\models\Qwen3-4B-Instruct-2507-Q4_0.gguf `
  https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_0.gguf
```

(Type `curl.exe`, not `curl` — in Windows PowerShell `curl` is a different command.)

### 3.3 Start

```powershell
node agent\scripts\start-local.mjs $HOME\models\Qwen3-4B-Instruct-2507-Q4_0.gguf
```

Settings go in front as PowerShell variables, e.g. `$env:PROFILE = "standard"; node agent\scripts\start-local.mjs …`.

### 3.4 Windows specifics

- **Commands the agent runs** use PowerShell (`pwsh` if installed, otherwise Windows PowerShell). Dangerous commands
  (`Remove-Item -Recurse`, `Format-Volume`, registry edits, …) still ask for approval.
- **Firewall:** everything listens on `127.0.0.1` only. If Windows asks about network access for `node` or
  `llama-server`, choosing *Cancel* (no public/private exposure) is fine.
- **Memory locking** (`--mlock`) is skipped on Windows; close other heavy apps so the model is not paged out.
- **Browser automation:** run `node agent\bin\harness.mjs browser setup` once (installs Playwright's driver), then pick
  Edge or Chrome in ⚙ Settings ▸ Tools ▸ browser.
- **Data folder:** `%USERPROFILE%\.stitap` (config, chats, memory, skills).

---

## 4. Linux desktop

```bash
# 1. prerequisites — Debian/Ubuntu example
sudo apt update && sudo apt install -y git curl build-essential cmake libcurl4-openssl-dev
# Node.js 22 LTS: use your distribution's instructions from https://nodejs.org/en/download (nvm, NodeSource, or a package)
node -v                         # v20.3 or newer
```

**llama.cpp** — pick one:

| Option | Commands |
|---|---|
| Homebrew on Linux | `brew install llama.cpp` |
| Prebuilt release | download `llama-…-bin-ubuntu-x64.zip` (CPU) or `…-ubuntu-vulkan-x64.zip` (AMD/Intel/NVIDIA via Vulkan) from the [releases](https://github.com/ggml-org/llama.cpp/releases), unzip, then `export LLAMA_SERVER=/path/to/the/unzipped/folder/llama-server` (the folder that contains `llama-server`) |
| Build for NVIDIA (CUDA) | install the CUDA toolkit, then `git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp && cmake -B build -DGGML_CUDA=ON && cmake --build build --config Release -j` |
| Build for AMD/Intel (Vulkan) | install the Vulkan SDK/headers, then the same build with `-DGGML_VULKAN=ON` |
| Build for CPU only | the same build without a GPU flag |

After building from source: `export LLAMA_SERVER=~/llama.cpp/build/bin/llama-server` (add it to `~/.bashrc`).

Then the same steps as macOS:

```bash
git clone https://github.com/stitaP/tool-harness.git && cd tool-harness
npm install && npm run agent:build
mkdir -p ~/models
curl -L -C - --retry 5 -o ~/models/Qwen3-4B-Instruct-2507-Q4_0.gguf \
  https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_0.gguf
node agent/scripts/start-local.mjs ~/models/Qwen3-4B-Instruct-2507-Q4_0.gguf
```

**Locked memory:** the launcher asks llama.cpp to lock the model in RAM (`--mlock`). If your user's limit is low,
llama.cpp prints a warning and continues; raise it with `ulimit -l unlimited` (or `memlock` in
`/etc/security/limits.conf`).

**Browser automation:** `node agent/bin/harness.mjs browser setup`, then pick Chrome/Chromium in ⚙ Settings ▸ Tools ▸ browser.

---

## 5. Linux server (headless)

Same installation as a Linux desktop. Differences:

### 5.1 Start without a browser and connect through SSH

```bash
node agent/scripts/start-local.mjs ~/models/Qwen3-Coder-30B-A3B-Instruct-UD-IQ2_M.gguf --no-open
```

On **your own computer**, open a tunnel and browse to http://127.0.0.1:7420:

```bash
ssh -N -L 7420:127.0.0.1:7420 <user>@<server>
```

### 5.2 Keep it private

The agent runs real commands with your user's permissions, and the web page hands its access token to whoever can
load it. **Do not expose port 7420 (or 8081) to a network.** Use the SSH tunnel, or a private network such as a VPN or
Tailscale. For unattended work, run commands in a container: ⚙ Settings ▸ Tools ▸ terminal ▸ *Where commands run* =
`docker` (or `terminal.backend: docker` in `~/.stitap/config.yaml`), and keep *Risky commands* on `ask` or `deny`.

### 5.3 Run it as a service (systemd)

`/etc/systemd/system/stitap.service` (replace `stitap` with the user that owns the checkout):

```ini
[Unit]
Description=stitaP agent (llama.cpp model server + web chat)
After=network-online.target

[Service]
User=stitap
WorkingDirectory=/home/stitap/tool-harness
Environment=STITAP_ROOT=/home/stitap/.stitap
Environment=PROFILE=standard
# Environment=LLAMA_SERVER=/home/stitap/llama.cpp/build/bin/llama-server
ExecStart=/usr/bin/node agent/scripts/start-local.mjs /home/stitap/models/Qwen3-Coder-30B-A3B-Instruct-UD-IQ2_M.gguf --no-open
Restart=on-failure
LimitMEMLOCK=infinity

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now stitap
journalctl -u stitap -f            # launcher output; model/agent logs are in ~/.stitap/logs/
```

### 5.4 Scheduled and long-running work

`/schedule in 2h | <task>` (or the agent's `cronjob_manage` tool) runs tasks unattended in their own chat; risky
commands in unattended runs follow *Unattended risky commands* (default `deny`). Long tasks use `/goal`, plans
(`todo_list`) and automatic context compaction — see [agent-runtime.md](agent-runtime.md).

---

## 6. Launcher settings

Set them as environment variables (`NAME=value node …` on macOS/Linux, `$env:NAME = "value"` in PowerShell).

| Setting | Default | Meaning |
|---|---|---|
| `CTX` | `auto` | context size in tokens; `auto` = the largest that fits in free GPU memory |
| `FIT_MARGIN_MB` | `1024` | GPU memory to leave free when `CTX=auto` (raise it to keep room for other apps) |
| `KV` | `q8_0` | context-cache precision: `q8_0`, `f16`, or `q4_0` (twice the context, slightly less accurate) |
| `NGL` | all | GPU layers when `CTX` is fixed; `0` = CPU only |
| `PROFILE` | `slm` | agent tools: `slm` (fast, ~10 tools), `standard`, `full` |
| `THREADS` | `4` | CPU threads |
| `PORT` / `UI_PORT` | `8081` / `7420` | model server / web chat ports |
| `LLAMA_SERVER` | `llama-server` | path to llama.cpp's server if it is not on PATH |
| `STITAP_ROOT` | `~/.stitap` | where config, chats, memory and skills are kept |
| `--no-open` | — | do not open a browser (servers) |

Everything else — default working folder, agents, every tool, approvals, compaction, scheduling — is in the web
chat's ⚙ **Settings**, saved to `~/.stitap/config.yaml`.

---

## Optional extras

Only needed for the tools that use them.

| For | macOS | Windows | Linux |
|---|---|---|---|
| Screenshots / screen video (`screen_capture`, `screen_record`, `desktop`) | System Settings ▸ Privacy & Security ▸ **Screen Recording** (and **Accessibility** for `desktop` clicks/typing): allow Terminal or the app that starts the agent, then reopen it | works out of the box (PowerShell) | Wayland: `grim` (+ `wf-recorder` for video) · X11: ImageMagick or `scrot`, `xdotool` for window capture |
| Screen video on Windows/Linux, camera everywhere (`camera_capture`) | `brew install ffmpeg` | `winget install Gyan.FFmpeg` | `sudo apt install ffmpeg` |
| Browser tests (`webtest`) | `node agent/node_modules/playwright-core/cli.js install chromium` (or ask the agent: `webtest action=install`; add `webkit` for the Safari engine) | same | same, plus `npx playwright install-deps` for system libraries |

The browser tools need Playwright's driver once: `node agent/bin/harness.mjs browser setup`. Office conversion
(`office_to_markdown`, including old `.doc` `.xls` `.ppt` `.rtf`) needs nothing extra.

## 7. Updating and uninstalling

```bash
cd tool-harness && git pull && npm install && npm run agent:build     # update, then restart the launcher
```

Uninstall: stop the launcher, delete the `tool-harness` folder, your `models` folder and (to remove chats, memory and
settings) `~/.stitap`. On macOS/Linux also `brew uninstall llama.cpp` if you installed it that way;
on Windows `winget uninstall llama.cpp`.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `port 8081 is in use` / `port 7420 is in use` | another copy is running: press `Ctrl-C` in its window (or `pkill llama-server; pkill -f "harness.mjs serve"`, on Windows close the window or end `llama-server.exe` / `node.exe` in Task Manager), or set `PORT` / `UI_PORT` |
| `this model … is larger than this machine can hold in memory` | the model file is bigger than ~¾ of RAM: it would run from disk at ~1 token/s. Use a model from section 1 (or set `ALLOW_BIG_MODEL=1` to start it anyway, without memory locking) |
| `Cannot find module …/start-local.mis` (or similar) | a typo in the file name — it is `start-local.mjs` |
| `llama-server was not found` | install llama.cpp (sections above) or set `LLAMA_SERVER` to its full path |
| `the agent is not built yet` | run `npm install && npm run agent:build` in the `tool-harness` folder |
| The model server stops right after starting | not enough GPU memory: use the 4B model, lower `CTX` (e.g. `CTX=8192`), raise the macOS GPU limit, or close other apps; details in `~/.stitap/logs/model.log` |
| Very slow replies (a few tok/s) | the model is running on the CPU or swapping: check the GPU line the launcher prints and the **Model stats** panel; use a smaller model or `/compact` long chats |
| `Unknown command /…` when pasting a path | fixed in current versions — update (section 7) |
| The agent writes files in the wrong place | click 📁 in the top bar and choose the project folder (tick *default* to use it for new chats) |
| `Safari is not set up for automation` | do the three Safari steps in section 2 |
| `Screen Recording permission is missing` (screenshots only show the wallpaper) | allow the app that runs the agent under System Settings ▸ Privacy & Security ▸ Screen Recording, then quit and reopen it |
| `needs ffmpeg` (screen video, camera) | install ffmpeg — see [Optional extras](#optional-extras) |
| `webtest`: browser executable doesn't exist | `node agent/node_modules/playwright-core/cli.js install chromium` (or `webtest action=install`) |
| Disk filling up | old versions snapshotted large files before every write; update, then delete `~/.stitap/checkpoints` |
