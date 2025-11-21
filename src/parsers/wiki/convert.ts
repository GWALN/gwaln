/**
 * @file src/parsers/wiki/convert.ts
 * @description Comprehensive unit conversion based on Wikipedia's Module:Convert/data
 * @author Doğu Abaris <abaris@null.net>
 *
 * This module implements unit conversions based on the data extracted from Wikipedia's
 * [[Module:Convert]] Lua module, which is used by the {{convert}} template.
 * Data extracted from: https://en.wikipedia.org/wiki/Module:Convert/data
 */

interface UnitDefinition {
  name1: string;
  // Singular form
  name2: string;
  // Plural form
  name1_us?: string;
  // US spelling singular (if different from British)
  name2_us?: string;
  // US spelling plural (if different from British)
  symbol: string;
  // Abbreviation/symbol
  scale: number;
  // Scale factor to convert to base unit for this type
  default: string;
  // Default target unit(s) for conversion
  utype: string;
  // Unit type category (length, mass, area, volume, etc.)
}

/**
 * Comprehensive unit definitions extracted from Wikipedia's Module:Convert/data
 * Base units per type:
 * - length: meter (m)
 * - mass: kilogram (kg)
 * - area: square meter (m²)
 * - volume: cubic meter (m³)
 * - speed: meters per second (m/s)
 * - temperature: special handling (Celsius/Fahrenheit/Kelvin)
 * - power: watt (W)
 * - energy: joule (J)
 * - pressure: pascal (Pa)
 * - force: newton (N)
 */
