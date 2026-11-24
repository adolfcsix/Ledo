import {RoleMatrix} from './RoleMatrix.jsx';
import {useState} from 'react';
import {Action, Card, DataTable} from '../../ui/components.jsx';

const views = [['members', 'Người dùng'], ['roles', 'Vai trò'], ['history', 'Nhật ký']];
const states = [
  ['all', 'Tất cả trạng thái'],
  ['active', 'Hoạt động'],
  ['pending', 'Chờ kích hoạt'],
  ['suspended', 'Đã ngừng'],
  ['expired', 'Hết quyền'],
  ['invite-expired', 'Mã hết hạn'],
  ['expiring', 'Sắp hết quyền']
];
const labels = Object.fromEntries(states);
const dateFormat = new Intl.DateTimeFormat('vi-VN', {dateStyle:'short', timeZone:'Asia/Ho_Chi_Minh'});
const timeFormat = new Intl.DateTimeFormat('vi-VN', {dateStyle:'short', timeStyle:'short', timeZone:'Asia/Ho_Chi_Minh'});
const day = 86_400_000;
const searchable = value => value.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd');

function getStatus(row, now) {
  if (row.status === 'suspended') return 'suspended';
  if (row.valid_until != null && row.valid_until <= now) return 'expired';
  if (row.status === 'pending') return row.invite_until != null && row.invite_until <= now ? 'invite-expired' : 'pending';
  return 'active';
}

function MemberActions({row}) {
  if (row.owner) return '—';
  const args = {id:row.id};
  const canReissue = row.status === 'pending' || (row.status === 'suspended' && row.invite_until === null && !row.activated);
  return (
    <div className="row-actions">
      <Action action="account-form:update" args={args} style="soft">Sửa quyền</Action>
      {canReissue && <Action action="account-form:reissue" args={args}>Cấp mã mới</Action>}
      {(row.status !== 'suspended' || row.activated) && (
        <Action action="account-form:status" args={args}>{row.status === 'suspended' ? 'Mở lại' : 'Ngừng'}</Action>
      )}
    </div>
  );
}

function Status({status}) {
  const tone = status === 'active' ? '' : status === 'suspended' ? 'neutral' : 'wait';
  return <span className={'chip ' + tone}>{labels[status]}</span>;
}

export function AccountDirectory({organization, team, roleOptions, navigation, error, initialSection}) {
  const [current, setCurrent] = useState(initialSection ?? 'members');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const now = Date.now();
  const members = (team?.members ?? []).map(row => ({row, status:getStatus(row, now)}));
  const active = members.filter(item => item.status === 'active').length;
  const pending = members.filter(item => item.status === 'pending' || item.status === 'invite-expired').length;
  const term = searchable(query.trim());
  const visible = members.filter(item => {
    const {row} = item;
    const matches = status === 'all' || item.status === status ||
      (status === 'expiring' && item.status === 'active' && row.valid_until != null && row.valid_until - now <= 7 * day);
    return matches && searchable(row.display_name + ' ' + row.email).includes(term);
  });
  const roleNames = Object.fromEntries(roleOptions.map(item => [item.code, item.name]));

  return (
    <>
      <div className="page-head">
        <div><h1>Người dùng và phân quyền</h1><p>{organization}</p></div>
        {team && <Action action="account-form:invite" style="primary" glyph="plus">Thêm người dùng</Action>}
      </div>
      {error ? (
        <div className="stack">
          <p className="notice" role="alert">{error}</p>
          <div className="row-actions">
            <Action action="refresh" style="primary">Thử lại</Action>
            <Action action="workspace-picker">Chọn đơn vị</Action>
          </div>
        </div>
      ) : team ? (
        <div className="grid gap-4">
          <div className="account-summary mb-0!" aria-label="Tổng quan tài khoản">
            <span><strong>{members.length}</strong> tài khoản</span>
            <span><strong>{active}</strong> hoạt động</span>
            <span><strong>{pending}</strong> chưa kích hoạt</span>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quản lý tài khoản">
            {views.map(([value, label]) => (
              <button key={value} type="button" className={'btn ' + (current === value ? 'primary' : 'soft')}
                aria-pressed={current === value} onClick={() => setCurrent(value)}>{label}</button>
            ))}
          </div>
          {current === 'members' && (
            <Card title="Danh sách tài khoản">
              <div className="padded grid gap-3 sm:grid-cols-2">
                <label className="field">Tìm theo tên hoặc email
                  <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tên hoặc email" />
                </label>
                <label className="field">Trạng thái
                  <select value={status} onChange={event => setStatus(event.target.value)}>
                    {states.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
                  </select>
                </label>
                {(query || status !== 'all') && <p className="subtle m-0" aria-live="polite">Hiển thị {visible.length}/{members.length} tài khoản</p>}
              </div>
              <DataTable columns={['Người dùng', 'Vai trò', 'Chi nhánh', 'Hết quyền', 'Trạng thái', 'Thao tác']}
                empty="Không có tài khoản phù hợp." rows={visible.map(({row, status}) => ({
                  key:row.id,
                  cells:[
                    <span className="min-w-0 break-words"><strong>{row.display_name}</strong><small className="cell-note">{row.email}</small></span>,
                    row.owner ? 'Chủ đơn vị · Quản trị, kế toán' : row.roles.map(code => roleNames[code] ?? code).join(', '),
                    row.branch, row.valid_until == null ? '—' : dateFormat.format(row.valid_until),
                    <Status status={status} />, <MemberActions row={row} />
                  ]
                }))} />
            </Card>
          )}
          {current === 'roles' && <RoleMatrix roles={roleOptions} navigation={navigation} />}
          {current === 'history' && (
            <Card title="Nhật ký cấp quyền">
              <DataTable columns={['Thời điểm', 'Người thực hiện', 'Thao tác']}
                rows={team.history.map((row, index) => ({
                  key:row.id ?? index, cells:[timeFormat.format(row.created_at), row.actor_name, row.action]
                }))} empty="Chưa có sự kiện cấp quyền." />
            </Card>
          )}
        </div>
      ) : <p className="padded subtle" role="status">Đang tải danh sách người dùng…</p>}
    </>
  );
}
