import re


COUNTRY_KEYWORDS = {
    # Middle East
    "Iran": ["iran", "tehran", "isfahan", "tabriz", "mashhad", "shiraz", "ahvaz", "iranian",
             "irgc", "revolutionary guard", "khamenei", "chaharmahal", "bakhtiari",
             "kohgiluyeh", "boyer-ahmad", "persian"],
    "Israel": ["israel", "tel aviv", "jerusalem", "haifa", "netanya", "beersheba", "israeli",
               "idf", "negev", "dimona", "ashkelon", "sderot", "beit hakfah", "beit shemesh",
               "rishon", "herzliya", "ramat gan", "petah tikva", "holon", "bat yam",
               "nahariya", "acre", "tiberias", "rehovot", "modi'in"],
    "Gaza": ["gaza", "rafah", "khan yunis", "beit lahiya", "jabalia", "deir al-balah",
             "hamas", "al-qassam", "qassam", "izz ad-din"],
    "Lebanon": ["lebanon", "beirut", "tyre", "sidon", "tripoli", "baalbek", "lebanese",
                "hezbollah", "hizballah", "islamic resistance in lebanon", "south lebanon"],
    "Syria": ["syria", "damascus", "aleppo", "homs", "idlib", "deir ez-zor", "raqqa",
              "latakia", "syrian", "tartus"],
    "Yemen": ["yemen", "sanaa", "aden", "hodeidah", "taiz", "marib", "yemeni",
              "houthi", "houthis", "ansarallah", "ansar allah"],
    "Iraq": ["iraq", "baghdad", "basra", "mosul", "erbil", "kirkuk", "fallujah",
             "ramadi", "iraqi", "pmu", "popular mobilization"],
    "Bahrain": ["bahrain", "manama", "bahraini", "nsf5", "fifth fleet"],
    "Jordan": ["jordan", "amman", "zarqa", "jordanian", "aqaba"],
    "Saudi Arabia": ["saudi arabia", "riyadh", "jeddah", "mecca", "medina", "saudi",
                     "aramco", "neom"],
    "Kuwait": ["kuwait", "kuwait city", "kuwaiti", "kuwait petroleum", "shuwaikh"],
    "Egypt": ["egypt", "cairo", "alexandria", "sinai", "egyptian", "suez"],
    "Turkey": ["turkey", "ankara", "istanbul", "izmir", "turkish", "erdogan"],
    "Qatar": ["qatar", "doha", "qatari", "al udeid"],
    "UAE": ["uae", "dubai", "abu dhabi", "united arab emirates", "emirati"],
    "Pakistan": ["pakistan", "islamabad", "karachi", "lahore", "peshawar", "pakistani"],
    "Afghanistan": ["afghanistan", "kabul", "kandahar", "helmand", "afghan", "taliban"],
    # Eastern Europe
    "Ukraine": ["ukraine", "kyiv", "kiev", "kharkiv", "odesa", "odessa", "lviv",
                "zaporizhzhia", "mariupol", "kherson", "mykolaiv", "dnipro", "sumy", "ukrainian"],
    "Russia": ["russia", "moscow", "belgorod", "kursk", "rostov", "st petersburg",
               "bryansk", "voronezh", "saratov", "russian", "kremlin", "putin"],
    "Belarus": ["belarus", "minsk", "belarusian", "lukashenko"],
    "Moldova": ["moldova", "chisinau", "transnistria"],
    "Georgia": ["georgia", "tbilisi", "abkhazia", "south ossetia"],
    # Asia-Pacific
    "China": ["china", "beijing", "shanghai", "hong kong", "chinese", "pla", "xi jinping"],
    "Taiwan": ["taiwan", "taipei", "kaohsiung", "taiwanese"],
    "North Korea": ["north korea", "pyongyang", "dprk", "kim jong", "korean peninsula"],
    "South Korea": ["south korea", "seoul", "busan"],
    "Japan": ["japan", "tokyo", "osaka", "japanese"],
    "India": ["india", "new delhi", "mumbai", "kashmir", "indian", "modi"],
    "Myanmar": ["myanmar", "burma", "naypyidaw", "yangon", "rakhine"],
    # Africa
    "Sudan": ["sudan", "khartoum", "darfur", "sudanese", "rsf"],
    "Somalia": ["somalia", "mogadishu", "al-shabaab", "somali"],
    "Ethiopia": ["ethiopia", "addis ababa", "tigray", "amhara", "ethiopian"],
    "Mali": ["mali", "bamako", "malian"],
    "Niger": ["niger", "niamey"],
    "Libya": ["libya", "tripoli", "benghazi", "libyan"],
    "Nigeria": ["nigeria", "abuja", "boko haram", "nigerian"],
    "DRC": ["congo", "drc", "kinshasa", "goma", "m23"],
    # Americas
    "United States": ["trump", "white house", "pentagon", "washington d.c", "washington dc",
                      "us president", "american president", "secretary of state",
                      "centcom", "us military", "us forces", "american forces",
                      "us navy", "us air force", "us army", "f-15e", "f-15",
                      "black hawk", "pave hawk", "csar", "us pilots", "us pilot",
                      "truth social", "25th amendment"],
    "Venezuela": ["venezuela", "caracas", "venezuelan", "maduro"],
    "Colombia": ["colombia", "bogota", "colombian", "farc"],
    "Haiti": ["haiti", "port-au-prince", "haitian"],
}

