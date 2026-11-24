import {Action, Icon} from '../ui/components.jsx';

export function Brand() {
  return <div className="brand"><img src="/assets/mark.svg" alt="" /><strong>Ledo</strong></div>;
}

export function Sidebar({actor, company, organization, page, groups, period}) {
  return (
    <>
      <Brand />
      <button type="button" className="tenant" data-act="workspace-picker" aria-label={organization + " · Chọn đơn vị"} title="Chọn đơn vị">
        <span className="initial">{organization.slice(0, 2).toLocaleUpperCase('vi')}</span>
        <span className="tenant-name min-w-0">
          <b>{organization}</b><small>{actor.branch} · {period}</small>
        </span>
        <Icon name="down" />
      </button>
      <nav aria-label="Điều hướng">
        {groups.map(([name, routes]) => (
          <section className="nav-group" key={name}>
            <p className="nav-label">{name}</p>
            {routes.map(([key, label, icon]) => (
              <button key={key} type="button" className="nav-item" data-act={'go:' + key}
                aria-label={label} title={label} aria-current={page === key ? 'page' : undefined}>
                <Icon name={icon} /><span>{label}</span>
              </button>
            ))}
          </section>
        ))}
      </nav>
      <div className="side-bottom"><Icon name="info" /><span>{company ? 'Không gian đơn vị' : 'Bản thực hành · An Phát'}</span></div>
    </>
  );
}

export function TopBar({actor, company, organization, pageLabel, mobileOpen, compact, standalone}) {
  return (
    <>
      <div className="top-left">
        <Action action="menu" style="icon-only mobile-toggle" glyph="menu"
          aria-label="Mở menu" aria-controls="side" aria-expanded={mobileOpen} />
        <Action action="sidebar-size" style="icon-only quiet sidebar-toggle" glyph="menu" title={compact?'Mở rộng thanh bên':'Thu gọn thanh bên'}
          aria-label={compact?'Mở rộng thanh bên':'Thu gọn thanh bên'} aria-controls="side" aria-expanded={!compact} />
        <div className="breadcrumb"><span>{organization}</span><Icon name="chevron" /><b>{pageLabel}</b></div>
      </div>
      <div className="top-actions shrink-0">
        {standalone && <Action action="auth-logout" style="quiet desktop-logout">Đăng xuất</Action>}
        <Action action="search" style="quiet search-button" glyph="search" aria-label="Tìm">Tìm</Action>
        <Action action="refresh" style="quiet refresh-button" glyph="history">Làm mới</Action>
        <Action action="utilities" style="quiet utilities-toggle" glyph="settings" aria-label="Tiện ích và thiết lập" aria-haspopup="dialog">
          <span>Tiện ích</span>
        </Action>
        <button type="button" className="actor-button" data-act="roles" aria-label={'Vai trò hiện tại: ' + actor.name} aria-haspopup="dialog">
          <span className="initial">{actor.initial}</span>
          <span className="actor-label">
            <b>{actor.name}</b>
          </span>
          <Icon name="down" />
        </button>
      </div>
    </>
  );
}
