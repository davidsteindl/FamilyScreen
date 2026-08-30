import { z } from "zod";

export type Location = {
  name: string;
  latitude: number;
  longitude: number;
};

export const OTTENSCHLAG: Location = {
  name: "Ottenschlag",
  latitude: 48.606,
  longitude: 15.035,
};

export const WIEN: Location = {
  name: "Wien",
  latitude: 48.21,
  longitude: 16.37,
};

const REVALIDATE_SECONDS = 900;
const REQUEST_TIMEOUT_MS = 2_500;

const forecastSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    weather_code: z.number(),
  }),
  daily: z.object({
    temperature_2m_max: z.array(z.number()).min(1),
    temperature_2m_min: z.array(z.number()).min(1),
  }),
});

// WMO weather codes, German, kept short so they fit the 5x7 font.
const DESCRIPTIONS: Record<number, string> = {
  0: "KLAR",
  1: "UEBERWIEGEND KLAR",
  2: "LEICHT BEWOELKT",
  3: "BEDECKT",
  45: "NEBEL",
  48: "GEFRIERENDER NEBEL",
  51: "LEICHTER SPRUEHREGEN",
  53: "SPRUEHREGEN",
  55: "STARKER SPRUEHREGEN",
  56: "GEFRIERENDER SPRUEHREGEN",
  57: "GEFRIERENDER SPRUEHREGEN",
  61: "LEICHTER REGEN",
  63: "REGEN",
  65: "STARKER REGEN",
  66: "GEFRIERENDER REGEN",
  67: "GEFRIERENDER REGEN",
  71: "LEICHTER SCHNEEFALL",
  73: "SCHNEEFALL",
  75: "STARKER SCHNEEFALL",
  77: "SCHNEEGRIESEL",
  80: "REGENSCHAUER",
  81: "REGENSCHAUER",
  82: "STARKE REGENSCHAUER",
  85: "SCHNEESCHAUER",
  86: "SCHNEESCHAUER",
  95: "GEWITTER",
  96: "GEWITTER MIT HAGEL",
  99: "GEWITTER MIT HAGEL",
};

export type Weather = {
  location: string;
  temperature: number;
  high: number;
  low: number;
  description: string;
};

/** Deterministic development/offline data; live Open-Meteo data replaces it. */
export function mockWeather(location: Location): Weather {
  if (location.name === WIEN.name) {
    return {
      location: location.name,
      temperature: 22,
      high: 25,
      low: 16,
      description: "LEICHT BEWOELKT",
    };
  }

  return {
    location: location.name,
    temperature: 18,
    high: 21,
    low: 12,
    description: "UEBERWIEGEND KLAR",
  };
}

/** Current conditions from Open-Meteo (no API key needed). */
export async function getWeather(location: Location): Promise<Weather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");

  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: "temperature_2m,weather_code",
    daily: "temperature_2m_max,temperature_2m_min",
    forecast_days: "1",
    timezone: "auto",
  }).toString();

  const response = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    // A wall screen should render its cached/mock page promptly even when an
    // upstream weather service or the local development network is unreachable.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Weather request failed: ${response.status}`);
  }

  const forecast = forecastSchema.parse(await response.json());

  return {
    location: location.name,
    temperature: forecast.current.temperature_2m,
    high: forecast.daily.temperature_2m_max[0],
    low: forecast.daily.temperature_2m_min[0],
    description: DESCRIPTIONS[forecast.current.weather_code] ?? "UNBEKANNT",
  };
}
