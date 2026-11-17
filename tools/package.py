from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json, re

root = Path(__file__).resolve().parent.parent
assets = json.loads(re.search(r'const FILES=(\[.*?\]);', (root/'sw.js').read_text(encoding='utf-8-sig')).group(1))
files = assets + ['sw.js', '使用说明.md', '启动电脑版.cmd', 'tools/serve.cjs', 'docs/内置指令确认.md', 'docs/内置指令原文.md']
output = root/'dist'/'SC-个人通讯装置-0.1.4.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root/name, name)
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == set(files)
    assert not any('backup' in n and n != 'scripts/sc-backup.js' for n in files)
print(f'{output}\n{len(files)} files, {output.stat().st_size:,} bytes; ZIP verified')
