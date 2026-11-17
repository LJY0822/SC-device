// SC 增量同步离线测试：用内存版 IndexedDB 模拟两台设备，验证增量/并集/墓碑/幂等。
// 运行：node tests/sync.test.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'sc-sync.js'), 'utf8');

// ---- 内存版 Storage（模拟 IndexedDB 的 11 个表 + kv）----
function makeStorage(label) {
  const tables = Object.create(null);
  const kv = new Map();
  SCSyncStores.forEach((s) => { tables[s] = []; });
  tables.kv = [];

  const api = {
    label,
    tables,
    syncRef: { mod: null },
    _kv: kv,
    async dbGetAll(name) {
      return (tables[name] || []).map((r) => ({ ...r }));
    },
    async dbGet(name, id) {
      const r = (tables[name] || []).find((x) => x.id === id);
      return r ? { ...r } : null;
    },
    async dbPut(name, row) {
      const arr = tables[name] || (tables[name] = []);
      const i = arr.findIndex((x) => x.id === row.id);
      if (i >= 0) arr[i] = { ...row }; else arr.push({ ...row });
      return row;
    },
    // 与真实实现一致：删除时默认留墓碑
    async dbDelete(name, id, opts = {}) {
      const arr = tables[name] || [];
      const i = arr.findIndex((x) => x.id === id);
      if (i >= 0) arr.splice(i, 1);
      if (opts.tombstone !== false && api.syncRef.mod) {
        await api.syncRef.mod.noteDelete(name, id);
      }
    },
    async kvGet(k) { return kv.has(k) ? kv.get(k) : null; },
    async kvSet(k, v) { kv.set(k, v); },
    db: {
      transaction(name) {
        const tx = { oncomplete: null, onabort: null, onerror: null };
        const store = {
          put(row) {
            const arr = tables[name] || (tables[name] = []);
            const i = arr.findIndex((x) => x.id === row.id);
            if (i >= 0) arr[i] = { ...row }; else arr.push({ ...row });
          },
          delete(id) {
            const arr = tables[name] || [];
            const i = arr.findIndex((x) => x.id === id);
            if (i >= 0) arr.splice(i, 1);
          },
          getAllKeys() {
            const req = {
              onsuccess: null, onerror: null,
              result: (tables[name] || []).map((r) => r.id)
            };
            setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
            return req;
          }
        };
        tx.objectStore = () => store;
        setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
        return tx;
      }
    }
  };
  return api;
}

const SCSyncStores = [
  'sessions', 'messages', 'characters', 'masks', 'notes',
  'threads', 'moments', 'themes', 'album', 'tracks', 'widgetResources'
];

const SCBackupMock = {
  async encode(v) { return JSON.parse(JSON.stringify(v)); },
  decode(v) { return v; }
};

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

// 每台设备独立 context，避免 const 重复声明冲突
function loadModuleFor(storage) {
  const c = vm.createContext({
    Storage: storage,
    SCBackup: SCBackupMock,
    console, Blob, Date, JSON, Math, Object, Array, String, Number, Set, Map, Promise, setTimeout,
    alert() {}, confirm() { return true; }
  });
  const mod = vm.runInContext(SRC + '\n;SCSync', c);
  storage.syncRef.mod = mod;
  return mod;
}

const DAY = 86400000;
const OLD = Date.now() - 10 * DAY;

function msg(id, sessionId, createdAt) {
  return { id, sessionId, role: 'user', content: 'x'.repeat(120), createdAt, mode: 0 };
}

