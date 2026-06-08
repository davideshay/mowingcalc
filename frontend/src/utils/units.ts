// Unit conversion utilities for metric/imperial display.
// All internal values are stored as metric; these functions convert for display only.

export type DisplayUnits = 'metric' | 'imperial';

/**
 * Convert millimeters to display unit.
 */
export function formatLength(mm: number, units: DisplayUnits): string {
  if (units === 'imperial') {
    const inches = mm / 25.4;
    return `${inches.toFixed(2)} in`;
  }
  return `${mm.toFixed(1)} mm`;
}

/**
 * Convert Celsius to display unit.
 */
export function formatTemp(c: number, units: DisplayUnits): string {
  if (units === 'imperial') {
    const f = c * 9 / 5 + 32;
    return `${Math.round(f)}°F`;
  }
  return `${Math.round(c)}°C`;
}

/**
 * Get the temperature unit symbol.
 */
export function tempUnit(units: DisplayUnits): string {
  return units === 'imperial' ? '°F' : '°C';
}

/**
 * Get the length unit symbol.
 */
export function lengthUnit(units: DisplayUnits): string {
  return units === 'imperial' ? 'in' : 'mm';
}

/**
 * Convert mm to the display number (imperial returns inches).
 */
export function toDisplayLength(mm: number, units: DisplayUnits): number {
  return units === 'imperial' ? mm / 25.4 : mm;
}

/**
 * Convert Celsius to the display number (imperial returns Fahrenheit).
 */
export function toDisplayTemp(c: number, units: DisplayUnits): number {
  return units === 'imperial' ? c * 9 / 5 + 32 : c;
}
