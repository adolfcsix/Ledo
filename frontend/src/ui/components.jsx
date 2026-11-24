import {iconPath} from './icons.js';

export function Icon({name}) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d={iconPath(name)} />
    </svg>
  );
}

export function Action({action, args, glyph, style = '', children, ...props}) {
  const key = args ? action + ':' + encodeURIComponent(JSON.stringify(args)) : action;
  return (
    <button type="button" className={'btn ' + style} data-act={key} {...props}>
      {glyph && <Icon name={glyph} />}
      {children}
    </button>
  );
}

export function Card({title, children}) {
  return <section className="card"><div className="card-head"><h2>{title}</h2></div>{children}</section>;
}

export function DataTable({columns, rows, empty}) {
  return (
    <div className="table-wrap" tabIndex={0}>
      <table>
        <thead><tr>{columns.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>
          {rows.map(({key, cells}) => (
            <tr key={key}>
              {cells.map((value, index) => <td key={columns[index]} data-label={columns[index]}>{value}</td>)}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={columns.length} className="table-empty">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
