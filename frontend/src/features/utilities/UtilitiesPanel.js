import {esc, notice} from '../../ui/render.js';
import {icon} from '../../ui/icons.js';
import {searchUtilities, utilityGroups} from './utilityIndex.mjs';
import './utilities.css';

function utilityMarkup(groups) {
  if(!groups.length)return '<p class="utility-empty">Không tìm thấy tiện ích phù hợp.</p>';
  return groups.map(group=>'<section class="utility-group" aria-labelledby="utility-group-'+group.id+'">'+
    '<h3 id="utility-group-'+group.id+'">'+icon(group.icon)+esc(group.title)+'</h3><ul>'+
    group.items.map(item=>{
      const action=item.action??(item.filter?'focus:':'go:')+item.route;
      const args=item.filter?':'+encodeURIComponent(JSON.stringify({filter:item.filter})):'';
      return '<li><button type="button" class="utility-item" data-act="'+esc(action+args)+'">'+
        '<span class="utility-icon">'+icon(item.icon)+'</span><span><strong>'+esc(item.label)+'</strong>'+
        '<small>'+esc(item.detail)+'</small></span>'+icon('chevron')+'</button></li>';
    }).join('')+'</ul></section>').join('');
}

export function showUtilities({view, standalone, period, open, dialog}) {
  const groups=utilityGroups(view,{standalone});
  const context=[view.actor.name,view.actor.branchName??view.actor.branch,view.period?'Kỳ '+period:null].filter(Boolean).join(' · ');
  open('Tiện ích và thiết lập',
    '<p class="utility-context">'+esc(context)+'</p>'+
    (view.locked?notice('Kỳ đã khóa. Có thể mở màn hình để tra cứu.',true):'')+
    '<label class="field utility-search">Tìm tiện ích<input type="search" data-utility-query autocomplete="off" placeholder="Ví dụ: danh mục, công nợ"></label>'+
    '<p class="utility-result-count" data-utility-count role="status"></p>'+
    '<div class="utility-grid" data-utility-results></div>','utilities');
  const query=dialog.querySelector('[data-utility-query]');
  const results=dialog.querySelector('[data-utility-results]');
  const count=dialog.querySelector('[data-utility-count]');
  function update(){
    const matches=searchUtilities(groups,query.value);
    results.innerHTML=utilityMarkup(matches);
    count.textContent=query.value.trim()?matches.reduce((total,group)=>total+group.items.length,0)+' tiện ích phù hợp':'';
  }
  query.addEventListener('input',update);
  update();
  query.focus();
}