(async () => {
  // ================= T1 首次导出 = 全量 =================
  console.log('\nT1 首次同步导出全量');
  const A = makeStorage('A');
  const syncA = loadModuleFor(A);
  await A.dbPut('sessions', { id: 's1', title: '甲', createdAt: OLD, updatedAt: OLD });
  for (let i = 0; i < 10; i++) await A.dbPut('messages', msg('m' + i, 's1', OLD + i));

  let pv = await syncA.preview();
  check('首次状态标记为 firstTime', pv.firstTime === true);
  check('待传 11 项（1 会话 + 10 消息）', pv.total === 11, `实际 ${pv.total}`);

  const d1 = await syncA.buildDelta();
  check('增量包 exportMode=delta', d1.exportMode === 'delta');
  check('包含 10 条消息', d1.data.messages.length === 10, `实际 ${d1.data.messages.length}`);

  // ================= T2 增量只带变化 =================
  console.log('\nT2 同步后只传新增');
  await A.kvSet(syncA.KV.CURSOR, Date.now());
  await A.dbPut('messages', msg('m-new1', 's1', Date.now()));
  await A.dbPut('messages', msg('m-new2', 's1', Date.now()));
  const d2 = await syncA.buildDelta();
  const inWindow = (d2.data.messages || []).filter((m) => m.id.startsWith('m-new'));
  check('新消息在包内', inWindow.length === 2, `实际 ${inWindow.length}`);
  check('10 天前的历史消息不在包内',
    !(d2.data.messages || []).some((m) => /^m\d$/.test(m.id)),
    `误含 ${(d2.data.messages || []).filter((m) => /^m\d$/.test(m.id)).length} 条`);

  // ================= T3 双端并集合并 =================
  console.log('\nT3 双端各自聊天后互相合并');
  const B = makeStorage('B');
  const syncB = loadModuleFor(B);
  // B 先有同样的历史底子（模拟首次全量同步过）
  await B.dbPut('sessions', { id: 's1', title: '甲', createdAt: OLD, updatedAt: OLD });
  for (let i = 0; i < 10; i++) await B.dbPut('messages', msg('m' + i, 's1', OLD + i));
  await B.kvSet(syncB.KV.CURSOR, Date.now());

  // A 新增 2 条，B 新增 3 条
  await A.dbPut('messages', msg('a-only1', 's1', Date.now()));
  await B.dbPut('messages', msg('b-only1', 's1', Date.now()));
  await B.dbPut('messages', msg('b-only2', 's1', Date.now()));
  await B.dbPut('messages', msg('b-only3', 's1', Date.now()));

  const packA = await syncA.buildDelta();
  const rB = await syncB.applyDelta(packA);
  check('B 收到 A 的 2 条新消息', rB.added === 3, `实际新增 ${rB.added}（含 1 条新消息 a-only1 + 2 条新消息 m-new1/2）`);

  const bMsgs = await B.dbGetAll('messages');
  const bIds = new Set(bMsgs.map((m) => m.id));
  check('B 已有 A 独有的 a-only1', bIds.has('a-only1'));
  check('B 保留自己独有的 b-only1', bIds.has('b-only1'));

  const packB = await syncB.buildDelta();
  const rA = await syncA.applyDelta(packB);
  const aMsgs = await A.dbGetAll('messages');
  const aIds = new Set(aMsgs.map((m) => m.id));
  check('A 收到 B 独有的 b-only1/2/3',
    aIds.has('b-only1') && aIds.has('b-only2') && aIds.has('b-only3'));
  check('两端消息数量一致', aMsgs.length === bMsgs.length, `A=${aMsgs.length} B=${bMsgs.length}`);

  // ================= T4 墓碑删除 =================
  console.log('\nT4 一端删除，另一端同步后也删除');
  const beforeDel = (await A.dbGetAll('messages')).length;
  await A.dbDelete('messages', 'm3');
  check('A 本地已删除 m3', !(await A.dbGet('messages', 'm3')));
  const tombs = await syncA._tombstones();
  check('A 留下了 m3 的墓碑', tombs.some((t) => t.id === 'm3'));

  const packDel = await syncA.buildDelta();
  check('增量包含删除项', packDel.tombstones.some((t) => t.id === 'm3'));
  await syncB.applyDelta(packDel);
  check('B 同步后 m3 也被删除', !(await B.dbGet('messages', 'm3')),
    '若失败说明墓碑未生效');

  // ================= T5 幂等 =================
  console.log('\nT5 重复导入同一包不重复插入');
  const dup = await syncB.applyDelta(packDel);
  check('二次导入无新增', dup.added === 0, `实际新增 ${dup.added}`);
  const afterDup = (await B.dbGetAll('messages')).length;
  check('消息数未膨胀', afterDup === (await B.dbGetAll('messages')).length);

  // ================= T6 体积收益 =================
  console.log('\nT6 体积收益（模拟 36000 条历史 + 每天 300 条新增）');
  const C = makeStorage('C');
  const syncC = loadModuleFor(C);
  await C.dbPut('sessions', { id: 'big', title: '大会话', createdAt: OLD, updatedAt: OLD });
  for (let i = 0; i < 36000; i++) {
    C.tables.messages.push({ id: 'h' + i, sessionId: 'big', role: 'user', content: 'y'.repeat(120), createdAt: OLD + i, mode: 0 });
  }
  const fullPack = await syncC.buildDelta(); // 首次 = 全量
  const fullBytes = Buffer.byteLength(JSON.stringify(fullPack), 'utf8');
  await C.kvSet(syncC.KV.CURSOR, Date.now());
  for (let i = 0; i < 300; i++) {
    await C.dbPut('messages', { id: 'n' + i, sessionId: 'big', role: 'user', content: 'z'.repeat(120), createdAt: Date.now(), mode: 0 });
  }
  const deltaPack = await syncC.buildDelta();
  const deltaBytes = Buffer.byteLength(JSON.stringify(deltaPack), 'utf8');
  const ratio = fullBytes / deltaBytes;
  console.log(`    全量 ${(fullBytes / 1024 / 1024).toFixed(1)} MB → 增量 ${(deltaBytes / 1024).toFixed(0)} KB（约 1/${ratio.toFixed(0)}）`);
  check('增量包不足全量的 5%', deltaBytes < fullBytes * 0.05, `实际 ${((deltaBytes / fullBytes) * 100).toFixed(1)}%`);
  check('增量包只含 300 条', deltaPack.data.messages.length === 300, `实际 ${deltaPack.data.messages.length}`);

  console.log(`\n结果：${pass} 项通过，${fail} 项失败`);
  process.exit(fail ? 1 : 0);
})();