// noinspection JSNonASCIINames
const UNITS: Record<string, UnitDefinition> = {
  // LENGTH UNITS
  // Metric
  km: {
    name1: 'kilometre',
    name2: 'kilometres',
    name1_us: 'kilometer',
    name2_us: 'kilometers',
    symbol: 'km',
    scale: 1000,
    default: 'mi',
    utype: 'length',
  },
  m: {
    name1: 'metre',
    name2: 'metres',
    name1_us: 'meter',
    name2_us: 'meters',
    symbol: 'm',
    scale: 1,
    default: 'ft',
    utype: 'length',
  },
  cm: {
    name1: 'centimetre',
    name2: 'centimetres',
    name1_us: 'centimeter',
    name2_us: 'centimeters',
    symbol: 'cm',
    scale: 0.01,
    default: 'in',
    utype: 'length',
  },
  mm: {
    name1: 'millimetre',
    name2: 'millimetres',
    name1_us: 'millimeter',
    name2_us: 'millimeters',
    symbol: 'mm',
    scale: 0.001,
    default: 'in',
    utype: 'length',
  },
  μm: {
    name1: 'micrometre',
    name2: 'micrometres',
    name1_us: 'micrometer',
    name2_us: 'micrometers',
    symbol: 'μm',
    scale: 0.000001,
    default: 'in',
    utype: 'length',
  },
  nm: {
    name1: 'nanometre',
    name2: 'nanometres',
    name1_us: 'nanometer',
    name2_us: 'nanometers',
    symbol: 'nm',
    scale: 0.000000001,
    default: 'in',
    utype: 'length',
  },

  // Imperial/US
  mi: {
    name1: 'mile',
    name2: 'miles',
    symbol: 'mi',
    scale: 1609.344,
    default: 'km',
    utype: 'length',
  },
  yd: { name1: 'yard', name2: 'yards', symbol: 'yd', scale: 0.9144, default: 'm', utype: 'length' },
  ft: { name1: 'foot', name2: 'feet', symbol: 'ft', scale: 0.3048, default: 'm', utype: 'length' },
  foot: {
    name1: 'foot',
    name2: 'foot',
    symbol: 'ft',
    scale: 0.3048,
    default: 'm',
    utype: 'length',
  },
  in: {
    name1: 'inch',
    name2: 'inches',
    symbol: 'in',
    scale: 0.0254,
    default: 'mm',
    utype: 'length',
  },

  // Nautical
  nmi: {
    name1: 'nautical mile',
    name2: 'nautical miles',
    symbol: 'nmi',
    scale: 1852,
    default: 'km mi',
    utype: 'length',
  },

  // Other
  hand: {
    name1: 'hand',
    name2: 'hands',
    symbol: 'h',
    scale: 0.1016,
    default: 'in cm',
    utype: 'length',
  },
  fathom: {
    name1: 'fathom',
    name2: 'fathoms',
    symbol: 'fathom',
    scale: 1.8288,
    default: 'ft m',
    utype: 'length',
  },
  chain: {
    name1: 'chain',
    name2: 'chains',
    symbol: 'chain',
    scale: 20.1168,
    default: 'ft m',
    utype: 'length',
  },
  furlong: {
    name1: 'furlong',
    name2: 'furlongs',
    symbol: 'furlong',
    scale: 201.168,
    default: 'ft m',
    utype: 'length',
  },
  league: {
    name1: 'league',
    name2: 'leagues',
    symbol: 'league',
    scale: 4828.032,
    default: 'km',
    utype: 'length',
  },

  // Astronomical
  AU: {
    name1: 'astronomical unit',
    name2: 'astronomical units',
    symbol: 'AU',
    scale: 149597870700,
    default: 'km mi',
    utype: 'length',
  },
  ly: {
    name1: 'light-year',
    name2: 'light-years',
    symbol: 'ly',
    scale: 9.4607304725808e15,
    default: 'AU',
    utype: 'length',
  },
  pc: {
    name1: 'parsec',
    name2: 'parsecs',
    symbol: 'pc',
    scale: 3.0856775814671916e16,
    default: 'ly',
    utype: 'length',
  },

  // MASS UNITS
  // Metric
  t: { name1: 'tonne', name2: 'tonnes', symbol: 't', scale: 1000, default: 'LT ST', utype: 'mass' },
  kg: {
    name1: 'kilogram',
    name2: 'kilograms',
    symbol: 'kg',
    scale: 1,
    default: 'lb',
    utype: 'mass',
  },
  g: { name1: 'gram', name2: 'grams', symbol: 'g', scale: 0.001, default: 'oz', utype: 'mass' },
  mg: {
    name1: 'milligram',
    name2: 'milligrams',
    symbol: 'mg',
    scale: 0.000001,
    default: 'gr',
    utype: 'mass',
  },
  μg: {
    name1: 'microgram',
    name2: 'micrograms',
    symbol: 'μg',
    scale: 0.000000001,
    default: 'gr',
    utype: 'mass',
  },

  // Imperial/US
  LT: {
    name1: 'long ton',
    name2: 'long tons',
    symbol: 'long ton',
    scale: 1016.0469088,
    default: 't',
    utype: 'mass',
  },
  ST: {
    name1: 'short ton',
    name2: 'short tons',
    symbol: 'short ton',
    scale: 907.18474,
    default: 't',
    utype: 'mass',
  },
  lb: {
    name1: 'pound',
    name2: 'pounds',
    symbol: 'lb',
    scale: 0.45359237,
    default: 'kg',
    utype: 'mass',
  },
  oz: {
    name1: 'ounce',
    name2: 'ounces',
    symbol: 'oz',
    scale: 0.028349523125,
    default: 'g',
    utype: 'mass',
  },
  st: {
    name1: 'stone',
    name2: 'stone',
    symbol: 'st',
    scale: 6.35029318,
    default: 'lb kg',
    utype: 'mass',
  },
  gr: {
    name1: 'grain',
    name2: 'grains',
    symbol: 'gr',
    scale: 0.00006479891,
    default: 'g',
    utype: 'mass',
  },

  // Troy
  ozt: {
    name1: 'troy ounce',
    name2: 'troy ounces',
    symbol: 'ozt',
    scale: 0.0311034768,
    default: 'oz g',
    utype: 'mass',
  },

  // Other
  carat: {
    name1: 'carat',
    name2: 'carats',
    symbol: 'carat',
    scale: 0.0002,
    default: 'g',
    utype: 'mass',
  },

  // AREA UNITS
  // Metric
  km2: {
    name1: 'square kilometre',
    name2: 'square kilometres',
    name1_us: 'square kilometer',
    name2_us: 'square kilometers',
    symbol: 'km²',
    scale: 1000000,
    default: 'sqmi',
    utype: 'area',
  },
  m2: {
    name1: 'square metre',
    name2: 'square metres',
    name1_us: 'square meter',
    name2_us: 'square meters',
    symbol: 'm²',
    scale: 1,
    default: 'sqft',
    utype: 'area',
  },
  cm2: {
    name1: 'square centimetre',
    name2: 'square centimetres',
    name1_us: 'square centimeter',
    name2_us: 'square centimeters',
    symbol: 'cm²',
    scale: 0.0001,
    default: 'sqin',
    utype: 'area',
  },
  mm2: {
    name1: 'square millimetre',
    name2: 'square millimetres',
    name1_us: 'square millimeter',
    name2_us: 'square millimeters',
    symbol: 'mm²',
    scale: 0.000001,
    default: 'sqin',
    utype: 'area',
  },
  ha: {
    name1: 'hectare',
    name2: 'hectares',
    symbol: 'ha',
    scale: 10000,
    default: 'acre',
    utype: 'area',
  },

  // Imperial/US
  sqmi: {
    name1: 'square mile',
    name2: 'square miles',
    symbol: 'sq mi',
    scale: 2589988.110336,
    default: 'km2',
    utype: 'area',
  },
  sqyd: {
    name1: 'square yard',
    name2: 'square yards',
    symbol: 'sq yd',
    scale: 0.83612736,
    default: 'm2',
    utype: 'area',
  },
  sqft: {
    name1: 'square foot',
    name2: 'square feet',
    symbol: 'sq ft',
    scale: 0.09290304,
    default: 'm2',
    utype: 'area',
  },
  sqin: {
    name1: 'square inch',
    name2: 'square inches',
    symbol: 'sq in',
    scale: 0.00064516,
    default: 'cm2',
    utype: 'area',
  },
  acre: {
    name1: 'acre',
    name2: 'acres',
    symbol: 'acre',
    scale: 4046.8564224,
    default: 'ha',
    utype: 'area',
  },

  // VOLUME UNITS
  // Metric
  km3: {
    name1: 'cubic kilometre',
    name2: 'cubic kilometres',
    name1_us: 'cubic kilometer',
    name2_us: 'cubic kilometers',
    symbol: 'km³',
    scale: 1000000000,
    default: 'cumi',
    utype: 'volume',
  },
  m3: {
    name1: 'cubic metre',
    name2: 'cubic metres',
    name1_us: 'cubic meter',
    name2_us: 'cubic meters',
    symbol: 'm³',
    scale: 1,
    default: 'cuft',
    utype: 'volume',
  },
  cm3: {
    name1: 'cubic centimetre',
    name2: 'cubic centimetres',
    name1_us: 'cubic centimeter',
    name2_us: 'cubic centimeters',
    symbol: 'cm³',
    scale: 0.000001,
    default: 'cuin',
    utype: 'volume',
  },
  mm3: {
    name1: 'cubic millimetre',
    name2: 'cubic millimetres',
    name1_us: 'cubic millimeter',
    name2_us: 'cubic millimeters',
    symbol: 'mm³',
    scale: 0.000000001,
    default: 'cuin',
    utype: 'volume',
  },
  L: {
    name1: 'litre',
    name2: 'litres',
    name1_us: 'liter',
    name2_us: 'liters',
    symbol: 'L',
    scale: 0.001,
    default: 'impgal USgal',
    utype: 'volume',
  },
  l: {
    name1: 'litre',
    name2: 'litres',
    name1_us: 'liter',
    name2_us: 'liters',
    symbol: 'l',
    scale: 0.001,
    default: 'impgal USgal',
    utype: 'volume',
  },
  ml: {
    name1: 'millilitre',
    name2: 'millilitres',
    name1_us: 'milliliter',
    name2_us: 'milliliters',
    symbol: 'ml',
    scale: 0.000001,
    default: 'impoz usoz',
    utype: 'volume',
  },
  cc: {
    name1: 'cubic centimetre',
    name2: 'cubic centimetres',
    symbol: 'cc',
    scale: 0.000001,
    default: 'cuin',
    utype: 'volume',
  },

  // Imperial/US
  cumi: {
    name1: 'cubic mile',
    name2: 'cubic miles',
    symbol: 'cu mi',
    scale: 4168181825.44058,
    default: 'km3',
    utype: 'volume',
  },
  cuyd: {
    name1: 'cubic yard',
    name2: 'cubic yards',
    symbol: 'cu yd',
    scale: 0.764554857984,
    default: 'm3',
    utype: 'volume',
  },
  cuft: {
    name1: 'cubic foot',
    name2: 'cubic feet',
    symbol: 'cu ft',
    scale: 0.028316846592,
    default: 'm3',
    utype: 'volume',
  },
  cuin: {
    name1: 'cubic inch',
    name2: 'cubic inches',
    symbol: 'cu in',
    scale: 0.000016387064,
    default: 'cm3',
    utype: 'volume',
  },
  impgal: {
    name1: 'imperial gallon',
    name2: 'imperial gallons',
    symbol: 'imp gal',
    scale: 0.00454609,
    default: 'l',
    utype: 'volume',
  },
  USgal: {
    name1: 'US gallon',
    name2: 'US gallons',
    symbol: 'US gal',
    scale: 0.003785411784,
    default: 'l',
    utype: 'volume',
  },
  imppt: {
    name1: 'imperial pint',
    name2: 'imperial pints',
    symbol: 'imp pt',
    scale: 0.00056826125,
    default: 'L',
    utype: 'volume',
  },
  USpt: {
    name1: 'US pint',
    name2: 'US pints',
    symbol: 'US pt',
    scale: 0.000473176473,
    default: 'L',
    utype: 'volume',
  },
  impoz: {
    name1: 'imperial fluid ounce',
    name2: 'imperial fluid ounces',
    symbol: 'imp fl oz',
    scale: 0.0000284130625,
    default: 'ml USoz',
    utype: 'volume',
  },
  USoz: {
    name1: 'US fluid ounce',
    name2: 'US fluid ounces',
    symbol: 'US fl oz',
    scale: 0.0000295735295625,
    default: 'ml',
    utype: 'volume',
  },

  // SPEED UNITS
  'km/h': {
    name1: 'kilometre per hour',
    name2: 'kilometres per hour',
    symbol: 'km/h',
    scale: 0.277777778,
    default: 'mph',
    utype: 'speed',
  },
  mph: {
    name1: 'mile per hour',
    name2: 'miles per hour',
    symbol: 'mph',
    scale: 0.44704,
    default: 'km/h',
    utype: 'speed',
  },
  'm/s': {
    name1: 'metre per second',
    name2: 'metres per second',
    symbol: 'm/s',
    scale: 1,
    default: 'ft/s',
    utype: 'speed',
  },
  'ft/s': {
    name1: 'foot per second',
    name2: 'feet per second',
    symbol: 'ft/s',
    scale: 0.3048,
    default: 'm/s',
    utype: 'speed',
  },
  'km/s': {
    name1: 'kilometre per second',
    name2: 'kilometres per second',
    symbol: 'km/s',
    scale: 1000,
    default: 'mi/s',
    utype: 'speed',
  },
  'mi/s': {
    name1: 'mile per second',
    name2: 'miles per second',
    symbol: 'mi/s',
    scale: 1609.344,
    default: 'km/s',
    utype: 'speed',
  },
  kn: {
    name1: 'knot',
    name2: 'knots',
    symbol: 'kn',
    scale: 0.514444444,
    default: 'km/h mph',
    utype: 'speed',
  },

  // TEMPERATURE UNITS
  C: {
    name1: 'degree Celsius',
    name2: 'degrees Celsius',
    symbol: '°C',
    scale: 0,
    default: 'F',
    utype: 'temperature',
  },
  F: {
    name1: 'degree Fahrenheit',
    name2: 'degrees Fahrenheit',
    symbol: '°F',
    scale: 0,
    default: 'C',
    utype: 'temperature',
  },
  K: {
    name1: 'kelvin',
    name2: 'kelvin',
    symbol: 'K',
    scale: 0,
    default: 'C F',
    utype: 'temperature',
  },

  // POWER UNITS
  kW: {
    name1: 'kilowatt',
    name2: 'kilowatts',
    symbol: 'kW',
    scale: 1000,
    default: 'hp',
    utype: 'power',
  },
  W: { name1: 'watt', name2: 'watts', symbol: 'W', scale: 1, default: 'hp', utype: 'power' },
  MW: {
    name1: 'megawatt',
    name2: 'megawatts',
    symbol: 'MW',
    scale: 1000000,
    default: 'hp',
    utype: 'power',
  },
  GW: {
    name1: 'gigawatt',
    name2: 'gigawatts',
    symbol: 'GW',
    scale: 1000000000,
    default: 'hp',
    utype: 'power',
  },
  mW: {
    name1: 'milliwatt',
    name2: 'milliwatts',
    symbol: 'mW',
    scale: 0.001,
    default: 'hp',
    utype: 'power',
  },
  hp: {
    name1: 'horsepower',
    name2: 'horsepower',
    symbol: 'hp',
    scale: 745.6998715822702,
    default: 'kW',
    utype: 'power',
  },
  PS: {
    name1: 'metric horsepower',
    name2: 'metric horsepower',
    symbol: 'PS',
    scale: 735.49875,
    default: 'kW hp',
    utype: 'power',
  },

  // ENERGY UNITS
  J: { name1: 'joule', name2: 'joules', symbol: 'J', scale: 1, default: 'cal', utype: 'energy' },
  kJ: {
    name1: 'kilojoule',
    name2: 'kilojoules',
    symbol: 'kJ',
    scale: 1000,
    default: 'kcal',
    utype: 'energy',
  },
  MJ: {
    name1: 'megajoule',
    name2: 'megajoules',
    symbol: 'MJ',
    scale: 1000000,
    default: 'kWh',
    utype: 'energy',
  },
  GJ: {
    name1: 'gigajoule',
    name2: 'gigajoules',
    symbol: 'GJ',
    scale: 1000000000,
    default: 'kWh',
    utype: 'energy',
  },
  cal: {
    name1: 'calorie',
    name2: 'calories',
    symbol: 'cal',
    scale: 4.184,
    default: 'J',
    utype: 'energy',
  },
  kcal: {
    name1: 'kilocalorie',
    name2: 'kilocalories',
    symbol: 'kcal',
    scale: 4184,
    default: 'kJ',
    utype: 'energy',
  },
  eV: {
    name1: 'electronvolt',
    name2: 'electronvolts',
    symbol: 'eV',
    scale: 1.602176634e-19,
    default: 'J',
    utype: 'energy',
  },
  Wh: {
    name1: 'watt-hour',
    name2: 'watt-hours',
    symbol: 'Wh',
    scale: 3600,
    default: 'kJ',
    utype: 'energy',
  },
  kWh: {
    name1: 'kilowatt-hour',
    name2: 'kilowatt-hours',
    symbol: 'kWh',
    scale: 3600000,
    default: 'MJ',
    utype: 'energy',
  },
  MWh: {
    name1: 'megawatt-hour',
    name2: 'megawatt-hours',
    symbol: 'MWh',
    scale: 3600000000,
    default: 'GJ',
    utype: 'energy',
  },
  GWh: {
    name1: 'gigawatt-hour',
    name2: 'gigawatt-hours',
    symbol: 'GWh',
    scale: 3600000000000,
    default: 'TJ',
    utype: 'energy',
  },
  BTU: {
    name1: 'British thermal unit',
    name2: 'British thermal units',
    symbol: 'BTU',
    scale: 1055.05585262,
    default: 'kJ',
    utype: 'energy',
  },

  // PRESSURE UNITS
  Pa: {
    name1: 'pascal',
    name2: 'pascals',
    symbol: 'Pa',
    scale: 1,
    default: 'psi',
    utype: 'pressure',
  },
  kPa: {
    name1: 'kilopascal',
    name2: 'kilopascals',
    symbol: 'kPa',
    scale: 1000,
    default: 'psi',
    utype: 'pressure',
  },
  MPa: {
    name1: 'megapascal',
    name2: 'megapascals',
    symbol: 'MPa',
    scale: 1000000,
    default: 'psi',
    utype: 'pressure',
  },
  GPa: {
    name1: 'gigapascal',
    name2: 'gigapascals',
    symbol: 'GPa',
    scale: 1000000000,
    default: 'psi',
    utype: 'pressure',
  },
  bar: {
    name1: 'bar',
    name2: 'bar',
    symbol: 'bar',
    scale: 100000,
    default: 'psi',
    utype: 'pressure',
  },
  mbar: {
    name1: 'millibar',
    name2: 'millibar',
    symbol: 'mbar',
    scale: 100,
    default: 'psi',
    utype: 'pressure',
  },
  atm: {
    name1: 'atmosphere',
    name2: 'atmospheres',
    symbol: 'atm',
    scale: 101325,
    default: 'kPa',
    utype: 'pressure',
  },
  psi: {
    name1: 'pound per square inch',
    name2: 'pounds per square inch',
    symbol: 'psi',
    scale: 6894.757293168,
    default: 'kPa',
    utype: 'pressure',
  },
  torr: {
    name1: 'torr',
    name2: 'torr',
    symbol: 'torr',
    scale: 133.322368421,
    default: 'kPa',
    utype: 'pressure',
  },
  mmHg: {
    name1: 'millimetre of mercury',
    name2: 'millimetres of mercury',
    symbol: 'mmHg',
    scale: 133.322387415,
    default: 'kPa',
    utype: 'pressure',
  },
  inHg: {
    name1: 'inch of mercury',
    name2: 'inches of mercury',
    symbol: 'inHg',
    scale: 3386.388640341,
    default: 'kPa',
    utype: 'pressure',
  },

  // FORCE UNITS
  N: { name1: 'newton', name2: 'newtons', symbol: 'N', scale: 1, default: 'lbf', utype: 'force' },
  kN: {
    name1: 'kilonewton',
    name2: 'kilonewtons',
    symbol: 'kN',
    scale: 1000,
    default: 'lbf',
    utype: 'force',
  },
  MN: {
    name1: 'meganewton',
    name2: 'meganewtons',
    symbol: 'MN',
    scale: 1000000,
    default: 'lbf',
    utype: 'force',
  },
  lbf: {
    name1: 'pound-force',
    name2: 'pounds-force',
    symbol: 'lbf',
    scale: 4.4482216152605,
    default: 'N',
    utype: 'force',
  },
  kgf: {
    name1: 'kilogram-force',
    name2: 'kilograms-force',
    symbol: 'kgf',
    scale: 9.80665,
    default: 'N lbf',
    utype: 'force',
  },

  // DATA STORAGE UNITS (no conversion, just formatting)
  B: { name1: 'byte', name2: 'bytes', symbol: 'B', scale: 1, default: '', utype: 'data' },
  KB: { name1: 'kilobyte', name2: 'kilobytes', symbol: 'KB', scale: 1, default: '', utype: 'data' },
  MB: { name1: 'megabyte', name2: 'megabytes', symbol: 'MB', scale: 1, default: '', utype: 'data' },
  GB: { name1: 'gigabyte', name2: 'gigabytes', symbol: 'GB', scale: 1, default: '', utype: 'data' },
  TB: { name1: 'terabyte', name2: 'terabytes', symbol: 'TB', scale: 1, default: '', utype: 'data' },
  PB: { name1: 'petabyte', name2: 'petabytes', symbol: 'PB', scale: 1, default: '', utype: 'data' },

  // Binary prefixes
  KiB: {
    name1: 'kibibyte',
    name2: 'kibibytes',
    symbol: 'KiB',
    scale: 1,
    default: '',
    utype: 'data',
  },
  MiB: {
    name1: 'mebibyte',
    name2: 'mebibytes',
    symbol: 'MiB',
    scale: 1,
    default: '',
    utype: 'data',
  },
  GiB: {
    name1: 'gibibyte',
    name2: 'gibibytes',
    symbol: 'GiB',
    scale: 1,
    default: '',
    utype: 'data',
  },
  TiB: {
    name1: 'tebibyte',
    name2: 'tebibytes',
    symbol: 'TiB',
    scale: 1,
    default: '',
    utype: 'data',
  },
  PiB: {
    name1: 'pebibyte',
    name2: 'pebibytes',
    symbol: 'PiB',
    scale: 1,
    default: '',
    utype: 'data',
  },

  // TIME UNITS
  s: { name1: 'second', name2: 'seconds', symbol: 's', scale: 1, default: 'min', utype: 'time' },
  min: { name1: 'minute', name2: 'minutes', symbol: 'min', scale: 60, default: 's', utype: 'time' },
  h: { name1: 'hour', name2: 'hours', symbol: 'h', scale: 3600, default: 'min', utype: 'time' },
  d: { name1: 'day', name2: 'days', symbol: 'd', scale: 86400, default: 'h', utype: 'time' },
  week: {
    name1: 'week',
    name2: 'weeks',
    symbol: 'week',
    scale: 604800,
    default: 'd',
    utype: 'time',
  },
  year: {
    name1: 'year',
    name2: 'years',
    symbol: 'year',
    scale: 31557600,
    default: 'd',
    utype: 'time',
  },
  ms: {
    name1: 'millisecond',
    name2: 'milliseconds',
    symbol: 'ms',
    scale: 0.001,
    default: 's',
    utype: 'time',
  },
  μs: {
    name1: 'microsecond',
    name2: 'microseconds',
    symbol: 'μs',
    scale: 0.000001,
    default: 'ms',
    utype: 'time',
  },
  ns: {
    name1: 'nanosecond',
    name2: 'nanoseconds',
    symbol: 'ns',
    scale: 0.000000001,
    default: 'μs',
    utype: 'time',
  },

  // FREQUENCY UNITS
  Hz: {
    name1: 'hertz',
    name2: 'hertz',
    symbol: 'Hz',
    scale: 1,
    default: 'rpm',
    utype: 'frequency',
  },
  kHz: {
    name1: 'kilohertz',
    name2: 'kilohertz',
    symbol: 'kHz',
    scale: 1000,
    default: 'Hz',
    utype: 'frequency',
  },
  MHz: {
    name1: 'megahertz',
    name2: 'megahertz',
    symbol: 'MHz',
    scale: 1000000,
    default: 'Hz',
    utype: 'frequency',
  },
  GHz: {
    name1: 'gigahertz',
    name2: 'gigahertz',
    symbol: 'GHz',
    scale: 1000000000,
    default: 'Hz',
    utype: 'frequency',
  },
  rpm: {
    name1: 'revolution per minute',
    name2: 'revolutions per minute',
    symbol: 'rpm',
    scale: 0.016666666666666666,
    default: 'Hz',
    utype: 'frequency',
  },
};