WEAPON_KEYWORDS = {
    "ballistic_missile": [
        "ballistic missile", "ballistic missiles", "icbm", "irbm", "mrbm", "srbm",
        "scud", "iskander", "hwasong", "shahab", "fateh", "zolfaghar",
        "kinzhal", "hypersonic missile", "fattah",
    ],
    "cruise_missile": [
        "cruise missile", "cruise missiles", "kalibr", "tomahawk", "storm shadow",
        "scalp", "taurus", "kh-101", "kh-55", "kh-22", "x-101", "jassm", "jassm-er",
    ],
    "uav": [
        "uav", "uavs", "drone", "drones", "unmanned aerial", "quadcopter",
        "fpv drone", "reconnaissance drone", "tb2", "bayraktar", "mohajer",
        "ababil", "wing loong", "akinci", "suicide drone",
    ],
    "loitering_munition": [
        "loitering munition", "loitering munitions", "shahed", "shahed-136",
        "shahed-131", "geran", "kamikaze drone", "switchblade", "lancet",
        "harpy", "harop", "warmate",
    ],
    "rocket": [
        "rocket", "rockets", "rocket fire", "rocket attack", "grad", "mlrs",
        "himars", "m270", "uragan", "smerch", "fajr", "qassam", "mortar",
    ],
    "artillery": [
        "artillery", "shelling", "howitzer", "cannon fire", "d-30", "d-20",
        "m777", "caesar", "pzh 2000", "m109", "2s19", "msta", "tube artillery",
        "tank fire", "direct fire",
    ],
    "airstrike": [
        "airstrike", "air strike", "airstrikes", "air strikes", "fighter jet",
        "fighter jets", "f-16", "f-35", "f-15", "f-15e", "su-34", "su-35",
        "mig-29", "su-24", "bombing run", "air raid", "warplane", "jet aircraft",
        "sorties", "combat aircraft",
    ],
    "naval": [
        "naval strike", "missile boat", "warship", "frigate", "destroyer",
        "submarine", "naval drone", "sea drone", "usv", "naval blockade",
    ],
    "ieds": [
        "ied", "ieds", "roadside bomb", "car bomb", "vbied", "improvised explosive",
        "suicide bomb", "suicide vest",
    ],
    "air_defense": [
        "s-300", "s-400", "patriot", "iron dome", "david's sling", "arrow",
        "buk", "tor", "pantsir", "nasams", "iris-t", "c-300", "c-400",
        "manpads", "shoulder-fired", "anti-aircraft missile", "ar-327",
    ],
    "cyber": [
        "cyberattack", "cyber attack", "ddos", "malware", "ransomware",
        "hacking", "data breach", "infrastructure hack",
    ],
    "chemical": [
        "chemical weapon", "chlorine", "sarin", "novichok", "chemical attack",
        "toxic agent", "cbrn",
    ],
    "helicopter": [
        "black hawk", "pave hawk", "uh-60", "hh-60", "apache", "chinook",
        "helicopter", "helicopters", "rotary wing",
    ],
}

CLAIM_STATUS_KEYWORDS = {
    "denied": ["denied", "rejects", "rejected", "denies", "refutes", "false claim", "fabricated"],
    "disputed": ["disputed", "conflicting reports", "contradicts", "unconfirmed by", "contested"],
    "claimed": ["claimed", "claim", "announced", "takes responsibility", "declares"],
    "confirmed": ["confirmed", "verified", "official statement", "acknowledges", "admits"],
    "unverified": ["reportedly", "unconfirmed", "allegedly", "reports say", "according to sources",
                   "sources claim", "believed to", "appears to", "said to have", "locals tell",
                   "sources tell"],
}

