"""Helper to run SSH commands on the server.

Password resolution order:
  1. SSH_PASSWORD_FILE env var (path to file containing password)
  2. SSH_PASSWORD env var (legacy, avoid — visible to ps)
  3. ~/.ssh/md-succ-password file
"""
import paramiko
import sys
import os
import io
from pathlib import Path

# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def get_password():
    """Resolve SSH password from file or env var."""
    # 1. Explicit password file env var
    pw_file = os.environ.get('SSH_PASSWORD_FILE')
    if pw_file:
        try:
            return Path(pw_file).read_text().strip()
        except Exception as e:
            print(f'Cannot read SSH_PASSWORD_FILE ({pw_file}): {e}', file=sys.stderr)
            return None

    # 2. Legacy env var (avoid — visible to `ps aux`)
    pw = os.environ.get('SSH_PASSWORD')
    if pw:
        return pw

    # 3. Default file location
    default_file = Path.home() / '.ssh' / 'md-succ-password'
    if default_file.exists():
        return default_file.read_text().strip()

    return None

def run(cmd):
    host = os.environ.get('SSH_HOST', '213.165.58.70')
    user = os.environ.get('SSH_USER', 'root')
    password = get_password()
    if not password:
        print('SSH password required. Set via:', file=sys.stderr)
        print('  1. echo "password" > ~/.ssh/md-succ-password', file=sys.stderr)
        print('  2. SSH_PASSWORD_FILE=/path/to/file', file=sys.stderr)
        print('  3. SSH_PASSWORD env var (not recommended)', file=sys.stderr)
        return 1

    client = paramiko.SSHClient()

    # Load and verify known hosts (reject unknown by default)
    known_hosts = Path.home() / '.ssh' / 'known_hosts'
    if known_hosts.exists():
        client.load_host_keys(str(known_hosts))
    # AutoAddPolicy saves new host keys — first-connect TOFU
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    client.connect(host, username=user, password=password, timeout=10)
    stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    client.close()
    if out:
        print(out, end='')
    if err:
        print(err, end='', file=sys.stderr)
    return code

if __name__ == '__main__':
    cmd = ' '.join(sys.argv[1:]) if len(sys.argv) > 1 else sys.stdin.read()
    exit(run(cmd))