interface ConvertParams {
  value: number;
  unit: string;
  abbr?: boolean;
  disp?: string;
  lk?: string;
  [key: string]: string | number | boolean | undefined;
}

function parseParams(params: string[]): ConvertParams {
  const result: ConvertParams = {
    value: 0,
    unit: '',
  };

  params.forEach((param, index) => {
    const trimmed = param.trim();
    if (trimmed.includes('=')) {
      const eqIndex = trimmed.indexOf('=');
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();

      if (key === 'abbr' && value === 'on') {
        result.abbr = true;
      } else if (key === 'abbr' && value === 'off') {
        result.abbr = false;
      } else {
        result[key] = value;
      }
    } else {
      if (index === 0) {
        const num = parseFloat(trimmed);
        if (!isNaN(num)) {
          result.value = num;
        }
      } else if (index === 1) {
        result.unit = trimmed;
      }
    }
  });

  return result;
}

function roundToSignificantFigures(num: number, sig: number = 2): number {
  if (num === 0) return 0;
  const mult = Math.pow(10, sig - Math.floor(Math.log10(Math.abs(num))) - 1);
  return Math.round(num * mult) / mult;
}

function convertTemperature(value: number, fromUnit: string, toUnit: string): number {
  const from = fromUnit.toUpperCase();
  const to = toUnit.toUpperCase();

  let celsius: number;
  if (from === '°C' || from === 'C') {
    celsius = value;
  } else if (from === '°F' || from === 'F') {
    celsius = ((value - 32) * 5) / 9;
  } else if (from === 'K') {
    celsius = value - 273.15;
  } else {
    return value;
  }

  if (to === '°C' || to === 'C') {
    return celsius;
  } else if (to === '°F' || to === 'F') {
    return (celsius * 9) / 5 + 32;
  } else if (to === 'K') {
    return celsius + 273.15;
  }

  return value;
}