TARGET_TYPE_KEYWORDS = {
    "military_base": ["base", "military base", "airbase", "air base", "barracks", "garrison",
                      "military installation", "weapons depot", "ammo depot", "command post",
                      "fifth fleet", "naval base"],
    "airport": ["airport", "airfield", "runway", "air strip"],
    "energy_infrastructure": ["oil facility", "refinery", "gas field", "power plant", "pipeline",
                               "substation", "energy infrastructure", "oil depot", "fuel depot",
                               "petroleum", "oil sector", "oil complex"],
    "government_building": ["government building", "ministry", "parliament", "presidential",
                             "administrative", "headquarters", "state building"],
    "residential_area": ["residential", "apartment", "neighborhood", "village", "civilian area",
                          "civilian home", "school", "hospital", "market"],
    "port": ["port", "harbor", "harbour", "naval port", "dock"],
    "convoy": ["convoy", "military convoy", "supply convoy", "troop convoy", "vehicle column"],
    "bridge": ["bridge", "crossing", "overpass"],
    "radar": ["radar", "radar station", "air defense radar", "early warning", "early-warning"],
    "naval_vessel": ["warship", "naval vessel", "patrol boat", "frigate", "destroyer", "submarine"],
    "border": ["border crossing", "checkpoint", "border post", "frontier"],
    "aircraft": ["combat aircraft", "fighter jet", "helicopter", "black hawk", "f-15", "f-16"],
}

ACTOR_KEYWORDS = {
    # State actors
    "IRGC": ["irgc", "islamic revolutionary guard", "revolutionary guard", "quds force"],
    "IDF": ["idf", "israeli defense forces", "israeli military", "israeli air force", "iaf"],
    "Russian MoD": ["russian mod", "russian ministry of defense", "russian armed forces",
                    "russian military", "russian army", "russian forces"],
    "Ukrainian Armed Forces": ["ukrainian armed forces", "ukrainian military", "zsu",
                                "ukrainian army", "ukraine forces", "ukrainian air force"],
    "US Military": ["us military", "pentagon", "centcom", "usaf", "us army", "us forces",
                    "american forces", "us navy", "csar", "us air force"],
    "NATO": ["nato", "alliance forces", "nato forces", "mark rutte"],
    "PLA": ["pla", "peoples liberation army", "chinese military", "chinese forces"],
    "Indian Army": ["indian army", "indian military", "indian air force"],
    "Pakistani Military": ["pakistani military", "pakistan army", "ispr"],
    # Non-state / militant
    "Hezbollah": ["hezbollah", "hizballah", "islamic resistance in lebanon"],
    "Houthis": ["houthi", "houthis", "ansarallah", "ansar allah", "yemeni forces"],
    "Hamas": ["hamas", "qassam brigades", "al-qassam", "izz ad-din"],
    "Islamic Jihad": ["islamic jihad", "al-quds brigades"],
    "ISIS": ["isis", "isil", "islamic state", "daesh"],
    "Al-Qaeda": ["al-qaeda", "al qaeda", "aq affiliate"],
    "Wagner/Africa Corps": ["wagner", "africa corps", "pmc wagner", "russian mercenaries"],
    "HTS": ["hts", "hayat tahrir al-sham", "jabhat al-nusra"],
    "RSF": ["rsf", "rapid support forces", "sudanese paramilitaries"],
    "Al-Shabaab": ["al-shabaab", "al shabaab", "harakat al-shabaab"],
    "Kurds/SDF": ["sdf", "ypg", "pkk", "kurdish forces", "syrian democratic forces"],
}

REGION_MAP = {
    "Middle East": ["Iran", "Israel", "Gaza", "Lebanon", "Syria", "Yemen", "Iraq",
                    "Bahrain", "Jordan", "Saudi Arabia", "Kuwait", "Egypt", "Turkey",
                    "Qatar", "UAE"],
    "Eastern Europe": ["Ukraine", "Russia", "Belarus", "Moldova", "Georgia"],
    "Central Asia": ["Afghanistan", "Pakistan"],
    "Asia-Pacific": ["China", "Taiwan", "North Korea", "South Korea", "Japan", "India", "Myanmar"],
    "Africa": ["Sudan", "Somalia", "Ethiopia", "Mali", "Niger", "Libya", "Nigeria", "DRC"],
    "Americas": ["United States", "Venezuela", "Colombia", "Haiti"],
}

COUNTRY_TO_REGION = {
    country: region
    for region, countries in REGION_MAP.items()
    for country in countries
}


