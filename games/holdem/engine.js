(function(root){'use strict';
const R=typeof require==='function'?require('../shared/random.js'):root.GameRandom;
const clone=x=>structuredClone(x),names=['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];
function rank5(cards){const ranks=cards.map(c=>c%13+2).sort((a,b)=>b-a),groups=new Map();for(const v of ranks)groups.set(v,(groups.get(v)||0)+1);const g=[...groups].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);const unique=[...new Set(ranks)],flush=cards.every(c=>Math.floor(c/13)===Math.floor(cards[0]/13));let straight=0;if(unique.length===5){if(unique[0]-unique[4]===4)straight=unique[0];else if(unique.join()=== '14,5,4,3,2')straight=5;}
let a=flush&&straight?[8,straight]:g[0][1]===4?[7,g[0][0],g[1][0]]:g[0][1]===3&&g[1][1]===2?[6,g[0][0],g[1][0]]:flush?[5,...ranks]:straight?[4,straight]:g[0][1]===3?[3,g[0][0],...g.slice(1).map(x=>x[0])]:g[0][1]===2&&g[1][1]===2?[2,Math.max(g[0][0],g[1][0]),Math.min(g[0][0],g[1][0]),g[2][0]]:g[0][1]===2?[1,g[0][0],...g.slice(1).map(x=>x[0])]:[0,...ranks];while(a.length<6)a.push(0);return {score:a.reduce((s,v)=>s*15+v,0),type:a[0],name:names[a[0]]};}
function evaluate(cards){if(cards.length<5||cards.length>7||new Set(cards).size!==cards.length)throw Error('牌张无效');let best={score:-1};for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){const r=rank5([cards[a],cards[b],cards[c],cards[d],cards[e]]);if(r.score>best.score)best=r;}return best;}
const next=(s,i,test)=>{for(let k=1;k<=s.players.length;k++){const j=(i+k)%s.players.length;if(test(s.players[j],j))return j;}return -1;};
const eligible=p=>!p.folded&&!p.out&&p.chips>0;
function validate(s){if(!s||!Array.isArray(s.players)||s.players.length<2||s.players.length>4)throw Error('牌局数据无效');const cards=[...s.deck,...(s.burn||[]),...s.board,...s.players.flatMap(p=>p.hole)];if(cards.length!==52||new Set(cards).size!==52||cards.some(c=>!Number.isInteger(c)||c<0||c>51))throw Error('隐藏牌损坏：本手已停止，请重新开桌');if(s.players.some(p=>['chips','bet','total'].some(k=>!Number.isSafeInteger(p[k])||p[k]<0)||p.bet>p.total)||s.players.reduce((a,p)=>a+p.chips+p.total,0)!==s.bank)throw Error('筹码校验失败，停止结算');return true;}
function pay(p,n){n=Math.min(n,p.chips);p.chips-=n;p.bet+=n;p.total+=n;return n;}
function create(roster){if(roster.length<2||roster.length>4)throw Error('需要2至4名玩家');return start({players:roster.map(p=>({...p,chips:1000,bet:0,total:0,hole:[],out:false,folded:false})),bank:roster.length*1000,dealer:roster.length-1,hand:0,history:[],maxPot:0,portraits:{},phase:'handEnd',deck:[],board:[]});}
function start(original){const s=clone(original);if(s.phase!=='handEnd')throw Error('本手尚未结束');const live=s.players.filter(p=>p.chips>0);if(live.length<2){s.phase='end';s.actor=-1;return s;}s.dealer=next(s,s.dealer,p=>p.chips>0);s.hand++;s.handStart=s.players.map(p=>p.chips);s.privateIntents={};s.highlights??=[];s.phase='preflop';s.board=[];s.burn=[];s.deck=R.shuffle(Array.from({length:52},(_,i)=>i));s.pots=[];s.result=[];s.showdown=false;s.current=20;s.minRaise=20;
for(const p of s.players){p.out=p.chips===0;p.folded=p.out;p.hole=[];p.bet=0;p.total=0;p.acted=false;p.actedAt=0;}for(let k=0;k<2;k++)for(let n=1;n<=s.players.length;n++){const p=s.players[(s.dealer+n)%s.players.length];if(!p.out)p.hole.push(s.deck.pop());}
s.sb=live.length===2?s.dealer:next(s,s.dealer,p=>!p.out);s.bb=next(s,s.sb,p=>!p.out);pay(s.players[s.sb],10);pay(s.players[s.bb],20);s.current=s.players.filter(eligible).length>=2?20:Math.max(...s.players.map(p=>p.bet));s.actor=next(s,s.bb,eligible);s.history.push({hand:s.hand,type:'deal',dealer:s.dealer,sb:s.sb,bb:s.bb});advance(s,s.bb);validate(s);return s;}
function legal(s,index=s.actor){if(!['preflop','flop','turn','river'].includes(s.phase)||index!==s.actor)return null;const p=s.players[index],call=Math.min(p.chips,s.current-p.bet),canRaise=(!p.acted||s.current-p.actedAt>=s.minRaise)&&s.players.some((q,j)=>j!==index&&eligible(q));return {fold:true,check:call===0,call:call>0,callAmount:call,canRaise:canRaise&&p.bet+p.chips>s.current,minTo:s.current+s.minRaise,maxTo:p.bet+p.chips,allin:p.chips>0&&(p.bet+p.chips<=s.current||canRaise)};}
function settle(s){
const totals=s.players.map(p=>p.total).sort((a,b)=>b-a);if(totals[0]>totals[1]){const p=s.players.find(p=>p.total===totals[0]),refund=totals[0]-totals[1];p.total-=refund;p.bet=Math.min(p.bet,p.total);p.chips+=refund;s.history.push({hand:s.hand,type:'refund',player:s.players.indexOf(p),amount:refund});}
const levels=[...new Set(s.players.map(p=>p.total).filter(Boolean))].sort((a,b)=>a-b);let previous=0;const awards=Array(s.players.length).fill(0);s.pots=[];const contenders=s.players.filter(p=>!p.folded);s.showdown=contenders.length>1;
for(const level of levels){const amount=(level-previous)*s.players.filter(p=>p.total>=level).length;previous=level;const entries=s.players.map((p,i)=>({p,i})).filter(({p})=>!p.folded&&p.total>=level);if(!entries.length)throw Error('底池无人可领取，已停止');const ranks=entries.map(({p,i})=>({i,score:contenders.length===1?0:evaluate([...p.hole,...s.board]).score}));const best=Math.max(...ranks.map(r=>r.score));const winners=ranks.filter(r=>r.score===best).map(r=>r.i).sort((a,b)=>(a-s.dealer-1+s.players.length)%s.players.length-(b-s.dealer-1+s.players.length)%s.players.length);const base=Math.floor(amount/winners.length);winners.forEach((i,k)=>awards[i]+=base+(k<amount%winners.length?1:0));s.pots.push({amount,winners});}
const pot=s.players.reduce((a,p)=>a+p.total,0);if(awards.reduce((a,b)=>a+b,0)!==pot)throw Error('底池计算异常，停止结算');s.maxPot=Math.max(s.maxPot,pot);s.result=awards.map((amount,i)=>({player:i,amount,rank:s.showdown&&!s.players[i].folded?evaluate([...s.players[i].hole,...s.board]).name:null}));s.history.push({hand:s.hand,type:'settle',pot,result:s.result,balances:s.players.map((p,i)=>({player:i,before:s.handStart?.[i]??null,committed:p.total,received:awards[i],after:p.chips+awards[i],delta:s.handStart?.[i]===undefined?null:p.chips+awards[i]-s.handStart[i],folded:p.folded,rank:s.result[i].rank}))});s.players.forEach((p,i)=>{p.chips+=awards[i];p.total=0;p.bet=0;p.out=p.chips===0;});for(let i=0;i<s.players.length;i++){
 const delta=s.players[i].chips-(s.handStart?.[i]??1000);
 if(Math.abs(delta)>=500||(s.handStart?.[i]<=200&&delta>0))s.highlights.push({hand:s.hand,kind:s.handStart?.[i]<=200&&delta>0?'comeback':'swing',player:i,delta});
 if(s.privateIntents?.[i])s.highlights.push({hand:s.hand,kind:'disclosedBluff',player:i,success:awards[i]>0});
}s.highlights=s.highlights.slice(-30);s.phase=s.players.filter(p=>p.chips>0).length===1?'end':'handEnd';s.actor=-1;
}
function advance(s,from){
if(s.players.filter(p=>!p.folded).length===1){settle(s);return;}
const needs=p=>eligible(p)&&(!p.acted||p.bet<s.current);
// A sole player with chips cannot open a new side pot against all-in players.
const acting=s.players.filter(eligible);if(acting.length===1&&acting[0].bet>=s.current)acting[0].acted=true;
const actor=next(s,from,needs);if(actor!==-1){s.actor=actor;return;}
if(s.phase==='river'){settle(s);return;}
s.phase={preflop:'flop',flop:'turn',turn:'river'}[s.phase];const n=s.phase==='flop'?3:1;s.burn.push(s.deck.pop());for(let i=0;i<n;i++)s.board.push(s.deck.pop());for(const p of s.players){p.bet=0;p.acted=false;p.actedAt=0;}s.current=0;s.minRaise=20;
if(s.players.filter(eligible).length<2){for(const p of s.players)p.acted=true;advance(s,s.dealer);}else{s.actor=next(s,s.dealer,eligible);}
}
function act(original,index,type,to){validate(original);const s=clone(original),l=legal(s,index);if(!l)throw Error('尚未轮到该玩家');const p=s.players[index],old=s.current;
if(type==='fold')p.folded=true;
else if(type==='check'){if(!l.check)throw Error('当前不能过牌');}
else if(type==='call'){if(!l.call)throw Error('当前不能跟注');pay(p,l.callAmount);}
else if(['raise','bet','allin'].includes(type)){
const target=type==='allin'?l.maxTo:Number(to);if(!Number.isSafeInteger(target)||target<=p.bet||target>l.maxTo)throw Error('下注额无效');
if(target<=s.current){if(type!=='allin')throw Error('请使用跟注');pay(p,target-p.bet);}
else{if(!l.canRaise||(target<l.minTo&&target!==l.maxTo))throw Error('未达到最小加注，或短全押未重新开放加注');pay(p,target-p.bet);const delta=target-old;s.current=target;if(delta>=s.minRaise){s.minRaise=delta;for(const q of s.players)if(q!==p)q.acted=false;}}
}else throw Error('未知动作');
p.acted=true;p.actedAt=s.current;s.history.push({hand:s.hand,phase:s.phase,type,player:index,to:p.bet,amount:p.total-original.players[index].total,pot:s.players.reduce((a,p)=>a+p.total,0)});advance(s,index);validate(s);return s;
}
function publicState(s){return {hand:s.hand,phase:s.phase,dealer:s.dealer,sb:s.sb,bb:s.bb,board:s.board.slice(),actor:s.actor,pot:s.players.reduce((a,p)=>a+p.total,0),pots:s.pots,players:s.players.map((p,i)=>({id:p.id,name:p.name,chips:p.chips,bet:p.bet,total:p.total,folded:p.folded,out:p.out,...(s.showdown&&!p.folded?{revealed:p.hole.slice()}: {})})),result:s.result,maxPot:s.maxPot,history:s.history.slice(-24),highlights:s.highlights?.slice(-8)||[]};}
function viewFor(s,i){return {...publicState(s),seat:i,hole:s.players[i].hole.slice(),legal:legal(s,i)};}
function strategy(view,personality={},difficulty='normal'){
const l=view.legal;if(!l)throw Error('非法行动视图');const opponents=view.players.filter((p,i)=>i!==view.seat&&!p.folded&&!p.out).length,known=[...view.hole,...view.board],available=Array.from({length:52},(_,i)=>i).filter(c=>!known.includes(c));let won=0;const tries={easy:24,normal:64,hard:160}[difficulty]||64;
for(let n=0;n<tries;n++){const cards=R.shuffle(available),board=[...view.board];while(board.length<5)board.push(cards.pop());const ours=evaluate([...view.hole,...board]).score;let ties=1,lose=false;for(let j=0;j<opponents;j++){const r=evaluate([cards.pop(),cards.pop(),...board]).score;if(r>ours)lose=true;if(r===ours)ties++;}if(!lose)won+=1/ties;}
const equity=won/tries,odds=l.callAmount/(view.pot+l.callAmount||1),aggression=personality.aggression??.5,risk=personality.risk??.5,bluff=personality.bluff??.2,patience=personality.patience??.5,observation=personality.observation??.5,control=personality.control??.5;
const actions=view.history.filter(h=>Number.isInteger(h.player)&&h.player!==view.seat),foldRate=actions.filter(h=>h.type==='fold').length/(actions.length||1),position=(view.seat-view.dealer+view.players.length)%view.players.length/view.players.length;
const threshold=.55+(patience-.5)*.12-(risk-.5)*.1,edge=equity-odds,attempt=R.unit()<bluff*(.1+foldRate*observation)*(1-position*.2);
if(l.canRaise&&(equity>threshold||attempt)&&R.unit()<.35+aggression*.6){let target=Math.max(l.minTo,Math.floor(view.players[view.seat].bet+l.callAmount+view.pot*(.35+aggression*.65)));target=Math.min(l.maxTo,target);if(target>=l.minTo||target===l.maxTo)return {type:target===l.maxTo?'allin':'raise',to:target,equity,bluff:attempt&&equity<=threshold};}
if(l.check)return {type:'check',equity};if(edge<-.06-(risk*.12)-(1-control)*.04)return {type:'fold',equity};return {type:'call',equity};
}
const api={create,start,act,legal,validate,evaluate,rank5,publicState,viewFor,strategy,settle};root.Holdem=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
