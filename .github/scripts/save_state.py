"""Saves the bot's state files (posts, history, ...) back to the repo without ever losing a record.
Several workflows write the same JSON files; a plain rebase hits conflicts and the push silently fails
(that is how a daily Short got made twice). Here each file is merged key by key with what is on GitHub now:
dicts are merged, lists are unioned, numbers keep the larger value, anything else keeps this run's value.

    python .github/scripts/save_state.py "state: 2026-11-16 make main" data/posts.json data/history.json
"""
import json
import subprocess
import sys
import time


def git(*args, check=True):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=check)


def merge(remote, local):
    if isinstance(remote, dict) and isinstance(local, dict):
        out = dict(remote)
        for k, v in local.items():
            out[k] = merge(remote[k], v) if k in remote else v
        return out
    if isinstance(remote, list) and isinstance(local, list):
        seen = {json.dumps(x, sort_keys=True) for x in remote}
        return remote + [x for x in local if json.dumps(x, sort_keys=True) not in seen]
    if isinstance(remote, (int, float)) and isinstance(local, (int, float)) and not isinstance(local, bool):
        return max(remote, local)
    return local


def main():
    msg, files = sys.argv[1], sys.argv[2:]
    mine = {}
    for f in files:
        try:
            mine[f] = json.load(open(f))
        except FileNotFoundError:
            pass
    if not mine:
        return
    for attempt in range(8):
        git("fetch", "-q", "origin", "main")
        git("reset", "-q", "--hard", "origin/main")
        for f, local in mine.items():
            r = git("show", f"origin/main:{f}", check=False)
            data = merge(json.loads(r.stdout), local) if r.returncode == 0 and r.stdout.strip() else local
            with open(f, "w") as fh:
                json.dump(data, fh, indent=2, ensure_ascii=False)
                fh.write("\n")
            git("add", f)
        if git("diff", "--cached", "--quiet", check=False).returncode == 0:
            print("state already up to date")
            return
        git("commit", "-q", "-m", msg)
        if git("push", "-q", "origin", "HEAD:main", check=False).returncode == 0:
            print(f"state saved ({', '.join(mine)})")
            return
        print(f"push rejected (attempt {attempt + 1}), merging again")
        time.sleep(3 + attempt * 2)
    raise SystemExit("could not save the state after 8 tries")


if __name__ == "__main__":
    main()
