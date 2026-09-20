import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { listGoogleCalendarEvents, listGoogleCalendars, type GoogleCalendarListEntry } from '../web/src/lib/googleCalendar';
import type { CalendarWidgetConfig } from '../web/src/lib/calendarWidget';

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
] as const;

GoogleSignin.configure({ scopes: [...CALENDAR_SCOPES], offlineAccess: false });

export async function restoreCalendarConnection(): Promise<boolean> {
  if (!GoogleSignin.hasPreviousSignIn()) return false;
  const result = await GoogleSignin.signInSilently();
  return result.type === 'success' && CALENDAR_SCOPES.every((scope) => result.data.scopes.includes(scope));
}

export async function connectGoogleCalendar(): Promise<GoogleCalendarListEntry[]> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const signIn = await GoogleSignin.signIn();
  if (signIn.type === 'cancelled') throw new Error('Google Calendar connection was cancelled.');
  if (!CALENDAR_SCOPES.every((scope) => signIn.data.scopes.includes(scope))) {
    const authorization = await GoogleSignin.addScopes({ scopes: [...CALENDAR_SCOPES] });
    if (authorization?.type === 'cancelled') throw new Error('Google Calendar permission was not granted.');
  }
  return listGoogleCalendars(await accessToken());
}

export async function loadGoogleCalendars() {
  return listGoogleCalendars(await accessToken());
}

export async function loadGoogleCalendarEvents(config: CalendarWidgetConfig) {
  const token = await accessToken();
  const calendars = await listGoogleCalendars(token);
  return listGoogleCalendarEvents(token, config, calendars);
}

export async function disconnectGoogleCalendar() {
  await GoogleSignin.signOut();
}

async function accessToken() {
  let current = GoogleSignin.getCurrentUser();
  if (!current && GoogleSignin.hasPreviousSignIn()) {
    const restored = await GoogleSignin.signInSilently();
    current = restored.type === 'success' ? restored.data : null;
  }
  if (!current) throw new Error('Connect Google Calendar to display events.');
  if (!CALENDAR_SCOPES.every((scope) => current?.scopes.includes(scope))) {
    throw new Error('Reconnect Google Calendar to grant calendar access.');
  }
  return (await GoogleSignin.getTokens()).accessToken;
}

