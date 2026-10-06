#!/usr/bin/env python
"""Generate game art through the Codex CLI's built-in image generator (gpt-6-astra + imagegen skill).

Single image:
    python tools/gen_image.py --name unit_knight --prompt "..." [--ref art/raw/style_ref.png]

Batch (jobs run in parallel, finished ones are skipped unless --force):
    python tools/gen_image.py --batch art/jobs.json --parallel 4

jobs.json: [{"name": "unit_knight", "prompt": "...", "ref": ["art/raw/style_ref.png"]}, ...]

Output goes to art/raw/<name>.png. Codex saves into ~/.codex/generated_images/<thread>/ and prints
the path as its final message; this script copies that file into the project.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "art" / "raw"
CODEX_HOME = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
GEN_DIR = CODEX_HOME / "generated_images"

# True while several jobs run at once; the "newest file" fallback is only trustworthy for a lone job.
_PARALLEL = False

WRAPPER = (
    "Use the imagegen skill with the built-in image_gen tool to generate exactly ONE image, then stop. "
    "Do not create, edit or delete any files yourself and do not run shell commands. "
    "{ref_note}"
    "Image spec:\n{spec}\n\n"
    "After the image is generated, reply with only the absolute path of the saved PNG file."
)


def find_codex() -> str:
    env = os.environ.get("CODEX_EXE")
    if env and Path(env).exists():
        return env
    local = os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))
    hits = sorted(glob.glob(os.path.join(local, "OpenAI", "Codex", "bin", "*", "codex.exe")), key=os.path.getmtime)
    if hits:
        return hits[-1]
    found = shutil.which("codex")
    if found:
        return found
    raise SystemExit("codex executable not found (set CODEX_EXE)")


def newest_png_since(t0: float) -> Path | None:
    best: tuple[float, Path] | None = None
    for p in GEN_DIR.glob("*/*.png"):
        m = p.stat().st_mtime
        if m >= t0 and (best is None or m > best[0]):
            best = (m, p)
    return best[1] if best else None


def generate(name: str, prompt: str, refs: list[str], out_dir: Path, timeout: int, retries: int) -> dict:
    out = out_dir / f"{name}.png"
    codex = find_codex()
    ref_note = ""
    if refs:
        ref_note = (
            "The attached image(s) are STYLE REFERENCES only: match their art style, outline weight, "
            "shading and colour treatment exactly, but draw the new subject described below. "
        )
    message = WRAPPER.format(ref_note=ref_note, spec=prompt.strip())
    last_err = ""
    for attempt in range(1, retries + 2):
        t0 = time.time()
        with tempfile.TemporaryDirectory(prefix="codexgen_") as work:
            cmd = [codex, "exec", "-s", "read-only", "--skip-git-repo-check", "-C", work]
            for r in refs:
                cmd += ["-i", str((ROOT / r).resolve() if not os.path.isabs(r) else r)]
            # "--" stops option parsing so a prompt can never be read as a flag.
            cmd += ["--", message]
            try:
                proc = subprocess.run(
                    cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                    timeout=timeout, stdin=subprocess.DEVNULL,
                )
            except subprocess.TimeoutExpired:
                last_err = f"timeout after {timeout}s"
                continue
        src: Path | None = None
        for line in reversed([ln.strip().strip('`"') for ln in proc.stdout.splitlines() if ln.strip()]):
            if line.lower().endswith(".png") and Path(line).exists():
                src = Path(line)
                break
        if src is None and proc.returncode == 0 and not _PARALLEL:
            src = newest_png_since(t0)
        if src is None:
            tail = (proc.stdout or "")[-400:] + " | " + (proc.stderr or "")[-400:]
            last_err = f"no image path in output (exit {proc.returncode}): {tail}"
            continue
        out_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, out)
        return {"name": name, "ok": True, "path": str(out), "seconds": round(time.time() - t0), "attempt": attempt}
    return {"name": name, "ok": False, "error": last_err}


def main() -> int:
    global _PARALLEL
    ap = argparse.ArgumentParser()
    ap.add_argument("--name")
    ap.add_argument("--prompt", help="prompt text, or @path to read it from a file")
    ap.add_argument("--ref", action="append", default=[])
    ap.add_argument("--batch", help="JSON file with a list of jobs")
    ap.add_argument("--only", help="comma-separated job names to run from the batch")
    ap.add_argument("--parallel", type=int, default=3)
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--retries", type=int, default=1)
    ap.add_argument("--force", action="store_true", help="regenerate even if the output exists")
    ap.add_argument("--out-dir", default=str(RAW_DIR))
    args = ap.parse_args()
    out_dir = Path(args.out_dir)

    if args.batch:
        jobs = json.loads(Path(args.batch).read_text(encoding="utf-8"))
        if args.only:
            wanted = {s.strip() for s in args.only.split(",")}
            jobs = [j for j in jobs if j["name"] in wanted]
        todo = [j for j in jobs if args.force or not (out_dir / f"{j['name']}.png").exists()]
        print(f"[gen] {len(todo)} to generate, {len(jobs) - len(todo)} already present", flush=True)
        _PARALLEL = args.parallel > 1 and len(todo) > 1
        failed = 0
        with ThreadPoolExecutor(max_workers=max(1, args.parallel)) as pool:
            futs = [
                pool.submit(generate, j["name"], j["prompt"], j.get("ref", []), out_dir, args.timeout, args.retries)
                for j in todo
            ]
            for f in as_completed(futs):
                r = f.result()
                print(json.dumps(r, ensure_ascii=False), flush=True)
                failed += 0 if r["ok"] else 1
        return 1 if failed else 0

    if not args.name or not args.prompt:
        ap.error("--name and --prompt are required without --batch")
    prompt = args.prompt
    if prompt.startswith("@"):
        prompt = Path(prompt[1:]).read_text(encoding="utf-8")
    if not args.force and (out_dir / f"{args.name}.png").exists():
        print(json.dumps({"name": args.name, "ok": True, "skipped": True}))
        return 0
    r = generate(args.name, prompt, args.ref, out_dir, args.timeout, args.retries)
    print(json.dumps(r, ensure_ascii=False))
    return 0 if r["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
