from __future__ import annotations

import argparse
import json
import shlex
from pathlib import Path

import paramiko


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def run(client, command: str, password: str, timeout: int = 1800) -> str:
    stdin, stdout, stderr = client.exec_command(f"sudo -S -p '' sh -c {shlex.quote(command)}", timeout=timeout)
    stdin.write(password + "\n")
    stdin.flush()
    stdin.channel.shutdown_write()
    output = stdout.read().decode("utf-8", errors="replace")
    error = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error or output or f"remote command failed: {code}")
    return output


def webapi(client, user: str, password: str, api: str, method: str, **params):
    pieces = [
        "/usr/syno/bin/synowebapi",
        "--exec",
        f"api={shlex.quote(api)}",
        f"method={shlex.quote(method)}",
        "version=1",
        f"runner={shlex.quote(user)}",
    ]
    for key, value in params.items():
        encoded = json.dumps(value, ensure_ascii=True, separators=(",", ":"))
        pieces.append(f"{key}={shlex.quote(encoded)}")
    raw = run(client, " ".join(pieces), password)
    start, end = raw.find("{"), raw.rfind("}")
    response = json.loads(raw[start : end + 1])
    if not response.get("success"):
        raise RuntimeError(f"{api}.{method} failed: {response.get('error')}")
    return response


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", type=Path, required=True)
    args = parser.parse_args()
    values = read_env(args.env)
    user, password = values["NAS_USER"], values["NAS_PASSWORD"]

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        values["NAS_URL"],
        port=int(values.get("NAS_PORT", "22")),
        username=user,
        password=password,
        timeout=20,
    )
    try:
        for name, description in (
            ("r2archive-static", "R2Archive read-only assets"),
            ("r2archive-data", "R2Archive writable data and backups"),
        ):
            check = run(client, f"test -d /volume1/{shlex.quote(name)} && echo yes || echo no", password).strip()
            if check != "yes":
                command = (
                    f"/usr/syno/sbin/synoshare --add {shlex.quote(name)} {shlex.quote(description)} "
                    f"/volume1/{shlex.quote(name)} '' '' '' 1 0"
                )
                run(client, command, password)

        rule_base = {
            "client": "192.168.0.8",
            "root_squash": "root",
            "async": False,
            "insecure": False,
            "crossmnt": False,
            "security_flavor": {
                "sys": True,
                "kerberos": False,
                "kerberos_integrity": False,
                "kerberos_privacy": False,
            },
        }
        webapi(
            client,
            user,
            password,
            "SYNO.Core.FileServ.NFS.SharePrivilege",
            "save",
            share_name="r2archive-static",
            rule=[{**rule_base, "privilege": "ro"}],
        )
        webapi(
            client,
            user,
            password,
            "SYNO.Core.FileServ.NFS.SharePrivilege",
            "save",
            share_name="r2archive-data",
            rule=[{**rule_base, "privilege": "rw"}],
        )

        copy_command = r"""
set -eu
mkdir -p /volume1/r2archive-static/rnr_image /volume1/r2archive-static/xyx /volume1/r2archive-static/pmang_image
mkdir -p /volume1/r2archive-data/record_screenshots /volume1/r2archive-data/backups/postgres
rsync -a --delete /volume1/njkim/R2Music_Archive/rnr_image/ /volume1/r2archive-static/rnr_image/
rsync -a --delete /volume1/njkim/R2Music_Archive/xyx/ /volume1/r2archive-static/xyx/
rsync -a --delete /volume1/njkim/R2Music_Archive/pmang_image/ /volume1/r2archive-static/pmang_image/
rsync -a /volume1/njkim/R2Music_Archive/record_screenshots/ /volume1/r2archive-data/record_screenshots/
chown -R 1026:100 /volume1/r2archive-data/record_screenshots
chmod 0770 /volume1/r2archive-data/record_screenshots
chown -R 999:100 /volume1/r2archive-data/backups
chmod 0770 /volume1/r2archive-data/backups /volume1/r2archive-data/backups/postgres
find /volume1/r2archive-static -type d -exec chmod 0755 {} +
find /volume1/r2archive-static -type f -exec chmod 0644 {} +
echo "source_files=$(find /volume1/njkim/R2Music_Archive/rnr_image /volume1/njkim/R2Music_Archive/xyx /volume1/njkim/R2Music_Archive/pmang_image -type f | wc -l)"
echo "target_files=$(find /volume1/r2archive-static -type f | wc -l)"
du -sb /volume1/r2archive-static /volume1/r2archive-data
find /volume1/r2archive-static -type f | sort | awk 'NR % 500 == 1' | head -n 20 | xargs sha256sum
exportfs -v
"""
        print(run(client, copy_command, password), end="")
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
