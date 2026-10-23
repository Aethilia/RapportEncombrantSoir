const ROWS = 16;
const THIN = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

export const frDate = iso => iso.replaceAll('-', '/');

export async function buildWorkbook({ date, user, controls }) {
  const ExcelJS = window.ExcelJS;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Contrôle', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  ws.columns = [{ width: 10 }, { width: 30 }, { width: 8 }, { width: 38 }, { width: 30 }];

  try {
    const buf = await (await fetch('icons/logo.png')).arrayBuffer();
    const id = wb.addImage({ buffer: buf, extension: 'png' });
    ws.addImage(id, { tl: { col: 0.1, row: 0.2 }, ext: { width: 150, height: 56 } });
  } catch { /* logo indisponible : on continue sans */ }
  for (const r of [1, 2]) ws.getRow(r).height = 24;
  ws.getRow(3).height = 14;

  ws.mergeCells('A5:E5');
  const t = ws.getCell('A5');
  t.value = `CONTRÔLE ENCOMBRANTS SOIR DU ${frDate(date)}`;
  t.font = { bold: true, size: 12 };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(5).height = 24;

  ws.mergeCells('A6:E6');
  const r = ws.getCell('A6');
  r.value = `RESPONSABLE :   ${user}`;
  r.font = { bold: true };
  r.alignment = { horizontal: 'center', vertical: 'middle' };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
  ws.getRow(6).height = 22;
  for (const row of [5, 6]) for (let c = 1; c <= 5; c++) ws.getRow(row).getCell(c).border = BORDER;

  const head = ['Heure', 'Voies', 'N°', 'Constats', 'Observation / Action'];
  head.forEach((h, i) => {
    const c = ws.getRow(7).getCell(i + 1);
    c.value = h;
    c.font = { bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = BORDER;
  });

  const total = Math.max(ROWS, controls.length);
  for (let i = 0; i < total; i++) {
    const row = ws.getRow(8 + i);
    const c = controls[i];
    const vals = c ? [c.time.replace(':', 'h'), c.address, c.num || '', c.operation, c.conclusion] : ['', '', '', '', ''];
    vals.forEach((v, j) => {
      const cell = row.getCell(j + 1);
      cell.value = v;
      cell.border = BORDER;
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: j === 0 || j === 2 ? 'center' : 'left' };
    });
    row.height = 32;
  }

  const foot = 8 + total + 1;
  ws.mergeCells(`A${foot}:E${foot}`);
  ws.getCell(`A${foot}`).value = '4200-Descriptif tournées – Rév.0';
  ws.getCell(`A${foot}`).alignment = { horizontal: 'center' };
  ws.getCell(`A${foot}`).font = { size: 9 };
  return wb;
}

export async function buildFile(data) {
  const wb = await buildWorkbook(data);
  const buf = await wb.xlsx.writeBuffer();
  const name = `Controle_Encombrants_Soir_${data.date}.xlsx`;
  const file = new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { file, name };
}

// Téléchargement du fichier .xlsx (téléphone et ordinateur).
export function downloadFile({ file, name }) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