function convertValue(value: number, fromUnit: UnitDefinition, toUnit: UnitDefinition): number {
  if (fromUnit.utype === 'temperature') {
    return convertTemperature(value, fromUnit.symbol, toUnit.symbol);
  }

  const baseValue = value * fromUnit.scale;
  return baseValue / toUnit.scale;
}

function getUnitName(unit: UnitDefinition, count: number, useUsSpelling: boolean): string {
  if (count === 1) {
    return useUsSpelling && unit.name1_us ? unit.name1_us : unit.name1;
  }
  return useUsSpelling && unit.name2_us ? unit.name2_us : unit.name2;
}

export function convertUnits(params: string[], templateName: string = 'convert'): string {
  if (!params || params.length < 2) {
    return params[0] || '';
  }

  const parsed = parseParams(params);
  const { value, unit, sp } = parsed;
  let { abbr } = parsed;

  const useUsSpelling = sp === 'us';

  if (templateName === 'cvt' && abbr === undefined) {
    abbr = true;
  }

  if (value === undefined || !unit) {
    return '';
  }

  let unitKey = unit.toLowerCase();
  let sourceUnit = UNITS[unitKey];

  if (!sourceUnit) {
    unitKey = unit;
    sourceUnit = UNITS[unitKey];
  }

  if (!sourceUnit) {
    return `${value} ${unit}`;
  }

  if (sourceUnit.utype === 'data' && !sourceUnit.default) {
    return `${value} ${sourceUnit.symbol}`;
  }

  const targetUnits = sourceUnit.default
    .split(' ')
    .filter((u) => u && u !== 'and' && !u.includes('>') && !u.includes('!'));

  if (targetUnits.length === 0) {
    return `${value} ${sourceUnit.symbol}`;
  }

  const targetUnitKey = targetUnits[0].toLowerCase();
  let targetUnit = UNITS[targetUnitKey];

  if (!targetUnit) {
    targetUnit = UNITS[targetUnits[0]];
  }

  if (!targetUnit) {
    return `${value} ${sourceUnit.symbol}`;
  }

  const converted = convertValue(value, sourceUnit, targetUnit);
  const roundedConverted = roundToSignificantFigures(converted, 2);

  const sourceLabel =
    abbr === true ? sourceUnit.symbol : getUnitName(sourceUnit, value, useUsSpelling);
  const targetLabel = targetUnit.symbol;

  return `${value} ${sourceLabel} (${roundedConverted} ${targetLabel})`;
}
