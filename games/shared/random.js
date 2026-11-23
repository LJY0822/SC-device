(function(root){'use strict';
const Random={int(n){if(!Number.isSafeInteger(n)||n<1||n>4294967296)throw Error('随机范围无效');const a=new Uint32Array(1),limit=4294967296-4294967296%n;do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%n;},unit(){return this.int(16777216)/16777216;},shuffle(values){const a=values.slice();for(let i=a.length-1;i>0;i--){const j=this.int(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}};
root.GameRandom=Random;if(typeof module!=='undefined')module.exports=Random;
})(globalThis);
