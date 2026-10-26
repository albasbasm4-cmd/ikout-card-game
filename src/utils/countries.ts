/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Muslim-majority countries whose flags the player can pick. */
export interface Country { code: string; name: string }
export const MUSLIM_COUNTRIES: Country[] = [
  { code: 'sa', name: 'السعودية' }, { code: 'kw', name: 'الكويت' }, { code: 'ae', name: 'الإمارات' },
  { code: 'qa', name: 'قطر' }, { code: 'bh', name: 'البحرين' }, { code: 'om', name: 'عمان' },
  { code: 'iq', name: 'العراق' }, { code: 'jo', name: 'الأردن' }, { code: 'ps', name: 'فلسطين' },
  { code: 'lb', name: 'لبنان' }, { code: 'sy', name: 'سوريا' }, { code: 'ye', name: 'اليمن' },
  { code: 'eg', name: 'مصر' }, { code: 'sd', name: 'السودان' }, { code: 'ly', name: 'ليبيا' },
  { code: 'tn', name: 'تونس' }, { code: 'dz', name: 'الجزائر' }, { code: 'ma', name: 'المغرب' },
  { code: 'mr', name: 'موريتانيا' }, { code: 'so', name: 'الصومال' }, { code: 'dj', name: 'جيبوتي' },
  { code: 'km', name: 'جزر القمر' }, { code: 'tr', name: 'تركيا' }, { code: 'ir', name: 'إيران' },
  { code: 'pk', name: 'باكستان' }, { code: 'af', name: 'أفغانستان' }, { code: 'my', name: 'ماليزيا' },
  { code: 'id', name: 'إندونيسيا' }, { code: 'bn', name: 'بروناي' }, { code: 'bd', name: 'بنغلاديش' },
  { code: 'mv', name: 'المالديف' }, { code: 'kz', name: 'كازاخستان' }, { code: 'uz', name: 'أوزبكستان' },
  { code: 'tm', name: 'تركمانستان' }, { code: 'tj', name: 'طاجيكستان' }, { code: 'kg', name: 'قيرغيزستان' },
  { code: 'az', name: 'أذربيجان' }, { code: 'al', name: 'ألبانيا' }, { code: 'sn', name: 'السنغال' },
  { code: 'gm', name: 'غامبيا' }, { code: 'ml', name: 'مالي' }, { code: 'ne', name: 'النيجر' },
  { code: 'td', name: 'تشاد' }, { code: 'gn', name: 'غينيا' }, { code: 'sl', name: 'سيراليون' },
];
export function countryName(code: string | null): string | null {
  return MUSLIM_COUNTRIES.find(c => c.code === code)?.name ?? null;
}
export function flagUrl(code: string): string {
  return `/assets/flags/${code}.svg`;
}
