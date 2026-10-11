"""Create a reproducible review snapshot without dependencies or private data."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {'AGENTS.md', 'README.md', 'package.json', 'package-lock.json', '.gitignore', '.gitattributes'}
DIRECTORIES = {'docs', 'extension', 'prompt', 'schemas', 'server-plugin', 'tests', 'tools', 'world', '.github'}
DENIED = {'node_modules', 'SillyTavern', 'backups', '.git', 'private', '__pycache__', 'secrets.json'}
EVIDENCE = ['logs/content-publication-core.log', 'logs/soak-recovery-tests.log',
            'logs/m3-soak-smoke/latest.json', 'logs/m3-soak-smoke/stderr.log',
            'logs/m3-soak-smoke/rerun.log', 'logs/m3-soak-smoke/all-model-calls.json']

def git(*args):
    return subprocess.check_output(['git', '-c', 'core.quotepath=false', *args], cwd=ROOT).decode('utf-8')

def allowed(path):
    return not any(part in DENIED or part.startswith('.env') or part.lower() == 'secrets.json'
                   for part in path.parts) and not path.is_symlink()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--usage', type=Path, required=True, help='Authoritative goal usage snapshot JSON')
    args = parser.parse_args()
    now = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    destination = ROOT / 'AI检查包' / f'claude-{now}'
    destination.mkdir(parents=True, exist_ok=False)
    archive = destination / '无限原野_整体审查包.zip'
    sources = [ROOT / name for name in ROOT_FILES if (ROOT / name).is_file()]
    for directory in DIRECTORIES:
        start = ROOT / directory
        if not start.exists():
            continue
        # Prune private/dependency trees before entering them, never open secrets.
        import os
        for base, dirs, files in os.walk(start, followlinks=False):
            dirs[:] = [name for name in dirs if allowed(Path(base) / name)]
            sources.extend(Path(base) / name for name in files if allowed(Path(base) / name))
    sources.extend(ROOT / name for name in EVIDENCE if (ROOT / name).is_file())
    usage = json.loads(args.usage.read_text(encoding='utf-8-sig'))
    metadata = {'capturedAtUtc': now, 'head': git('rev-parse', 'HEAD').strip(),
                'gitStatus': git('status', '--short'), 'usage': usage,
                'exclusions': sorted(DENIED) + ['.env*', 'dist', 'all other logs', 'personal documents'],
                'note': 'Current working files, including uncommitted work. No claim that all tests passed.',
                'files': []}
    captured = []
    for source in sorted(set(sources)):
        relative = source.relative_to(ROOT).as_posix()
        data = source.read_bytes()
        # Fail without printing any matched secret. Do not silently mutate source.
        if re.search(rb'\bsk-[A-Za-z0-9_-]{24,}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', data):
            raise RuntimeError(f'Potential credential detected; file not shared: {relative}')
        captured.append((source, relative, data))
        metadata['files'].append({'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    # Refuse a moving snapshot; callers must freeze writers before packaging.
    for source, relative, data in captured:
        if source.read_bytes() != data:
            raise RuntimeError(f'Source changed while packaging: {relative}')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as package:
        for _, relative, data in captured:
            package.writestr(relative, data)
        package.writestr('REVIEW_MANIFEST.json', json.dumps(metadata, ensure_ascii=False, indent=2))
        safe_paths = {relative for _, relative, _ in captured}
        changed = [name for name in git('diff', '--name-only', '-z', 'HEAD').split('\0') if name in safe_paths]
        package.writestr('UNCOMMITTED_DIFF.patch', git('diff', '--no-ext-diff', 'HEAD', '--', *changed) if changed else '')
    with zipfile.ZipFile(archive) as package:
        assert package.testzip() is None
        assert len(package.namelist()) == len(captured) + 2
    sha = hashlib.sha256(archive.read_bytes()).hexdigest()
    result = {'archive': str(archive), 'sha256': sha, 'files': len(captured),
              'sourceBytes': sum(len(data) for _, _, data in captured), 'zipBytes': archive.stat().st_size,
              'capturedAtUtc': now, 'head': metadata['head']}
    (destination / 'manifest.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    (destination / 'package.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()
