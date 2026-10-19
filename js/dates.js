/* Flexible date handling.
 * Dates are stored as text ("1776-07-04", "1776-07", "1776", "500 BC", "-0499-03-01")
 * and converted to a day number (days since 1970-01-01, proleptic Gregorian) for comparison.
 */
window.Dates = (() => {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Howard Hinnant's days-from-civil algorithm (works for any year, including negative).
  function daysFromCivil(y, m, d) {
    y -= m <= 2 ? 1 : 0;
    const era = Math.floor(y / 400);
    const yoe = y - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }

  function civilFromDays(z) {
    z += 719468;
    const era = Math.floor(z / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const y = yoe + era * 400;
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const m = mp + (mp < 10 ? 3 : -9);
    return { y: y + (m <= 2 ? 1 : 0), m, d };
  }

  // Returns {y, m, d, precision} or null. Year 0 = 1 BC (astronomical numbering).
  function parse(input) {
    if (input == null) return null;
    let s = String(input).trim();
    if (!s) return null;
    let era = 1;
    const em = s.match(/^(.*?)\s*(BCE|BC|CE|AD)\.?$/i);
    if (em) { era = /^BC/i.test(em[2]) ? -1 : 1; s = em[1].trim(); }
    let neg = false;
    if (s[0] === '-') { neg = true; s = s.slice(1); }
    const parts = s.split(/[-\/.]/).map(p => p.trim());
    if (parts.length > 3 || !/^\d{1,6}$/.test(parts[0])) return null;
    let y = parseInt(parts[0], 10);
    if (neg) y = -y;
    if (era === -1) y = 1 - y;
    let m = null, d = null;
    if (parts.length >= 2) { if (!/^\d{1,2}$/.test(parts[1])) return null; m = +parts[1]; if (m < 1 || m > 12) return null; }
    if (parts.length === 3) { if (!/^\d{1,2}$/.test(parts[2])) return null; d = +parts[2]; if (d < 1 || d > 31) return null; }
    return { y, m: m || 1, d: d || 1, precision: d ? 'day' : m ? 'month' : 'year' };
  }

  function daysInMonth(y, m) {
    return (m === 12 ? daysFromCivil(y + 1, 1, 1) : daysFromCivil(y, m + 1, 1)) - daysFromCivil(y, m, 1);
  }

  // Day number for a date string. endOfPeriod=true gives the last day of a year/month-precision date.
  function toDays(input, endOfPeriod = false) {
    const p = parse(input);
    if (!p) return null;
    if (!endOfPeriod || p.precision === 'day') return daysFromCivil(p.y, p.m, p.d);
    if (p.precision === 'year') return daysFromCivil(p.y, 12, 31);
    return daysFromCivil(p.y, p.m, daysInMonth(p.y, p.m));
  }

  function yearLabel(y) { return y <= 0 ? `${1 - y} BC` : String(y); }

  function format(days, precision = 'day') {
    if (days == null || !isFinite(days)) return '';
    const c = civilFromDays(Math.round(days));
    if (precision === 'year') return yearLabel(c.y);
    if (precision === 'month') return `${MONTHS[c.m - 1]} ${yearLabel(c.y)}`;
    return `${c.d} ${MONTHS[c.m - 1]} ${yearLabel(c.y)}`;
  }

  // Pretty version of a stored date string, honouring its precision.
  function formatInput(input) {
    const p = parse(input);
    if (!p) return input || '';
    return format(daysFromCivil(p.y, p.m, p.d), p.precision);
  }

  function iso(days) {
    const c = civilFromDays(Math.round(days));
    const pad = (n, l) => String(Math.abs(n)).padStart(l, '0');
    return `${c.y < 0 ? '-' : ''}${pad(c.y, 4)}-${pad(c.m, 2)}-${pad(c.d, 2)}`;
  }

  function today() {
    const n = new Date();
    return daysFromCivil(n.getFullYear(), n.getMonth() + 1, n.getDate());
  }

  function isValid(input) { return !input || !String(input).trim() || parse(input) != null; }

  function addMonths(days, n) {
    const c = civilFromDays(days);
    let m = c.m - 1 + n;
    const y = c.y + Math.floor(m / 12);
    m = ((m % 12) + 12) % 12 + 1;
    const d = Math.min(c.d, daysInMonth(y, m));
    return daysFromCivil(y, m, d);
  }

  // Stored text for a date: "1776-07-04", "1776-07", "1776", or with " BC" for years before 1 AD.
  function toStore(y, m, d, precision) {
    const pad = (n, l) => String(n).padStart(l, '0');
    const core = precision === 'year' ? '' : precision === 'month' ? `-${pad(m, 2)}` : `-${pad(m, 2)}-${pad(d, 2)}`;
    return y <= 0 ? `${1 - y}${core} BC` : `${pad(y, 4)}${core}`;
  }

  // Add an offset (years/months/days, may be negative) to a stored date, keeping the coarser precision
  // unless the offset itself is finer. Returns a stored string, or null if the input is not a date.
  function addOffset(input, off) {
    const p = parse(input);
    if (!p) return null;
    const Y = Math.trunc(+off.years || 0), M = Math.trunc(+off.months || 0), D = Math.trunc(+off.days || 0);
    let precision = p.precision;
    if (M && precision === 'year') precision = 'month';
    if (D) precision = 'day';
    const total = p.y * 12 + (p.m - 1) + Y * 12 + M;
    const y = Math.floor(total / 12), m = total - y * 12 + 1;
    const d = Math.min(p.d, daysInMonth(y, m));
    const c = civilFromDays(daysFromCivil(y, m, d) + D);
    return toStore(c.y, c.m, c.d, precision);
  }

  // Equal at the coarser of the two precisions ("1776" and "1776-07-04" count as the same date).
  function sameDate(a, b) {
    const pa = parse(a), pb = parse(b);
    if (!pa || !pb) return false;
    const rank = { year: 0, month: 1, day: 2 };
    const r = Math.min(rank[pa.precision], rank[pb.precision]);
    if (pa.y !== pb.y) return false;
    if (r >= 1 && pa.m !== pb.m) return false;
    if (r >= 2 && pa.d !== pb.d) return false;
    return true;
  }

  function formatOffset(off, withSign = true) {
    const parts = [];
    const Y = +off.years || 0, M = +off.months || 0, D = +off.days || 0;
    const neg = (Y || M || D) < 0 || (Y === 0 && (M < 0 || (M === 0 && D < 0)));
    if (Y) parts.push(Math.abs(Y) + ' y');
    if (M) parts.push(Math.abs(M) + ' m');
    if (D) parts.push(Math.abs(D) + ' d');
    if (!parts.length) return withSign ? '+ 0' : '0';
    return (withSign ? (neg ? '− ' : '+ ') : '') + parts.join(' ');
  }

  // Midpoint of two stored dates, at the coarser of their precisions.
  function midpoint(a, b) {
    const pa = parse(a), pb = parse(b);
    if (!pa && !pb) return '';
    if (!pa) return b; if (!pb) return a;
    const rank = { year: 0, month: 1, day: 2 };
    const prec = rank[pa.precision] <= rank[pb.precision] ? pa.precision : pb.precision;
    const mid = Math.round((daysFromCivil(pa.y, pa.m, pa.d) + daysFromCivil(pb.y, pb.m, pb.d)) / 2);
    const c = civilFromDays(mid);
    return toStore(c.y, c.m, c.d, prec);
  }
  // Earlier / later of two stored dates (either may be blank).
  function minDate(a, b) { const da = toDays(a), db = toDays(b); if (da == null) return b || ''; if (db == null) return a || ''; return da <= db ? a : b; }
  function maxDate(a, b) { const da = toDays(a, true), db = toDays(b, true); if (da == null) return b || ''; if (db == null) return a || ''; return da >= db ? a : b; }
  // "c. 1736 (1730 – 1744)" for a date with a range; plain date otherwise.
  function formatRange(date, min, max) {
    const hasRange = (min && max) && !(sameDate(min, max) && sameDate(min, date || min));
    if (!hasRange) return date ? formatInput(date) : (min || max ? formatInput(min || max) : '');
    const core = date ? 'c. ' + formatInput(date) : 'between';
    return `${core} (${formatInput(min)} – ${formatInput(max)})`;
  }

  return { parse, toDays, format, formatInput, iso, today, isValid, civilFromDays, daysFromCivil, addMonths, yearLabel, toStore, addOffset, sameDate, formatOffset, midpoint, minDate, maxDate, formatRange };
})();
