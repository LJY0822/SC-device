const {test}=require('node:test'),assert=require('node:assert/strict');
const H=require('../games/holdem/engine'),G=require('../games/gomoku/engine'),M=require('../games/mastermind/engine'),N=require('../games/miner/engine');
const card=(r,s=0)=>s*13+r-2;
const roster=n=>Array.from({length:n},(_,i)=>({id:'p'+i,name:'P'+i}));
test('every game entry, engine, worker and prompt is included in the atomic offline cache',()=>{const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..'),s=fs.readFileSync(path.join(root,'sw.js'),'utf8'),files=JSON.parse(s.match(/const FILES=(\[[^;]+\]);/)[1]);for(const file of ['games/recreation/index.html','games/recreation/ui.js','games/shared/ui.css','games/shared/framework.js','games/shared/random.js','games/shared/solver-worker.js','games/holdem/engine.js','games/gomoku/engine.js','games/mastermind/engine.js','games/miner/engine.js','scripts/sc-recreation.js','prompts/game-prompts.json']){assert.ok(files.includes(file),file+' not precached');assert.ok(fs.existsSync(path.join(root,file)));}});
test('holdem evaluator: all nine categories, wheel, seven-card best and ties',()=>{
 const hands=[[[14,0],[11,1],[9,2],[6,3],[3,0]],[[14,0],[14,1],[9,2],[6,3],[3,0]],[[14,0],[14,1],[9,2],[9,3],[3,0]],[[14,0],[14,1],[14,2],[6,3],[3,0]],[[2,0],[3,1],[4,2],[5,3],[6,0]],[[2,0],[5,0],[8,0],[10,0],[14,0]],[[14,0],[14,1],[14,2],[6,3],[6,0]],[[14,0],[14,1],[14,2],[14,3],[3,0]],[[10,0],[11,0],[12,0],[13,0],[14,0]]];hands.forEach((hand,i)=>assert.equal(H.evaluate(hand.map(([r,s])=>card(r,s))).type,i));assert.equal(H.evaluate([14,2,3,4,5].map((r,i)=>card(r,i%4))).name,'顺子');assert.equal(H.evaluate([2,5,8,10,14,3,9].map(r=>card(r))).type,5);
});
function settlement(totals,holes,board,folded=[]){let s=H.create(roster(holes.length));s.board=board;s.players.forEach((p,i)=>{p.hole=holes[i];p.total=totals[i];p.bet=totals[i];p.chips=1000-totals[i];p.folded=folded.includes(i);});s.deck=Array.from({length:52},(_,i)=>i).filter(c=>![...board,...holes.flat()].includes(c));H.settle(s);H.validate(s);return s;}
test('holdem side pots, unequal contributions, refunds and deterministic odd chips',()=>{
 const b=[card(2),card(3,1),card(7,2),card(9,3),card(11)];const holes=[[card(14),card(14,1)],[card(13),card(13,1)],[card(12),card(12,1)]];let s=settlement([100,300,300],holes,b);assert.deepEqual(s.result.map(r=>r.amount),[300,400,0]);assert.equal(s.players.reduce((a,p)=>a+p.chips,0),3000);
 s=settlement([500,100,100],holes,b);assert.equal(s.history.findLast(h=>h.type==='refund').amount,400);assert.equal(s.pots[0].amount,300);
 const royal=[10,11,12,13,14].map(r=>card(r,3));s=settlement([5,5,5],[[card(2),card(3)],[card(4),card(5)],[card(6),card(7)]],royal,[2]);assert.equal(s.result[0].amount+s.result[1].amount,15);assert.equal(Math.abs(s.result[0].amount-s.result[1].amount),1);
});
test('holdem short all-in does not reopen a full raise; cumulative short raises do',()=>{
 let s=H.create(roster(4));s.phase='preflop';s.current=100;s.minRaise=100;s.actor=1;s.players.forEach((p,i)=>{p.bet=100;p.total=100;p.chips=[900,50,100,900][i];p.acted=i===0;p.actedAt=i===0?100:0;});s.bank=s.players.reduce((a,p)=>a+p.chips+p.total,0);
 s=H.act(s,1,'allin');assert.equal(H.legal({...s,actor:0},0).canRaise,false);s=H.act(s,2,'allin');s=H.act(s,3,'call');assert.equal(s.actor,0);assert.equal(H.legal(s).canRaise,true);const before=JSON.stringify(s);assert.throws(()=>H.act(s,0,'raise',250));assert.equal(JSON.stringify(s),before);s=H.act(s,0,'raise',300);H.validate(s);
});
test('holdem 2–4 players complete repeated hands; chip conservation and private projections',()=>{
 for(let count=2;count<=4;count++){let s=H.create(roster(count));assert.equal('deck' in H.viewFor(s,1),false);assert.equal(H.publicState(s).players.some(p=>'hole'in p),false);for(let hand=0;hand<8&&s.phase!=='end';hand++){let actions=0;while(!['handEnd','end'].includes(s.phase)){assert.ok(actions++<100);const l=H.legal(s);s=H.act(s,s.actor,l.check?'check':'call');}H.validate(s);assert.equal(s.players.reduce((a,p)=>a+p.chips,0),count*1000);if(s.phase==='handEnd')s=H.start(s);}}
});
test('gomoku five-plus win, forbidden duplicates, replay validation and forced wins/blocks',()=>{
 let s=G.create();for(const i of [0,15,1,16,2,17,3,18,4])s=G.play(s,i);assert.equal(s.winner,1);assert.throws(()=>G.play(s,100));G.validate(s);s=G.create();s=G.play(s,112);assert.throws(()=>G.play(s,112));assert.throws(()=>G.validate({...s,board:Array(225).fill(0)}));
 let b=G.create();b.board[110]=b.board[111]=b.board[112]=b.board[113]=2;b.turn=1;assert.ok([109,114].includes(G.choose(b,{},20).index));b.turn=2;assert.ok([109,114].includes(G.choose(b,{},20).index));
 const line=Array(225).fill(0);for(let i=0;i<6;i++)line[i]=1;assert.ok(G.lineWin(line,5));
});
test('mastermind repeated-color feedback, configuration, hidden answer and user feedback',()=>{
 assert.deepEqual(M.feedback([0,0,1,1],[0,1,0,0]),{black:1,white:2});assert.throws(()=>M.config({length:5,colors:4,repeat:false}));let s=M.create({},'make',[0,1,2,3]);s.pending=[0,0,1,1];assert.equal('private' in M.publicState(s),false);assert.equal('answer' in M.publicState(s),false);const before=JSON.stringify(s);assert.throws(()=>M.guess(s,s.pending,{black:4,white:0}));assert.equal(JSON.stringify(s),before);s=M.guess(s,s.pending,M.feedback(s.private.secret,s.pending));M.validate(s);assert.throws(()=>M.guess(s,[0,0,1,1]));
});
test('mastermind bounded minimax solves from public feedback alone',()=>{
 for(const secret of [[0,0,0,0],[0,1,2,3],[5,4,3,2],[1,1,4,4],[5,5,5,0]]){let s=M.create({},'make',secret),prev=1297;while(s.phase==='active'){const r=M.solve(s.config,s.history);assert.ok(r.remaining<prev);prev=r.remaining;s.pending=r.code;s=M.guess(s,r.code,M.feedback(secret,r.code));}assert.equal(s.success,true);assert.deepEqual(M.publicState(s).answer,secret);}
});
test('miner equal layouts, fixed-step determinism, no background/end ticking and weighted return',()=>{
 const a=N.create({duration:30}),b=structuredClone(a);assert.deepEqual(a.players[0].items,a.players[1].items);for(let i=0;i<600;i++){N.step(a);N.step(b);}assert.deepEqual(a,b);assert.throws(()=>N.step(a,.05));N.validate(a);const corrupt=structuredClone(a);corrupt.players[0].items[0].x='invalid-geometry';assert.throws(()=>N.validate(corrupt));
 const s=N.create();s.players[0].items=[{id:0,type:'small',...N.types.small,x:150,y:100,taken:false}];assert.ok(N.fire(s,0));for(let i=0;i<500&&s.players[0].score===0;i++)N.step(s);assert.equal(s.players[0].score,100);assert.deepEqual(s.players[0].collected,['small']);N.validate(s);s.phase='end';const before=JSON.stringify(s);N.step(s);assert.equal(JSON.stringify(s),before);
});
