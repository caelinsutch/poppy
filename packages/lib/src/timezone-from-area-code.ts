/**
 * US Area Code to Timezone mapping
 *
 * Maps North American area codes to IANA timezone identifiers.
 * This is an approximation - some area codes span multiple timezones,
 * in which case we use the most common timezone for that area code.
 */

// Timezone abbreviations for readability
const ET = "America/New_York"; // Eastern
const CT = "America/Chicago"; // Central
const MT = "America/Denver"; // Mountain
const PT = "America/Los_Angeles"; // Pacific
const AK = "America/Anchorage"; // Alaska
const HI = "Pacific/Honolulu"; // Hawaii
const AT = "America/Puerto_Rico"; // Atlantic (Puerto Rico, Virgin Islands)

/**
 * Map of US area codes to IANA timezone strings
 * This covers the most common US area codes
 */
const areaCodeToTimezone: Record<string, string> = {
  // Eastern Time
  "201": ET, // New Jersey
  "202": ET, // Washington DC
  "203": ET, // Connecticut
  "207": ET, // Maine
  "212": ET, // New York City
  "215": ET, // Philadelphia
  "216": ET, // Cleveland
  "224": ET, // Illinois (Chicago suburbs)
  "225": CT, // Louisiana (Baton Rouge)
  "229": ET, // Georgia
  "231": ET, // Michigan
  "234": ET, // Ohio
  "239": ET, // Florida (Fort Myers)
  "240": ET, // Maryland
  "248": ET, // Michigan
  "251": CT, // Alabama
  "252": ET, // North Carolina
  "253": PT, // Washington
  "254": CT, // Texas
  "256": CT, // Alabama
  "260": ET, // Indiana
  "262": CT, // Wisconsin
  "267": ET, // Pennsylvania
  "269": ET, // Michigan
  "270": CT, // Kentucky
  "272": ET, // Pennsylvania
  "276": ET, // Virginia
  "281": CT, // Texas (Houston)
  "301": ET, // Maryland
  "302": ET, // Delaware
  "303": MT, // Colorado
  "304": ET, // West Virginia
  "305": ET, // Florida (Miami)
  "307": MT, // Wyoming
  "308": CT, // Nebraska
  "309": CT, // Illinois
  "310": PT, // California (Los Angeles)
  "312": CT, // Illinois (Chicago)
  "313": ET, // Michigan (Detroit)
  "314": CT, // Missouri (St. Louis)
  "315": ET, // New York
  "316": CT, // Kansas
  "317": ET, // Indiana
  "318": CT, // Louisiana
  "319": CT, // Iowa
  "320": CT, // Minnesota
  "321": ET, // Florida
  "323": PT, // California (Los Angeles)
  "325": CT, // Texas
  "330": ET, // Ohio
  "331": CT, // Illinois
  "332": ET, // New York
  "334": CT, // Alabama
  "336": ET, // North Carolina
  "337": CT, // Louisiana
  "339": ET, // Massachusetts
  "340": AT, // US Virgin Islands
  "346": CT, // Texas (Houston)
  "347": ET, // New York
  "351": ET, // Massachusetts
  "352": ET, // Florida
  "360": PT, // Washington
  "361": CT, // Texas
  "364": ET, // Kentucky
  "385": MT, // Utah
  "386": ET, // Florida
  "401": ET, // Rhode Island
  "402": CT, // Nebraska
  "404": ET, // Georgia (Atlanta)
  "405": CT, // Oklahoma
  "406": MT, // Montana
  "407": ET, // Florida (Orlando)
  "408": PT, // California (San Jose)
  "409": CT, // Texas
  "410": ET, // Maryland
  "412": ET, // Pennsylvania (Pittsburgh)
  "413": ET, // Massachusetts
  "414": CT, // Wisconsin (Milwaukee)
  "415": PT, // California (San Francisco)
  "417": CT, // Missouri
  "419": ET, // Ohio
  "423": ET, // Tennessee
  "424": PT, // California
  "425": PT, // Washington
  "430": CT, // Texas
  "432": CT, // Texas
  "434": ET, // Virginia
  "435": MT, // Utah
  "440": ET, // Ohio
  "442": PT, // California
  "443": ET, // Maryland
  "445": ET, // Pennsylvania
  "458": PT, // Oregon
  "463": ET, // Indiana
  "469": CT, // Texas (Dallas)
  "470": ET, // Georgia
  "475": ET, // Connecticut
  "478": ET, // Georgia
  "479": CT, // Arkansas
  "480": MT, // Arizona
  "484": ET, // Pennsylvania
  "501": CT, // Arkansas
  "502": ET, // Kentucky
  "503": PT, // Oregon
  "504": CT, // Louisiana (New Orleans)
  "505": MT, // New Mexico
  "507": CT, // Minnesota
  "508": ET, // Massachusetts
  "509": PT, // Washington
  "510": PT, // California (Oakland)
  "512": CT, // Texas (Austin)
  "513": ET, // Ohio (Cincinnati)
  "515": CT, // Iowa
  "516": ET, // New York (Long Island)
  "517": ET, // Michigan
  "518": ET, // New York
  "520": MT, // Arizona
  "530": PT, // California
  "531": CT, // Nebraska
  "534": CT, // Wisconsin
  "539": CT, // Oklahoma
  "540": ET, // Virginia
  "541": PT, // Oregon
  "551": ET, // New Jersey
  "559": PT, // California
  "561": ET, // Florida
  "562": PT, // California
  "563": CT, // Iowa
  "567": ET, // Ohio
  "570": ET, // Pennsylvania
  "571": ET, // Virginia
  "573": CT, // Missouri
  "574": ET, // Indiana
  "575": MT, // New Mexico
  "580": CT, // Oklahoma
  "585": ET, // New York
  "586": ET, // Michigan
  "601": CT, // Mississippi
  "602": MT, // Arizona (Phoenix)
  "603": ET, // New Hampshire
  "605": CT, // South Dakota
  "606": ET, // Kentucky
  "607": ET, // New York
  "608": CT, // Wisconsin
  "609": ET, // New Jersey
  "610": ET, // Pennsylvania
  "612": CT, // Minnesota (Minneapolis)
  "614": ET, // Ohio (Columbus)
  "615": CT, // Tennessee (Nashville)
  "616": ET, // Michigan
  "617": ET, // Massachusetts (Boston)
  "618": CT, // Illinois
  "619": PT, // California (San Diego)
  "620": CT, // Kansas
  "623": MT, // Arizona
  "626": PT, // California
  "628": PT, // California
  "629": CT, // Tennessee
  "630": CT, // Illinois
  "631": ET, // New York
  "636": CT, // Missouri
  "641": CT, // Iowa
  "646": ET, // New York
  "650": PT, // California
  "651": CT, // Minnesota
  "657": PT, // California
  "659": CT, // Alabama
  "660": CT, // Missouri
  "661": PT, // California
  "662": CT, // Mississippi
  "667": ET, // Maryland
  "669": PT, // California
  "678": ET, // Georgia
  "680": ET, // New York
  "681": ET, // West Virginia
  "682": CT, // Texas
  "689": ET, // Florida
  "701": CT, // North Dakota
  "702": PT, // Nevada (Las Vegas)
  "703": ET, // Virginia
  "704": ET, // North Carolina
  "706": ET, // Georgia
  "707": PT, // California
  "708": CT, // Illinois
  "712": CT, // Iowa
  "713": CT, // Texas (Houston)
  "714": PT, // California
  "715": CT, // Wisconsin
  "716": ET, // New York
  "717": ET, // Pennsylvania
  "718": ET, // New York
  "719": MT, // Colorado
  "720": MT, // Colorado
  "724": ET, // Pennsylvania
  "725": PT, // Nevada
  "726": CT, // Texas
  "727": ET, // Florida
  "731": CT, // Tennessee
  "732": ET, // New Jersey
  "734": ET, // Michigan
  "737": CT, // Texas
  "740": ET, // Ohio
  "743": ET, // North Carolina
  "747": PT, // California
  "754": ET, // Florida
  "757": ET, // Virginia
  "760": PT, // California
  "762": ET, // Georgia
  "763": CT, // Minnesota
  "765": ET, // Indiana
  "769": CT, // Mississippi
  "770": ET, // Georgia
  "772": ET, // Florida
  "773": CT, // Illinois (Chicago)
  "774": ET, // Massachusetts
  "775": PT, // Nevada
  "779": CT, // Illinois
  "781": ET, // Massachusetts
  "785": CT, // Kansas
  "786": ET, // Florida
  "787": AT, // Puerto Rico
  "801": MT, // Utah
  "802": ET, // Vermont
  "803": ET, // South Carolina
  "804": ET, // Virginia
  "805": PT, // California
  "806": CT, // Texas
  "808": HI, // Hawaii
  "810": ET, // Michigan
  "812": ET, // Indiana
  "813": ET, // Florida (Tampa)
  "814": ET, // Pennsylvania
  "815": CT, // Illinois
  "816": CT, // Missouri (Kansas City)
  "817": CT, // Texas (Fort Worth)
  "818": PT, // California
  "828": ET, // North Carolina
  "830": CT, // Texas
  "831": PT, // California
  "832": CT, // Texas (Houston)
  "838": ET, // New York
  "843": ET, // South Carolina
  "845": ET, // New York
  "847": CT, // Illinois
  "848": ET, // New Jersey
  "850": CT, // Florida (Panhandle)
  "854": ET, // South Carolina
  "856": ET, // New Jersey
  "857": ET, // Massachusetts
  "858": PT, // California (San Diego)
  "859": ET, // Kentucky
  "860": ET, // Connecticut
  "862": ET, // New Jersey
  "863": ET, // Florida
  "864": ET, // South Carolina
  "865": ET, // Tennessee
  "870": CT, // Arkansas
  "872": CT, // Illinois
  "878": ET, // Pennsylvania
  "901": CT, // Tennessee (Memphis)
  "903": CT, // Texas
  "904": ET, // Florida (Jacksonville)
  "906": ET, // Michigan
  "907": AK, // Alaska
  "908": ET, // New Jersey
  "909": PT, // California
  "910": ET, // North Carolina
  "912": ET, // Georgia
  "913": CT, // Kansas
  "914": ET, // New York
  "915": MT, // Texas (El Paso)
  "916": PT, // California (Sacramento)
  "917": ET, // New York
  "918": CT, // Oklahoma
  "919": ET, // North Carolina
  "920": CT, // Wisconsin
  "925": PT, // California
  "928": MT, // Arizona
  "929": ET, // New York
  "930": ET, // Indiana
  "931": CT, // Tennessee
  "934": ET, // New York
  "936": CT, // Texas
  "937": ET, // Ohio
  "938": CT, // Alabama
  "940": CT, // Texas
  "941": ET, // Florida
  "947": ET, // Michigan
  "949": PT, // California
  "951": PT, // California
  "952": CT, // Minnesota
  "954": ET, // Florida
  "956": CT, // Texas
  "959": ET, // Connecticut
  "970": MT, // Colorado
  "971": PT, // Oregon
  "972": CT, // Texas (Dallas)
  "973": ET, // New Jersey
  "978": ET, // Massachusetts
  "979": CT, // Texas
  "980": ET, // North Carolina
  "984": ET, // North Carolina
  "985": CT, // Louisiana
  "989": ET, // Michigan
};

export type TimezoneInference = {
  timezone: string;
  source: "inferred";
};

/**
 * Infer timezone from a phone number based on US area code
 *
 * @param phoneNumber - Phone number in various formats (e.g., "+12025551234", "2025551234", "(202) 555-1234")
 * @returns TimezoneInference with timezone and source, or null if cannot be inferred
 */
export function inferTimezoneFromAreaCode(
  phoneNumber: string,
): TimezoneInference | null {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, "");

  // Handle different formats:
  // - 10 digits: area code + 7 digit number (e.g., "2025551234")
  // - 11 digits: 1 + area code + 7 digit number (e.g., "12025551234")
  let areaCode: string;

  if (digits.length === 10) {
    areaCode = digits.substring(0, 3);
  } else if (digits.length === 11 && digits.startsWith("1")) {
    areaCode = digits.substring(1, 4);
  } else {
    // Not a valid US phone number format
    return null;
  }

  const timezone = areaCodeToTimezone[areaCode];

  if (!timezone) {
    return null;
  }

  return {
    timezone,
    source: "inferred",
  };
}

/**
 * Get all supported IANA timezone strings
 * Useful for validation
 */
export function getSupportedTimezones(): string[] {
  return [...new Set(Object.values(areaCodeToTimezone))];
}
