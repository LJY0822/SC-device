# -*- coding: utf-8 -*-
"""
SC-个人通讯装置 · 备份合并工具
用法: python merge-backup.py <基底完整备份.json[.gz]> <分项/部分备份.json[.gz]> <输出.json.gz>

逻辑: 以基底 full 备份为准，把分项备份(partial)里的数据块按 ID 并入
      (同 ID 行以分项备份为准覆盖，基底其他数据块与 localStorage 原样保留)，
      产出 exportMode='full' 的完整备份，可直接在「设置→导入数据」导入。

产出后按 scripts/sc-backup.js 的 validate 规则做本地自校验:
  - version==1, exportMode=='full', data 含 sessions/messages/characters/album 四数组
  - 各 store 行 id 唯一(kv 用 key), messages.sessionId 必须存在于 sessions
  - localStorage 为对象且值全为字符串
"""
import gzip, json, sys, io
from datetime import datetime, timezone

def read_backup(path):
    opener = gzip.open if path.lower().endswith('.gz') else open
    with opener(path, 'rt', encoding='utf-8') as f:
        return json.load(f)

def validate_full(doc):
    """模拟 sc-backup.js validate()，抛异常即失败。"""
    assert doc.get('version') == 1 and isinstance(doc.get('data'), dict), '不是支持的备份文件'
    assert doc.get('exportMode') == 'full', 'exportMode 必须为 full'
    data = doc['data']
    for k in ('sessions', 'messages', 'characters', 'album'):
        assert isinstance(data.get(k), list), f'备份缺少 {k}'
    for name, rows in data.items():
        if name == 'localStorage':
            continue
        assert isinstance(rows, list), f'{name} 数据格式错误'
        key = 'key' if name == 'kv' else 'id'
        seen = set()
        for row in rows:
            rid = row.get(key) if isinstance(row, dict) else None
            assert isinstance(rid, str) and rid and rid not in seen, f'{name} 包含无效或重复编号'
            seen.add(rid)
    sess = {s['id'] for s in data['sessions']}
    for m in data['messages']:
        assert m.get('sessionId') in sess, '消息引用了缺失的会话'
    ls = data.get('localStorage')
    assert isinstance(ls, dict) and not isinstance(ls, list), '缺少完整设置快照'
    for v in ls.values():
        assert isinstance(v, str), '设置快照格式错误'

def main():
    if len(sys.argv) != 4:
        print(__doc__); sys.exit(2)
    base_path, part_path, out_path = sys.argv[1:4]

    base = read_backup(base_path)
    part = read_backup(part_path)
    assert base.get('exportMode') == 'full', '基底必须是完整备份(full)'
    print(f"基底: {base.get('exportedAt')} | 块: " + ', '.join(
        f"{k}={len(v) if isinstance(v, list) else 'ls:' + str(len(v))}" for k, v in base['data'].items()))
    print(f"分项: {part.get('exportedAt')} | exportMode={part.get('exportMode')} | 块: " + ', '.join(
        f"{k}={len(v) if isinstance(v, list) else 'ls:' + str(len(v))}" for k, v in part['data'].items()))

    merged = json.loads(json.dumps(base))  # 深拷贝，绝不改动源文件内容
    report = []
    for name, rows in part['data'].items():
        if name == 'localStorage' or not isinstance(rows, list):
            continue  # 分项备份不含设置时不覆盖基底设置
        key = 'key' if name == 'kv' else 'id'
        index = {r[key]: i for i, r in enumerate(merged['data'].setdefault(name, []))}
        add = upd = 0
        for row in rows:
            k = row[key]
            if k in index:
                merged['data'][name][index[k]] = row; upd += 1
            else:
                merged['data'][name].append(row); add += 1
        report.append(f'{name}: 新增 {add}, 覆盖 {upd}, 合并后 {len(merged["data"][name])}')

    merged['exportMode'] = 'full'
    merged['scVersion'] = base.get('scVersion') or 1
    merged['exportedAt'] = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

    validate_full(merged)
    print('自校验: 通过 (version/exportMode/四数组/ID唯一/消息会话引用/localStorage)')

    buf = io.StringIO()
    json.dump(merged, buf, ensure_ascii=False, separators=(',', ':'))
    with open(out_path, 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', compresslevel=6, mtime=0) as f:
        f.write(buf.getvalue().encode('utf-8'))
    import os
    print('合并明细: ' + '; '.join(report))
    print(f'输出: {out_path} ({os.path.getsize(out_path):,} bytes)')

if __name__ == '__main__':
    main()
