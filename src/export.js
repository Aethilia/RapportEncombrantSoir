import { TYPES } from './store.js';

const ROWS = 16;
const NAVY = 'FF003A6E';
const BLUE = 'FF004F94';
const PALE = 'FFE6EEF7';
const ZEBRA = 'FFF3F6FA';
const GRID = { style: 'thin', color: { argb: 'FFB8C4D6' } };
const BORDER = { top: GRID, left: GRID, bottom: GRID, right: GRID };
const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const FONT = 'Calibri';

export const frDate = iso => iso.replaceAll('-', '/');

export async function buildWorkbook({ date, user, controls, type = 'enc' }) {
  const ExcelJS = window.ExcelJS;
  const t = TYPES[type] ?? TYPES.enc;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Contrôle ${t.label}`, {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 7 }],
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true, printTitlesRow: '7:7',
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });
  ws.columns = [{ width: 11 }, { width: 30 }, { width: 8 }, { width: 36 }, { width: 32 }];

  // Logo
  try {
    const buf = await (await fetch('icons/logo.png')).arrayBuffer();
    const id = wb.addImage({ buffer: buf, extension: 'png' });
    ws.addImage(id, { tl: { col: 0.1, row: 0.25 }, ext: { width: 165, height: 61 } });
  } catch { /* logo indisponible : on continue sans */ }
  [24, 24, 20, 8].forEach((h, i) => { ws.getRow(i + 1).height = h; });

  // Titre (bandeau)
  ws.mergeCells('A5:E5');
  const title = ws.getCell('A5');
  title.value = `CONTRÔLE ${t.title} SOIR DU ${frDate(date)}`;
  title.font = { name: FONT, bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  title.fill = fill(NAVY);
  ws.getRow(5).height = 36;

  // Responsable
  ws.mergeCells('A6:E6');
  const resp = ws.getCell('A6');
  resp.value = `RESPONSABLE :   ${user}`;
  resp.font = { name: FONT, bold: true, size: 12, color: { argb: NAVY } };
  resp.alignment = { horizontal: 'center', vertical: 'middle' };
  resp.fill = fill(PALE);
  ws.getRow(6).height = 28;
  for (const r of [5, 6]) for (let c = 1; c <= 5; c++) ws.getRow(r).getCell(c).border = BORDER;

  // En-têtes de colonnes
  ['Heure', 'Voies', 'N°', 'Constats', 'Observation / Action'].forEach((h, i) => {
    const c = ws.getRow(7).getCell(i + 1);
    c.value = h;
    c.font = { name: FONT, bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = fill(BLUE);
    c.border = BORDER;
  });
  ws.getRow(7).height = 28;

  // Lignes de contrôle (au moins ROWS lignes, comme la fiche papier)
  const total = Math.max(ROWS, controls.length);
  for (let i = 0; i < total; i++) {
    const row = ws.getRow(8 + i);
    const c = controls[i];
    const vals = c ? [c.time.replace(':', 'h'), c.address, c.num || '', c.operation, c.conclusion] : ['', '', '', '', ''];
    vals.forEach((v, j) => {
      const cell = row.getCell(j + 1);
      cell.value = v;
      cell.font = { name: FONT, size: 12, bold: j === 0 };
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: j === 0 || j === 2 ? 'center' : 'left', indent: j === 0 || j === 2 ? 0 : 1 };
      cell.border = BORDER;
      if (i % 2) cell.fill = fill(ZEBRA);
    });
    row.height = 32;
  }

  // Pied de fiche
  const foot = 8 + total + 1;
  ws.mergeCells(`A${foot}:E${foot}`);
  const f = ws.getCell(`A${foot}`);
  f.value = '4200-Descriptif tournées – Rév.0';
  f.font = { name: FONT, size: 9, italic: true, color: { argb: 'FF6A7788' } };
  f.alignment = { horizontal: 'center' };
  return wb;
}

export async function buildFile(data) {
  const wb = await buildWorkbook(data);
  const buf = await wb.xlsx.writeBuffer();
  const name = `Controle_${(TYPES[data.type] ?? TYPES.enc).file}_Soir_${data.date}.xlsx`;
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
