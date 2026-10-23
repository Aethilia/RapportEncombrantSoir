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

// `photos[i]` : photos ({ dataUrl, w, h }) du contrôle controls[i].
export async function buildWorkbook({ date, user, controls, type = 'enc', photos = [] }) {
  const ExcelJS = window.ExcelJS;
  const t = TYPES[type] ?? TYPES.enc;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Contrôle ${t.label}`, {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 7 }],
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });
  ws.columns = [{ width: 10 }, { width: 10 }, { width: 28 }, { width: 8 }, { width: 32 }, { width: 30 }];

  // Logo
  try {
    const buf = await (await fetch('icons/logo.png')).arrayBuffer();
    const id = wb.addImage({ buffer: buf, extension: 'png' });
    ws.addImage(id, { tl: { col: 0.1, row: 0.25 }, ext: { width: 165, height: 61 } });
  } catch { /* logo indisponible : on continue sans */ }
  [24, 24, 20, 8].forEach((h, i) => { ws.getRow(i + 1).height = h; });

  // Titre (bandeau)
  ws.mergeCells('A5:F5');
  const title = ws.getCell('A5');
  title.value = `CONTRÔLE ${t.title} SOIR DU ${frDate(date)}`;
  title.font = { name: FONT, bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  title.fill = fill(NAVY);
  ws.getRow(5).height = 36;

  // Responsable
  ws.mergeCells('A6:F6');
  const resp = ws.getCell('A6');
  resp.value = `RESPONSABLE :   ${user}`;
  resp.font = { name: FONT, bold: true, size: 12, color: { argb: NAVY } };
  resp.alignment = { horizontal: 'center', vertical: 'middle' };
  resp.fill = fill(PALE);
  ws.getRow(6).height = 28;
  for (const r of [5, 6]) for (let c = 1; c <= 6; c++) ws.getRow(r).getCell(c).border = BORDER;

  // En-têtes de colonnes
  ['N° contrôle', 'Heure', 'Voies', 'N°', 'Constats', 'Observation / Action'].forEach((h, i) => {
    const c = ws.getRow(7).getCell(i + 1);
    c.value = h;
    c.font = { name: FONT, bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = fill(BLUE);
    c.border = BORDER;
  });
  ws.getRow(7).height = 28;

  // Lignes de contrôle (au moins ROWS lignes, comme la fiche papier)
  const total = Math.max(ROWS, controls.length);
  for (let i = 0; i < total; i++) {
    const row = ws.getRow(8 + i);
    const c = controls[i];
    const vals = c ? [i + 1, c.time.replace(':', 'h'), c.address, c.num || '', c.operation, c.conclusion] : ['', '', '', '', '', ''];
    vals.forEach((v, j) => {
      const cell = row.getCell(j + 1);
      cell.value = v;
      const center = j <= 1 || j === 3;
      cell.font = { name: FONT, size: 12, bold: j <= 1 };
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: center ? 'center' : 'left', indent: center ? 0 : 1 };
      cell.border = BORDER;
      if (i % 2) cell.fill = fill(ZEBRA);
    });
    row.height = 32;
  }

  // Pied de fiche
  const foot = 8 + total + 1;
  ws.mergeCells(`A${foot}:F${foot}`);
  const f = ws.getCell(`A${foot}`);
  f.value = '4200-Descriptif tournées – Rév.0';
  f.font = { name: FONT, size: 9, italic: true, color: { argb: 'FF6A7788' } };
  f.alignment = { horizontal: 'center' };

  await addPhotoSection(wb, ws, controls, photos, foot + 2);
  return wb;
}

// Photos sous le tableau : deux par ligne, chacune légendée avec le numéro de son contrôle.
async function addPhotoSection(wb, ws, controls, photos, start) {
  const items = [];
  controls.forEach((c, i) => (photos[i] ?? []).forEach((p, k) => items.push({ n: i + 1, c, p, k, count: photos[i].length })));
  if (!items.length) return;

  ws.getRow(start - 2).addPageBreak(); // les photos commencent sur une nouvelle page à l'impression
  ws.mergeCells(`A${start}:F${start}`);
  const band = ws.getCell(`A${start}`);
  band.value = 'PHOTOS';
  band.font = { name: FONT, bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  band.alignment = { horizontal: 'center', vertical: 'middle' };
  band.fill = fill(NAVY);
  ws.getRow(start).height = 30;

  const BOX_W = 396, BOX_H = 290;
  let r = start + 1;
  for (let i = 0; i < items.length; i += 2) {
    const capRow = r, imgRow = r + 1;
    ws.getRow(capRow).height = 24;
    ws.getRow(imgRow).height = 222;
    for (const [side, it] of items.slice(i, i + 2).entries()) {
      const [from, to, col] = side ? ['E', 'F', 4] : ['A', 'D', 0];
      ws.mergeCells(`${from}${capRow}:${to}${capRow}`);
      const cap = ws.getCell(`${from}${capRow}`);
      const part = it.count > 1 ? ` (photo ${it.k + 1}/${it.count})` : '';
      cap.value = `Contrôle n° ${it.n} · ${it.c.time.replace(':', 'h')} · ${it.c.address}${part}`;
      cap.font = { name: FONT, bold: true, size: 11, color: { argb: NAVY } };
      cap.alignment = { vertical: 'middle', indent: 1, wrapText: true };
      cap.fill = fill(PALE);
      const k = Math.min(BOX_W / it.p.w, BOX_H / it.p.h);
      const buffer = await (await fetch(it.p.dataUrl)).arrayBuffer();
      const id = wb.addImage({ buffer, extension: 'jpeg' });
      ws.addImage(id, { tl: { col: col + 0.02, row: imgRow - 1 + 0.03 }, ext: { width: Math.round(it.p.w * k), height: Math.round(it.p.h * k) }, editAs: 'oneCell' });
    }
    if ((i / 2 + 1) % 3 === 0 && i + 2 < items.length) ws.getRow(imgRow).addPageBreak(); // 3 lignes de photos par page
    r += 2;
  }
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
