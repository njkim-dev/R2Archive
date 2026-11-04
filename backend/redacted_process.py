import os
import signal
import subprocess
import sys

from log_privacy import redact_ips


def main(command):
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace', bufsize=1, start_new_session=True)

    def forward(number, _frame):
        if process.poll() is None:
            try:
                os.killpg(process.pid, number)
            except ProcessLookupError:
                pass

    for number in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(number, forward)
    try:
        for line in process.stdout:
            sys.stdout.write(redact_ips(line))
            sys.stdout.flush()
        status = process.wait()
        return status if status >= 0 else 128 - status
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit('A server command is required')
    raise SystemExit(main(sys.argv[1:]))
