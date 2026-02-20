import NepaliDate from 'nepali-date-converter';

/** Nepali months (Bikram Sambat), index 0–11 = Baisakh … Chaitra */
export const NEPALI_MONTHS = ['बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज', 'कार्तिक', 'मंसिर', 'पुष', 'माघ', 'फागुन', 'चैत'];

/** Nepali month names in English (for formatting) */
export const NEPALI_MONTHS_EN = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Aswin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

const NEPALI_DIGITS = '०१२३४५६७८९';

/**
 * Convert ASCII digits in a string or number to Nepali (Devanagari) numerals.
 * Preserves commas, periods, and other separators from toLocaleString().
 * @param {string|number} v
 * @returns {string} e.g. 50000 -> "५०,०००" (with en locale)
 */
export const toNepaliNumerals = (v) => {
  if (v == null || v === '') return '';
  const s = String(typeof v === 'number' ? Number(v).toLocaleString('en-US') : v);
  return s.replace(/[0-9]/g, (d) => NEPALI_DIGITS[Number(d)]);
};

/**
 * Convert AD month (1–12) and year to Nepali period string.
 * @param {number} adMonth - 1–12
 * @param {number} adYear
 * @param {'en'|'np'} lang - 'np' for Devanagari
 * @returns {string} e.g. "Magh 2081" or "माघ २०८१"
 */
export const formatPeriodToNepali = (adMonth, adYear, lang = 'en') => {
  if (!adMonth || !adYear) return '';
  try {
    const jsDate = new Date(adYear, adMonth - 1, 15);
    const nd = new NepaliDate(jsDate);
    return nd.format('MMMM YYYY', lang === 'np' ? 'np' : 'en');
  } catch (e) {
    return `${adMonth}/${adYear}`;
  }
};

/**
 * Convert Nepali (BS) year and month index (0–11) to AD month (1–12) and year.
 * @param {number} bsYear
 * @param {number} nepaliMonthIndex - 0–11 (Baisakh–Chaitra)
 * @returns {{ month: number, year: number }}
 */
export const nepaliPeriodToAD = (bsYear, nepaliMonthIndex) => {
  const nd = new NepaliDate(bsYear, nepaliMonthIndex, 15);
  const js = nd.toJsDate();
  return { month: js.getMonth() + 1, year: js.getFullYear() };
};

/**
 * Get current BS year and a range for dropdowns.
 * @returns {number[]} e.g. [2082, 2081, 2080, 2079, 2078, 2077]
 */
export const getNepaliYearRange = () => {
  const current = new NepaliDate().getYear();
  return [current + 1, current, current - 1, current - 2, current - 3, current - 4, current - 5];
};

/**
 * Formats a date string to Nepali (Bikram Sambat) format
 * @param {string} dateString - Date string in format YYYY-MM-DD or ISO format
 * @returns {string} Formatted date in Nepali format (e.g., "Magh 02, 2081")
 */
export const formatDateToNepali = (dateString) => {
  if (!dateString) return '';
  
  try {
    // Create a JavaScript Date object from the date string
    const jsDate = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(jsDate.getTime())) {
      console.error('Invalid date:', dateString);
      return dateString; // Return original string if invalid
    }
    
    // Create NepaliDate object from JavaScript Date (automatically converts AD to BS)
    const nepaliDate = new NepaliDate(jsDate);
    
    // Format: "Month Day, Year" in English month names with Nepali year
    // Format options: 'MMMM DD, YYYY' for English month names
    return nepaliDate.format('MMMM DD, YYYY');
  } catch (error) {
    console.error('Error formatting date to Nepali:', error);
    // Fallback to original date if conversion fails
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (fallbackError) {
      return dateString; // Return original string if all else fails
    }
  }
};

/**
 * Formats a date string to Nepali (Bikram Sambat) format with Nepali numerals and Devanagari script
 * @param {string} dateString - Date string in format YYYY-MM-DD or ISO format
 * @returns {string} Formatted date in Nepali format with Nepali numerals (e.g., "माघ २, २०८१")
 */
export const formatDateToNepaliWithNepaliNumerals = (dateString) => {
  if (!dateString) return '';
  
  try {
    // Create a JavaScript Date object from the date string
    const jsDate = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(jsDate.getTime())) {
      console.error('Invalid date:', dateString);
      return dateString; // Return original string if invalid
    }
    
    // Create NepaliDate object from JavaScript Date (automatically converts AD to BS)
    const nepaliDate = new NepaliDate(jsDate);
    
    // Format: "Month Day, Year" in Nepali with Nepali numerals (Devanagari)
    // 'np' language parameter formats in Devanagari script
    return nepaliDate.format('MMMM DD, YYYY', 'np');
  } catch (error) {
    console.error('Error formatting date to Nepali:', error);
    // Fallback to original date if conversion fails
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (fallbackError) {
      return dateString; // Return original string if all else fails
    }
  }
};