def normalize_text(text: str) -> str:
    if not text:
        return ""
    cleaned = text.lower()
    cleaned = cleaned.replace("\n", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def find_first_match(text: str, mapping: dict):
    for label, keywords in mapping.items():
        for keyword in keywords:
            if keyword in text:
                return label, keyword
    return None, None


def find_all_matches(text: str, mapping: dict) -> list:
    found = []
    for label, keywords in mapping.items():
        for keyword in keywords:
            if keyword in text:
                found.append(label)
                break
    return found


def infer_region(country: str | None) -> str | None:
    if not country:
        return None
    return COUNTRY_TO_REGION.get(country)


def classify_message(text: str) -> dict:
    normalized = normalize_text(text)
    matched_terms = []

    country, country_term = find_first_match(normalized, COUNTRY_KEYWORDS)
    if country_term:
        matched_terms.append(country_term)

    weapon_type, weapon_term = find_first_match(normalized, WEAPON_KEYWORDS)
    if weapon_term:
        matched_terms.append(weapon_term)

    claim_status, status_term = find_first_match(normalized, CLAIM_STATUS_KEYWORDS)
    if status_term:
        matched_terms.append(status_term)

    target_type, target_term = find_first_match(normalized, TARGET_TYPE_KEYWORDS)
    if target_term:
        matched_terms.append(target_term)

    actor_primary, actor_term = find_first_match(normalized, ACTOR_KEYWORDS)
    if actor_term:
        matched_terms.append(actor_term)

    # Event domain / type / subtype
    event_domain = None
    event_type = None
    event_subtype = None

    if "intercept" in normalized or "air defense" in normalized or "air defence" in normalized or "shot down" in normalized:
        event_domain = "air_defense"
        event_type = "interception"
        event_subtype = "air_defense_intercept"
    elif "ceasefire" in normalized or "talks" in normalized or "negotiation" in normalized or "mediators" in normalized or "peace deal" in normalized:
        event_domain = "political_diplomatic"
        event_type = "negotiation"
        event_subtype = "ceasefire_talks"
    elif "sanction" in normalized or "sanctions" in normalized:
        event_domain = "political_diplomatic"
        event_type = "sanctions"
        event_subtype = "sanctions_announcement"
    elif "explosion" in normalized or "blast" in normalized or "detonation" in normalized:
        event_domain = "kinetic"
        event_type = "explosion"
        event_subtype = "explosion_report"
    elif "troop" in normalized or "convoy" in normalized or "deployment" in normalized or "mobilization" in normalized:
        event_domain = "kinetic"
        event_type = "movement"
        event_subtype = "troop_movement"
    elif "csar" in normalized or "search and rescue" in normalized or "downed pilot" in normalized or "rescue mission" in normalized:
        event_domain = "kinetic"
        event_type = "csar"
        event_subtype = "csar_operation"
    elif weapon_type == "ballistic_missile":
        event_domain = "kinetic"
        event_type = "launch"
        event_subtype = "ballistic_missile_launch"
    elif weapon_type == "cruise_missile":
        event_domain = "kinetic"
        event_type = "launch"
        event_subtype = "cruise_missile_launch"
    elif weapon_type in ["uav", "loitering_munition"]:
        event_domain = "kinetic"
        event_type = "strike"
        event_subtype = "drone_strike"
    elif weapon_type in ["rocket", "artillery", "airstrike"]:
        event_domain = "kinetic"
        event_type = "strike"
        event_subtype = "fires_report"
    elif weapon_type == "helicopter":
        event_domain = "kinetic"
        event_type = "strike"
        event_subtype = "helicopter_incident"
    elif weapon_type == "naval":
        event_domain = "kinetic"
        event_type = "strike"
        event_subtype = "naval_strike"
    elif weapon_type == "cyber":
        event_domain = "cyber"
        event_type = "attack"
        event_subtype = "cyberattack"
    elif weapon_type == "ieds":
        event_domain = "kinetic"
        event_type = "strike"
        event_subtype = "ied_attack"
    elif "said" in normalized or "stated" in normalized or "announced" in normalized:
        event_domain = "political_diplomatic"
        event_type = "statement"
        event_subtype = "official_statement"

    confidence = "low"
    if country and event_type:
        confidence = "medium"
    if country and event_type and weapon_type:
        confidence = "high"

    return {
        "region": infer_region(country),
        "country": country,
        "event_domain": event_domain,
        "event_type": event_type,
        "event_subtype": event_subtype,
        "weapon_type": weapon_type,
        "target_type": target_type,
        "actor_primary": actor_primary,
        "claim_status": claim_status or "unverified",
        "confidence": confidence,
        "matched_terms": ", ".join(matched_terms) if matched_terms else None,
    }