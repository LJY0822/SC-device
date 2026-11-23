(function(root){'use strict';
const directions=[[1,0],[0,1],[1,1],[1,-1]],at=(b,x,y)=>x<0||y<0||x>=15||y>=15?-1:b[y*15+x];
function lineWin(board,index){const color=board[index];if(!color)return false;const x=index%15,y=Math.floor(index/15);return directions.some(([dx,dy])=>{let count=1;for(const sign of [-1,1])for(let n=1;n<15&&at(board,x+dx*n*sign,y+dy*n*sign)===color;n++)count++;return count>=5;});}
function create(human=1,difficulty='normal'){return {board:Array(225).fill(0),moves:[],turn:1,human,difficulty,winner:null,phase:'active',last:null,pattern:''};}
function play(original,index){if(original.phase!=='active'||!Number.isInteger(index)||index<0||index>=225||original.board[index])throw Error('不能在这里落子');const s=structuredClone(original);s.board[index]=s.turn;s.moves.push({index,color:s.turn});s.last=index;const a=assess(s.board,index,s.turn);s.pattern=a.label;if(lineWin(s.board,index)){s.winner=s.turn;s.phase='end';}else if(s.moves.length===225){s.winner=0;s.phase='end';}else s.turn=3-s.turn;return s;}
function validate(s){let replay=create(s.human,s.difficulty);if(!Array.isArray(s.moves)||s.moves.length>225)throw Error('棋谱损坏');for(const m of s.moves){if(replay.turn!==m.color)throw Error('棋谱轮次无效');replay=play(replay,m.index);}if(JSON.stringify(replay.board)!==JSON.stringify(s.board)||replay.turn!==s.turn||replay.winner!==s.winner||replay.phase!==s.phase)throw Error('棋盘与棋谱不一致');return true;}
function assess(b,index,color){const x=index%15,y=Math.floor(index/15);let score=0,threes=0,fours=0,label='活一';for(const [dx,dy]of directions){let text='';for(let j=-5;j<=5;j++){const v=j===0?color:at(b,x+j*dx,y+j*dy);text+=v===color?'1':v===0?'0':'2';}
if(/11111/.test(text)){score+=10000000;label='连五';}
else if(/011110/.test(text)){score+=500000;fours++;label='活四';}
else if(/01111|11110|11011|10111|11101/.test(text)){score+=50000;fours++;if(label!=='活四')label='冲四';}
else if(/01110|010110|011010/.test(text)){score+=5000;threes++;if(!fours)label='活三';}
else if(/001100|0010100|010010/.test(text)){score+=400;if(!fours&&!threes)label='活二';}
else score+=20;}
if(fours>=2){score+=900000;label='双四';}else if(threes>=2){score+=40000;label='双三';}return {score,label,threes,fours};}
function candidates(b){if(!b.some(Boolean))return [112];const set=new Set();for(let i=0;i<225;i++)if(b[i])for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=i%15+dx,y=Math.floor(i/15)+dy;if(at(b,x,y)===0)set.add(y*15+x);}return [...set];}
function choose(s,personality={},budget){if(s.phase!=='active')throw Error('棋局结束');const b=s.board.slice(),color=s.turn,opponent=3-color,possible=candidates(b),deadline=performance.now()+(budget??({easy:30,normal:120,hard:350}[s.difficulty]||120));
for(const c of [color,opponent]){const wins=[];for(const i of possible){b[i]=c;if(lineWin(b,i))wins.push(i);b[i]=0;}if(wins.length)return {index:wins[0],pattern:c===color?'连五':'必防冲四',depth:0};}
const ordered=(turn)=>candidates(b).map(index=>({index,score:assess(b,index,turn).score+assess(b,index,3-turn).score*1.12})).sort((a,c)=>c.score-a.score).slice(0,s.difficulty==='hard'?10:8);
let nodes=0;function search(depth,turn,alpha,beta){if((++nodes%16===0)&&performance.now()>deadline)throw Error('budget');const opts=ordered(turn);if(!depth||!opts.length)return (opts[0]?.score||0)*(turn===color?1:-1);let best=turn===color?-Infinity:Infinity;for(const {index}of opts){b[index]=turn;let v;if(lineWin(b,index))v=turn===color?1e9+depth:-1e9-depth;else v=search(depth-1,3-turn,alpha,beta);b[index]=0;if(turn===color){best=Math.max(best,v);alpha=Math.max(alpha,best);}else{best=Math.min(best,v);beta=Math.min(beta,best);}if(beta<=alpha)break;}return best;}
const opts=ordered(color);let selected=opts[0]?.index,completed=0;for(let depth=1;depth<=({easy:1,normal:2,hard:3}[s.difficulty]||2);depth++){let best=-Infinity,choice=selected;try{for(const opt of opts){b[opt.index]=color;const v=depth===1?opt.score:search(depth-1,opponent,-Infinity,Infinity);b[opt.index]=0;const tie=opt.score*((personality.aggression??.5)-.5)*.015;if(v+tie>best){best=v+tie;choice=opt.index;}}selected=choice;completed=depth;}catch{break;}}
if(!Number.isInteger(selected)||s.board[selected])selected=possible[0];return {index:selected,pattern:assess(s.board,selected,color).label,depth:completed};}
const api={create,play,validate,lineWin,assess,choose,candidates};root.Gomoku=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
