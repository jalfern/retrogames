"""r2 helper (#1533): register a freshly converted model dir with the live oMLX.

Drops nothing; asks the running server to rescan ~/models (/admin/api/reload),
then optionally loads the model. usage: python r2_register.py <model_id> [--load]
"""
import json
import sys
import time
import urllib.request

import r2_common as R


def admin(path, method="GET"):
    req = urllib.request.Request(f"{R.OMLX_URL}{path}", method=method,
                                data=b"{}" if method == "POST" else None,
                                headers={"Authorization": f"Bearer {R.api_key()}",
                                       "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    mid = sys.argv[1]
    load = "--load" in sys.argv[1:]
    ids = [m.get("id") for m in admin("/admin/api/models").get("models", [])]
    if mid not in ids:
        admin("/admin/api/reload", "POST")
        for _ in range(20):
            time.sleep(3)
            ids = [m.get("id") for m in admin("/admin/api/models").get("models", [])]
            if mid in ids:
                break
    print("known:", mid in ids)
    if load and mid in ids:
        assert R.load_done(mid, wait_s=600), f"{mid} failed to load"
        print("loaded:", mid)


if __name__ == "__main__":
    main()
