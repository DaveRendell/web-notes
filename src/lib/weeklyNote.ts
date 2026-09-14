export type IsoWeek = {
  weekNumber: number;
  year: number;
};

export function getIsoWeek(date: Date): IsoWeek {
  // Work from local calendar fields, then do the ISO calculation in UTC so
  // daylight-saving transitions cannot shift the result by a day.
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const year = day.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNumber = Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { weekNumber, year };
}

export function getWeeklyNoteDetails(date: Date) {
  const { weekNumber, year } = getIsoWeek(date);
  const filename = `Week ${weekNumber} ${year}.md`;
  return {
    filename,
    weekNumber,
    year,
    weeksFolderPath: 'Weeks',
    yearFolderPath: `Weeks/${year}`,
    path: `Weeks/${year}/${filename}`,
  };
}

export function applyWeeklyNoteTemplate(template: string, weekNumber: number, year: number) {
  return template
    .replaceAll('$week', String(weekNumber))
    .replaceAll('$year', String(year));
}
