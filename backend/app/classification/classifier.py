import re


COUNTRY_KEYWORDS = {
    "Iran": ["iran", "tehran", "isfahan", "tabriz", "mashhad"],
    "Israel": ["israel", "tel aviv", "jerusalem", "haifa"],
    "Gaza": ["gaza"],
    "Lebanon": ["lebanon", "beirut"],
    "Syria": ["syria", "damascus", "aleppo"],
    "Ukraine": ["ukraine", "kyiv", "kiev", "kharkiv", "odesa", "odessa"],
    "Russia": ["russia", "moscow", "belgorod", "kursk", "rostov"],
    "Yemen": ["yemen", "sanaa", "houthi", "houthis"],
    "Iraq": ["iraq", "baghdad"],
}

WEAPON_KEYWORDS = {
    "ballistic_missile": ["ballistic missile", "ballistic missiles"],
    "cruise_missile": ["cruise missile", "cruise missiles"],
    "uav": ["uav", "uavs", "drone", "drones"],
    "loitering_munition": ["loitering munition", "loitering munitions", "shahed", "kamikaze drone"],
    "rocket": ["rocket", "rockets"],
    "artillery": ["artillery", "shelling", "howitzer"],
    "airstrike": ["airstrike", "air strike", "fighter jet", "fighter jets"],
}

CLAIM_STATUS_KEYWORDS = {
    "denied": ["denied", "rejects", "rejected"],
    "disputed": ["disputed", "conflicting reports"],
    "claimed": ["claimed", "claim", "announced"],
    "unverified": ["reportedly", "unconfirmed", "allegedly", "reports say"],
}

TARGET_TYPE_KEYWORDS = {
    "military_base": ["base", "military base", "airbase", "air base"],
    "airport": ["airport"],
    "energy_infrastructure": ["oil facility", "refinery", "gas field", "power plant"],
    "government_building": ["government building", "ministry"],
    "residential_area": ["residential", "apartment", "neighborhood"],
    "port": ["port", "harbor", "harbour"],
    "convoy": ["convoy"],
}

ACTOR_KEYWORDS = {
    "IRGC": ["irgc", "islamic revolutionary guard corps"],
    "IDF": ["idf", "israeli defense forces"],
    "Hezbollah": ["hezbollah"],
    "Houthis": ["houthi", "houthis"],
    "Russian MoD": ["russian mod", "russian ministry of defense"],
    "Ukrainian Air Force": ["ukrainian air force"],
}


def normalize_text(text: str) -> str:
    if not text:
        return ""
    cleaned = text.lower()
    cleaned = cleaned.replace("\n", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def find_first_match(text: str, mapping: dict[str, list[str]]):
    for label, keywords in mapping.items():
        for keyword in keywords:
            if keyword in text:
                return label, keyword
    return None, None


def infer_region(country: str | None) -> str | None:
    if country in ["Iran", "Israel", "Gaza", "Lebanon", "Syria", "Yemen", "Iraq"]:
        return "Middle East"
    if country in ["Ukraine", "Russia"]:
        return "Eastern Europe"
    return None


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

    event_domain = None
    event_type = None
    event_subtype = None

    if "intercept" in normalized or "air defense" in normalized or "air defence" in normalized:
        event_domain = "air_defense"
        event_type = "interception"
        event_subtype = "air_defense_intercept"
    elif "ceasefire" in normalized or "talks" in normalized or "negotiation" in normalized or "mediators" in normalized:
        event_domain = "political_diplomatic"
        event_type = "negotiation"
        event_subtype = "ceasefire_talks"
    elif "explosion" in normalized or "blast" in normalized:
        event_domain = "kinetic"
        event_type = "explosion"
        event_subtype = "explosion_report"
    elif "troop" in normalized or "convoy" in normalized or "deployment" in normalized:
        event_domain = "kinetic"
        event_type = "movement"
        event_subtype = "troop_movement"
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
        "claim_status": claim_status or "confirmed",
        "confidence": confidence,
        "matched_terms": ", ".join(matched_terms) if matched_terms else None,
    }