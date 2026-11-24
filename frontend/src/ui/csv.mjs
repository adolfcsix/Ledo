function csvText(value){
  const text=String(value??'');
  const safe=/^(?:[\s\uFEFF]*[=+\-@]|[\t\r\n])/.test(text)?"'"+text:text;
  return '"'+safe.replaceAll('"','""')+'"';
}
export function csvDocument(header,rows){
  return '\uFEFF'+[header,...rows].map(row=>row.map(cell=>typeof cell==='number'?cell:csvText(cell)).join(',')).join('\r\n');
}

export function downloadCsv(filename,content){
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=filename;
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
