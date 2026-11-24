import {icon} from './icons.js';

export const esc=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export const num=value=>({value:esc(value)});
export function btn(label,action,{glyph='',style='',disabled=false}={}){
  return '<button type="button" class="btn '+style+'" data-act="'+esc(action)+'"'+(disabled?' disabled':'')+'>'+ (glyph?icon(glyph):'')+esc(label)+'</button>';
}
export function link(label,action){return '<button type="button" class="text-btn" data-act="'+esc(action)+'">'+esc(label)+'</button>';}
export function section(title,body,actions='',subtitle=''){
  return '<section class="card"><div class="card-head"><div><h2>'+esc(title)+'</h2>'+(subtitle?'<p>'+esc(subtitle)+'</p>':'')+'</div>'+actions+'</div>'+body+'</section>';
}
export function heading(title,detail='',actions=''){
  return '<div class="page-head"><div><h1>'+esc(title)+'</h1>'+(detail?'<p>'+esc(detail)+'</p>':'')+'</div><div class="row-actions">'+actions+'</div></div>';
}
export function table(headers,items,empty='Chưa có bản ghi trong phạm vi này.'){
  return '<div class="table-wrap" tabindex="0"><table><thead><tr>'+headers.map(value=>'<th scope="col">'+esc(value)+'</th>').join('')+'</tr></thead><tbody>'+
    (items.length?items.map(values=>'<tr>'+values.map((cell,index)=>'<td data-label="'+esc(headers[index])+'"'+(typeof cell==='object'?' class="num"':'')+'>'+
      (typeof cell==='object'?cell.value:cell)+'</td>').join('')+'</tr>').join(''):
      '<tr><td colspan="'+headers.length+'" class="table-empty">'+esc(empty)+'</td></tr>')+'</tbody></table></div>';
}
export function metrics(values){
  return values.map(([label,value])=>'<div class="metric-line"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');
}
export function notice(text,warn=false){return '<div class="notice'+(warn?' warn':'')+'">'+esc(text)+'</div>';}
export function operate(label,action,args={},options={}){
  const suffix=Object.keys(args).length?':'+encodeURIComponent(JSON.stringify(args)):'';
  return btn(label,action+suffix,options);
}
