import {Action, Icon} from '../../ui/components.jsx';
import {desks, queueFor, quickAction} from './workdesk.mjs';
import './workdesk.css';

export function Workdesk({view, navigation, cards, period, company}) {
  const {actor, nav, locked} = view;
  const desk = Object.hasOwn(desks, actor.code) ? desks[actor.code] : null;
  if (!desk || !nav.length) return (
    <div className="page-head"><div><h1>Bàn làm việc</h1><p>Chọn vai trò để mở không gian làm việc.</p></div>
      <Action action="roles" style="primary" glyph="people">Chọn vai trò</Action>
    </div>
  );
  const queue = queueFor(view);
  const quick = quickAction(view);
  const primary = nav.includes(desk.primary) ? desk.primary : nav[0];
  const label = key => company && key === 'administration' ? 'Người dùng và phân quyền' : navigation[key][0];
  return <div className="workdesk">
    <header className="workdesk-header">
      <div>
        <p className="workdesk-context"><span>{actor.branchName}</span><span>Kỳ {period}</span>
          <span className={locked?'period-locked':'period-open'}>{locked?'Đã khóa':'Đang mở'}</span></p>
        <h1>{desk.title}</h1>
      </div>
      <div className="row-actions">
        <Action action={'go:' + primary} style={quick ? 'soft' : 'primary'} glyph={navigation[primary][1]}>{label(primary)}</Action>
        {quick && <Action action={quick.action} args={quick.args} style="primary" glyph={quick.glyph}>{quick.label}</Action>}
      </div>
    </header>
    {!!cards.length && <div className="workdesk-metrics" aria-label="Số liệu theo vai trò">
      {cards.filter(([, , route]) => nav.includes(route)).map(([caption, value, route]) => (
        <Action key={caption} action={'go:' + route} style="workdesk-metric">
          <span>{caption}</span><strong>{value}</strong>
        </Action>
      ))}
    </div>}
    <div className={'workdesk-body' + (queue.length ? '' : ' workdesk-single')}>
      {!!queue.length && <section className="workdesk-section"><h2>Việc cần xử lý</h2>
        <ul className="workdesk-queue">
          {[...queue].sort((a,b) => Number(Boolean(b.value)) - Number(Boolean(a.value))).map(item => (
            <li key={item.label}><Action action={item.action ?? (item.key ? 'focus:' : 'go:') + item.route}
              args={item.key ? {filter:item.key} : undefined} style="workdesk-task">
              <Icon name={navigation[item.route][1]} /><span>{item.label}</span>
              {item.blocked && <small>Chỉ xem</small>}
              <strong className={item.value ? 'workdesk-count pending' : 'workdesk-count'}>{item.value}</strong>
              <Icon name="chevron" />
            </Action></li>
          ))}
        </ul>
      </section>}
      <section className="workdesk-section"><h2>Phân hệ</h2>
        <ul className="workdesk-links">
          {nav.map(key => <li key={key}><Action action={'go:' + key} glyph={navigation[key][1]}>{label(key)}<Icon name="chevron" /></Action></li>)}
        </ul>
      </section>
    </div>
  </div>;
}
