(function(){
const copy=v=>JSON.parse(JSON.stringify(v)),empty=()=>({nodes:[],edges:[]});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,max)=>Math.max(0,Math.min(max,Number(v)||0));
window.prdFlowSVG=function(raw,selected){
 const f=raw||empty(),nodes=(f.nodes||[]).slice(0,200),edges=(f.edges||[]).slice(0,500);
 let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700" width="1200" height="700" role="img" aria-label="流程图"><defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10Z" fill="var(--flow-edge,#7183a4)"/></marker></defs>';
 for(const e of edges){const a=nodes.find(n=>n.id===e.from),b=nodes.find(n=>n.id===e.to);if(!a||!b)continue;
  const ax=num(a.x,1040)+80,ay=num(a.y,630)+35,bx=num(b.x,1040)+80,by=num(b.y,630)+35,dx=bx-ax,dy=by-ay;
  if(!dx&&!dy)continue;const t=Math.min(80/Math.abs(dx||0.001),35/Math.abs(dy||0.001));const sx=ax+dx*t,sy=ay+dy*t,tx=bx-dx*t,ty=by-dy*t;
  svg+='<g data-edge="'+esc(e.id)+'" style="cursor:pointer"><path d="M'+sx+' '+sy+' L'+tx+' '+ty+'" stroke="transparent" stroke-width="18"/><path d="M'+sx+' '+sy+' L'+tx+' '+ty+'" fill="none" stroke="'+(selected===e.id?'#409eff':'var(--flow-edge,#7183a4)')+'" stroke-width="2" marker-end="url(#flow-arrow)"/><text x="'+((sx+tx)/2)+'" y="'+((sy+ty)/2-8)+'" text-anchor="middle" font-size="13" fill="var(--flow-ink,#526483)">'+esc(e.label||'')+'</text></g>';
 }
 for(const n of nodes){const x=num(n.x,1040),y=num(n.y,630),stroke=selected===n.id?'#409eff':'#8ca6ce';
  svg+='<g data-node="'+esc(n.id)+'" transform="translate('+x+' '+y+')" style="cursor:move">';
  svg+=n.type==='decision'?'<polygon points="80,0 160,35 80,70 0,35" fill="var(--flow-decision,#fff8e8)" stroke="'+stroke+'" stroke-width="2"/>':'<rect width="160" height="70" rx="'+(n.type==='terminal'?35:8)+'" fill="var(--flow-node,#f3f7ff)" stroke="'+stroke+'" stroke-width="2"/>';
  const chars=Array.from(String(n.text||'节点')),lines=[];for(let i=0;i<Math.min(chars.length,30);i+=10)lines.push(chars.slice(i,i+10).join(''));
  svg+='<text text-anchor="middle" font-family="Segoe UI,Microsoft YaHei,sans-serif" font-size="13" fill="var(--flow-ink,#304564)" pointer-events="none">'+lines.map((s,i)=>'<tspan x="80" y="'+(35-(lines.length-1)*8+i*16)+'">'+esc(s)+'</tspan>').join('')+'</text></g>';
 }return svg+'</svg>';
};
Vue.component('prd-flow-editor',{
 props:['value','readonly'],data(){return {selected:'',connect:false,from:'',drag:null,local:copy(this.value||empty())};},
 watch:{value:{deep:true,handler(v){if(!this.drag)this.local=copy(v||empty());}}},
 computed:{svg(){return window.prdFlowSVG(this.local,this.readonly?'':this.selected);},item(){return this.local.nodes.find(n=>n.id===this.selected)||this.local.edges.find(e=>e.id===this.selected);}},
 template:`<div class="flow-editor"><template v-if="!readonly"><div class="flow-tools"><button type="button" @click="add('process')">＋流程节点</button><button type="button" @click="add('decision')">＋判断</button><button type="button" @click="add('terminal')">＋开始/结束</button><button type="button" :class="{active:connect}" @click="connect=!connect;from=''">{{connect?'退出连线':'连线'}}</button><button type="button" :disabled="!selected" @click="remove">删除选中</button></div><div class="flow-help">{{connect?(from?'再点击目标节点完成连线':'点击起点，再点击终点连线'):'拖动节点调整位置；点击节点或连线后修改文字。画布可横向滚动。'}}</div><div v-if="item" class="flow-label"><label>{{item.from?'连线文字':'节点文字'}} <input :value="item.from?item.label:item.text" maxlength="30" @input="label($event.target.value)"></label></div></template><div class="flow-canvas" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" v-html="svg"></div></div>`,
 methods:{emit(){this.$emit('input',copy(this.local));},
 add(type){if(this.local.nodes.length>=200)return;const i=this.local.nodes.length;const n={id:'n'+Date.now()+Math.random().toString(36).slice(2,6),type,text:type==='decision'?'判断条件':type==='terminal'?'开始/结束':'流程节点',x:30+(i%5)*220,y:30+(Math.floor(i/5)%6)*100};this.local.nodes.push(n);this.selected=n.id;this.emit();},
 label(value){if(this.item){this.$set(this.item,this.item.from?'label':'text',value);this.emit();}},
 remove(){this.local.nodes=this.local.nodes.filter(n=>n.id!==this.selected);this.local.edges=this.local.edges.filter(e=>e.id!==this.selected&&e.from!==this.selected&&e.to!==this.selected);this.selected='';this.from='';this.emit();},
 down(e){if(this.readonly)return;const node=e.target.closest('[data-node]'),edge=e.target.closest('[data-edge]');if(edge){this.selected=edge.dataset.edge;return;}if(!node){this.selected='';return;}const id=node.dataset.node;this.selected=id;
 if(this.connect){if(!this.from)this.from=id;else if(this.from!==id){if(!this.local.edges.some(x=>x.from===this.from&&x.to===id))this.local.edges.push({id:'e'+Date.now(),from:this.from,to:id,label:''});this.from='';this.emit();}return;}
 const n=this.local.nodes.find(n=>n.id===id);this.drag={id,x:e.clientX,y:e.clientY,nx:n.x,ny:n.y};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();},
 move(e){if(!this.drag)return;const n=this.local.nodes.find(n=>n.id===this.drag.id);n.x=num(this.drag.nx+e.clientX-this.drag.x,1040);n.y=num(this.drag.ny+e.clientY-this.drag.y,630);},
 up(){if(this.drag){this.drag=null;this.emit();}}
 }});
})();
