import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { RunnerSession } from '../types/session';
import { PersonalRecord } from './records';
import { getPerformanceColor, parseDate } from './vma';

export interface RunnerExportData {
  firstName: string;
  lastName: string;
  groupName: string | null;
  sessions: RunnerSession[];
  records: PersonalRecord[];
}

const fileBase = (d: RunnerExportData) =>
  `${d.firstName}_${d.lastName}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');

const fullDate = (iso: string) =>
  parseDate(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const longDate = (iso: string) =>
  parseDate(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const frNumber = (n: number) => String(n).replace('.', ',');

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const zoneLabel = (zoneName: string | null, zoneIndex: number) =>
  zoneName ?? (zoneIndex === -1 ? 'Sous zones' : 'Au-dessus');

const chronological = (sessions: RunnerSession[]) =>
  [...sessions].sort((a, b) => parseDate(a.created_at).getTime() - parseDate(b.created_at).getTime());

const recordKeySet = (records: PersonalRecord[]) => new Set(records.map((r) => `${r.sessionId}-${r.index}`));

// One row per race, ";" separated with BOM so Excel (FR) opens it with accents and columns
export const buildCsv = (d: RunnerExportData): string => {
  const recordKeys = recordKeySet(d.records);
  const header = [
    'Date', 'Prénom', 'Nom', 'Groupe', 'VMA (km/h)', 'Distance (m)', 'Temps',
    'Vitesse (km/h)', 'Allure (/km)', '% VMA', 'Zone', 'Record personnel',
  ];
  const rows = chronological(d.sessions).flatMap((s) =>
    s.performances.map((p, i) => [
      fullDate(s.created_at), d.firstName, d.lastName, d.groupName ?? '', frNumber(s.vma_value),
      frNumber(p.distance), p.time, frNumber(p.speed), p.pace, p.percentage,
      zoneLabel(p.zone_name, p.zone_index), recordKeys.has(`${s.id}-${i}`) ? 'Oui' : '',
    ])
  );
  return '\uFEFF' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
};

export const buildHtml = (d: RunnerExportData): string => {
  const recordKeys = recordKeySet(d.records);
  const sessions = chronological(d.sessions).reverse();
  const runs = sessions.flatMap((s) => s.performances);
  const totalDistance = runs.reduce((sum, p) => sum + p.distance, 0);
  const avgIntensity = runs.length ? Math.round(runs.reduce((sum, p) => sum + p.percentage, 0) / runs.length) : 0;
  const name = escapeHtml(`${d.firstName} ${d.lastName}`);

  const recordsRows = d.records
    .map(
      (r) => `<tr><td><b>${r.distance} m</b></td><td class="big">${escapeHtml(r.time)}</td><td>${frNumber(r.speed)} km/h</td><td>${fullDate(r.date)}</td></tr>`
    )
    .join('');

  const sessionsHtml = sessions
    .map((s) => {
      const avg = Math.round(s.performances.reduce((sum, p) => sum + p.percentage, 0) / s.performances.length);
      const rows = s.performances
        .map((p, i) => {
          const color = getPerformanceColor(p.zone_index);
          const record = recordKeys.has(`${s.id}-${i}`) ? '<span class="record">★ Record</span>' : '';
          return `<tr><td><b>${p.distance} m</b></td><td>${escapeHtml(p.time)}</td><td>${frNumber(p.speed)} km/h</td><td>${escapeHtml(p.pace)} /km</td><td><span class="pill" style="background:${color}">${p.percentage}%</span></td><td>${escapeHtml(zoneLabel(p.zone_name, p.zone_index))} ${record}</td></tr>`;
        })
        .join('');
      return `<div class="session"><div class="session-head"><span class="session-date">${longDate(s.created_at)}</span><span class="session-meta">VMA ${frNumber(s.vma_value)} km/h · moyenne ${avg}% VMA</span></div><table><thead><tr><th>Distance</th><th>Temps</th><th>Vitesse</th><th>Allure</th><th>% VMA</th><th>Zone</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    })
    .join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Fiche coureur – ${name}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #222; margin: 0; padding: 24px; font-size: 12px; }
  .header { background: #FF6B35; color: #fff; border-radius: 12px; padding: 20px 24px; }
  .header .label { font-size: 12px; opacity: .85; text-transform: uppercase; letter-spacing: 1px; }
  .header h1 { margin: 4px 0; font-size: 26px; }
  .header .sub { font-size: 13px; }
  .header .author { font-style: italic; font-size: 11px; margin-top: 8px; opacity: .9; }
  .stats { display: flex; gap: 10px; margin: 16px 0; }
  .stat { flex: 1; border: 1px solid #eee; border-radius: 10px; padding: 10px; text-align: center; }
  .stat .v { font-size: 18px; font-weight: bold; color: #FF6B35; }
  .stat .l { font-size: 10px; color: #888; margin-top: 2px; }
  h2 { font-size: 16px; margin: 20px 0 8px; border-bottom: 2px solid #FF6B35; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { text-align: left; font-size: 10px; color: #888; text-transform: uppercase; padding: 6px 8px; border-bottom: 1px solid #ddd; }
  td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; }
  td.big { font-size: 15px; font-weight: bold; }
  .records td { background: #FFFBEA; }
  .session { margin-bottom: 14px; page-break-inside: avoid; border: 1px solid #eee; border-radius: 10px; overflow: hidden; }
  .session-head { background: #f7f7f7; padding: 8px 10px; display: flex; justify-content: space-between; }
  .session-date { font-weight: bold; text-transform: capitalize; }
  .session-meta { color: #666; }
  .pill { color: #fff; font-weight: bold; border-radius: 6px; padding: 2px 6px; }
  .record { color: #B8860B; font-weight: bold; margin-left: 4px; }
  .footer { margin-top: 20px; text-align: center; color: #999; font-size: 10px; }
</style></head><body>
<div class="header">
  <div class="label">Fiche coureur</div>
  <h1>${name}</h1>
  <div class="sub">Groupe : ${d.groupName ? escapeHtml(d.groupName) : 'Sans groupe'}</div>
  <div class="author">Calculateur VMA – by M.DURAND</div>
</div>
<div class="stats">
  <div class="stat"><div class="v">${sessions.length}</div><div class="l">Séances</div></div>
  <div class="stat"><div class="v">${runs.length}</div><div class="l">Courses</div></div>
  <div class="stat"><div class="v">${frNumber(totalDistance)} m</div><div class="l">Distance totale</div></div>
  <div class="stat"><div class="v">${avgIntensity}%</div><div class="l">Intensité moyenne</div></div>
  <div class="stat"><div class="v">${sessions[0] ? frNumber(sessions[0].vma_value) : '-'}</div><div class="l">Dernière VMA (km/h)</div></div>
</div>
<h2>Records personnels</h2>
<table class="records"><thead><tr><th>Distance</th><th>Meilleur temps</th><th>Vitesse</th><th>Date</th></tr></thead><tbody>${recordsRows}</tbody></table>
<h2>Détail des séances</h2>
${sessionsHtml}
<div class="footer">Exporté le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
</body></html>`;
};

// Web preview only: trigger a browser download / print window
const webDownload = (content: string, filename: string, mime: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = globalThis.document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const webPrint = (html: string) => {
  const win = globalThis.open('', '_blank');
  if (!win) throw new Error('popup blocked');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
};

export const exportCsv = async (d: RunnerExportData) => {
  const csv = buildCsv(d);
  const filename = `Donnees_${fileBase(d)}.csv`;
  if (Platform.OS === 'web') {
    webDownload(csv, filename, 'text/csv;charset=utf-8');
    return;
  }
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(csv);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: `Données de ${d.firstName} ${d.lastName}`,
  });
};

export const exportPdf = async (d: RunnerExportData) => {
  const html = buildHtml(d);
  if (Platform.OS === 'web') {
    webPrint(html);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const target = new File(Paths.cache, `Fiche_${fileBase(d)}.pdf`);
  await new File(uri).move(target, { overwrite: true });
  await Sharing.shareAsync(target.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Fiche de ${d.firstName} ${d.lastName}`,
  });
};
