from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.auth import hash_password  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a Mr Milk RBAC password hash.")
    parser.add_argument("password", nargs="?", help="Password to hash. Omit to enter it securely.")
    args = parser.parse_args()
    password = args.password or getpass.getpass("Password: ")
    if len(password) < 12:
        print("Password should be at least 12 characters.", file=sys.stderr)
        return 2
    print(hash_password(password))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
