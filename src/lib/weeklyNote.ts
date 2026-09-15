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
  const mondayDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = mondayDate.getDay() || 7;
  mondayDate.setDate(mondayDate.getDate() - weekday + 1);
  const sundayDate = new Date(mondayDate);
  sundayDate.setDate(sundayDate.getDate() + 6);
  const filename = `Week ${weekNumber} ${year}.md`;
  return {
    filename,
    monday: formatLocalDate(mondayDate),
    sunday: formatLocalDate(sundayDate),
    weekNumber,
    year,
    weeksFolderPath: 'Weeks',
    yearFolderPath: `Weeks/${year}`,
    path: `Weeks/${year}/${filename}`,
  };
}

export function applyWeeklyNoteTemplate(
  template: string,
  values: Pick<ReturnType<typeof getWeeklyNoteDetails>, 'monday' | 'sunday' | 'weekNumber' | 'year'>,
) {
  return template
    .replaceAll('$week', String(values.weekNumber))
    .replaceAll('$year', String(values.year))
    .replaceAll('$monday', values.monday)
    .replaceAll('$sunday', values.sunday);
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
